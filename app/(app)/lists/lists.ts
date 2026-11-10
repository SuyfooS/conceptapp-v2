import { getDepartments } from "@db/departments";
import { listPhotosAllowed } from "@db/list-photos";
import {
  getBusinessLists,
  getList,
  getListReadings,
  getListsOn,
  getListTemplate,
  getListTemplates,
  getMyLists,
  getSentLists,
  nextListOpenings,
  type Window,
} from "@db/lists";
import { getPublishedShifts } from "@db/schedule";
import { getColleagues } from "@db/team";
import { isUuid } from "@domain/activity";
import { addDays, dateIn, instantIn } from "@domain/availability";
import { type Department, departmentsOf } from "@domain/departments";
import {
  byUrgency,
  holdsList,
  type ListSummary,
  type ListTemplate,
  listsTally,
  ofDepartment,
  passTargets,
  REOPEN_MINUTES,
  type SendShift,
  SHIFT_DAYS_AHEAD,
  undoDeadline,
  upcomingShifts,
} from "@domain/lists";
import {
  canOpenModule,
  holdsPermission,
  isStaff,
  STAFF_ROLES,
} from "@domain/modules";
import { canWrite } from "@domain/view-as";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import {
  type ListLookups,
  type ListReadOnly,
  type ListScreenData,
  type ListsHomeData,
  type ListsTodayData,
  type ListsView,
  NEW_LIST,
  type SendFormData,
  type SendWay,
  type TemplateEditorData,
  type TemplatePaths,
  type TemplatesScreenData,
} from "./list-types";
import { editorTimes } from "./templates/editor-times";
import {
  placesOf,
  templateEditor,
  templatesScreen,
} from "./templates/templates-data";
import { listsTodayData, overviewWeek } from "./today/today-data";

export const listsPaths = {
  lists: "/lists",
  send: "/lists/send",
  list: (id: string) => `/lists/${id}`,
  home: "/home",
  templates: "/lists/templates",
  today: "/lists/today",
};

/** The template screens' links inside the app; `back` is named in words. */
export function templatePaths(backLabel: string): TemplatePaths {
  return {
    list: listsPaths.templates,
    back: { href: listsPaths.lists, label: backLabel },
    send: listsPaths.send,
  };
}

/**
 * The signed-in person and what they may do with lists, when lists are on for
 * their business and their role reaches them. Null otherwise: the screens then
 * do not exist for them. A view session reads as its role would and writes
 * nothing; it holds no list of its own, so as a manager it reads the
 * business's.
 */
export const listsAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  const manifest = manifestFor("lists");
  if (!member || !membership || !canOpenModule(manifest, enabled, membership)) {
    return null;
  }
  const { role, perms, business } = membership;
  const canManage = holdsPermission(manifest, role, perms, "lists.manage");
  const viewing = member.viewing !== null;
  const view: ListsView = viewing
    ? canManage
      ? "business"
      : "viewOnly"
    : "mine";
  return {
    userId: member.userId,
    businessId: business.id,
    role,
    timeZone: business.place.timeZone,
    place: business.place,
    canManage,
    canSend: canManage || holdsPermission(manifest, role, perms, "lists.send"),
    viewOnly: !canWrite(member.viewing),
    view,
  };
});

type Access = NonNullable<Awaited<ReturnType<typeof listsAccess>>>;

/** The business's departments, once per request; none before the migration. */
const currentDepartments = cache(
  async (businessId: string): Promise<Department[]> => {
    const departments = await getDepartments(businessId);
    return departments === "notYet" ? [] : departments;
  },
);

const currentColleagues = cache((businessId: string) =>
  getColleagues(businessId),
);

async function lookupsFor(businessId: string): Promise<ListLookups> {
  const [departments, colleagues] = await Promise.all([
    currentDepartments(businessId),
    currentColleagues(businessId),
  ]);
  return {
    people: Object.fromEntries(
      colleagues.map((c) => [c.userId, { name: c.name, photo: c.photo }]),
    ),
    departments: Object.fromEntries(departments.map((d) => [d.id, d.name])),
  };
}

/** Days in the business, as instants: from the first one's midnight to the last one's end. */
function daysIn(first: string, last: string, timeZone: string): Window {
  return {
    from: instantIn(first, "00:00", timeZone).toISOString(),
    to: instantIn(addDays(last, 1), "00:00", timeZone).toISOString(),
  };
}

/** Today in the business, as instants: from its midnight to the next. */
function todayIn(now: Date, timeZone: string): Window {
  const today = dateIn(now, timeZone);
  return daysIn(today, today, timeZone);
}

/**
 * The templates the person may send: every live one for whoever sends lists,
 * and otherwise the orders of the departments they are in.
 */
function sendable(
  templates: readonly ListTemplate[],
  access: Access,
  mine: readonly string[],
): ListTemplate[] {
  const live = templates.filter((t) => t.archivedAt === null);
  if (access.canSend) return live;
  return live.filter(
    (t) => t.fromDepartment !== null && mine.includes(t.fromDepartment),
  );
}

async function currentTemplates(businessId: string): Promise<ListTemplate[]> {
  const templates = await getListTemplates(businessId);
  return templates === "notYet" ? [] : templates;
}

/**
 * Lists and the part of it Today shows: the open lists the person holds, most
 * urgent first, those closed today, the orders their departments asked for
 * that wait elsewhere, the business's day for those who manage lists, and how
 * to send one. `sent` is a list they just sent, from the address, while it can
 * still be taken back; `department` the department filter's choice (L5), for
 * someone in more than one: their lists of that department, held or asked for.
 */
export async function currentListsHome(
  sent?: string,
  department?: string,
  passed?: string,
): Promise<ListsHomeData | null> {
  const access = await listsAccess();
  if (!access) return null;
  const { businessId, userId, timeZone } = access;
  const now = new Date();
  const window = todayIn(now, timeZone);
  const [settings, departments, lookups, templates, own, business, justSent] =
    await Promise.all([
      currentModuleSettings("lists"),
      currentDepartments(businessId),
      lookupsFor(businessId),
      // What to send, and for list managers (a view session's too) how
      // many templates there are.
      access.viewOnly && !access.canManage ? [] : currentTemplates(businessId),
      access.view === "mine"
        ? getMyLists(businessId, { userId, role: access.role }, window)
        : null,
      access.canManage ? getBusinessLists(businessId, window) : [],
      sent && isUuid(sent) && !access.viewOnly ? getList(sent) : null,
    ]);
  const timing = {
    remindBeforeMinutes: settings.remindBeforeMinutes,
    lateAfterMinutes: settings.lateAfterMinutes,
  };
  const everyone = business === "notYet" ? [] : business;
  const held = own === null || own === "notYet" ? [] : own.held;
  const shown: ListSummary[] = access.view === "mine" ? held : everyone;
  const mine = departmentsOf(departments, userId, { live: true });
  // The filter, for someone in more than one live department.
  const theirs = departments.filter(
    (d) => d.archivedAt === null && mine.includes(d.id),
  );
  const filter =
    access.view === "mine" && theirs.length > 1
      ? {
          departments: theirs.map((d) => ({ id: d.id, name: d.name })),
          chosen: theirs.some((d) => d.id === department)
            ? (department ?? null)
            : null,
        }
      : null;
  const chosen = filter?.chosen ?? null;
  const kept = (list: ListSummary) =>
    chosen === null || ofDepartment(list, chosen);
  const offered = sendable(templates, access, mine);
  // Whoever sends lists may type one now, with no template at all.
  const send: SendWay | null =
    offered.length === 0 && !access.canSend
      ? null
      : offered.length === 1 && !access.canSend && offered[0]
        ? {
            href: `/lists/send?template=${offered[0].id}`,
            only: offered[0].name,
          }
        : { href: "/lists/send", only: null };
  const taken = justSent === "notYet" ? null : justSent;
  return {
    now: now.toISOString(),
    timeZone,
    timing,
    lookups,
    view: access.view,
    userId,
    open: byUrgency(
      shown.filter((list) => list.status === "open" && kept(list)),
      now,
      timing,
    ),
    closed: shown
      .filter(
        (list) =>
          list.status !== "open" &&
          list.opensAt >= window.from &&
          list.opensAt < window.to &&
          kept(list),
      )
      .sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt)),
    asked: byUrgency(
      own === null || own === "notYet" ? [] : own.asked.filter(kept),
      now,
      timing,
    ),
    filter,
    team: access.canManage
      ? listsTally(
          everyone.filter(
            (list) =>
              list.status === "open" ||
              (list.opensAt >= window.from && list.opensAt < window.to),
          ),
          now,
          timing,
        )
      : null,
    send: access.viewOnly ? null : send,
    // For the undo's five minutes, from the address it came back with; the
    // database takes it back only while nobody has started it
    // (`cancel_unstarted_list`).
    sent:
      taken &&
      taken.status === "open" &&
      taken.sentBy === userId &&
      taken.progress.done === 0 &&
      Date.parse(taken.opensAt) > now.getTime() - REOPEN_MINUTES * 60_000
        ? taken
        : null,
    // A list just passed to a live department of the business, said once.
    passed:
      (passed &&
        departments.find((d) => d.id === passed && d.archivedAt === null)
          ?.name) ||
      null,
    templates: access.canManage
      ? templates.filter((t) => t.archivedAt === null).length
      : null,
  };
}

/** One list on its screen, or null when the person may not read it. */
export async function currentList(
  listId: string,
): Promise<ListScreenData | null> {
  const access = await listsAccess();
  if (!access || !isUuid(listId)) return null;
  const { businessId, userId, timeZone } = access;
  const [list, settings, departments, lookups, colleagues, photos] =
    await Promise.all([
      getList(listId),
      currentModuleSettings("lists"),
      currentDepartments(businessId),
      lookupsFor(businessId),
      currentColleagues(businessId),
      // Asked beside the rest, so a list with a photo item waits for nothing;
      // if it can't be asked, photos wait ("notYet") and the list still opens.
      listPhotosAllowed(businessId).catch((): "notYet" => "notYet"),
    ]);
  if (!list || list === "notYet") return null;
  const now = new Date();
  // Removed departments count: what they already hold stays with their
  // people, as `private.holds_list` and Lists have it.
  const mine = departmentsOf(departments, userId, { live: false });
  const holds = holdsList(list.holder, {
    userId,
    role: access.role,
    departments: mine,
  });
  // Passing it on (L5): whoever holds it or manages lists, to any other live
  // department, its people counted as `private.list_holders` counts them.
  const targets =
    list.status === "open" && !access.viewOnly && (holds || access.canManage)
      ? passTargets(
          departments,
          list.holder,
          new Set(
            colleagues.filter((c) => isStaff(c.role)).map((c) => c.userId),
          ),
        )
      : [];
  // After passing it, they read it still (`private.sees_list`): list
  // managers, its sender, its people (a person, a shift), a department it
  // was with or that asked; someone it reached by their role alone doesn't.
  const stays =
    access.canManage ||
    list.holder.kind !== "role" ||
    list.sentBy === userId ||
    (list.fromDepartment !== null && mine.includes(list.fromDepartment)) ||
    list.passes.some(
      (pass) =>
        mine.includes(pass.toDepartment) ||
        (pass.fromDepartment !== null && mine.includes(pass.fromDepartment)),
    );
  const open = list.status === "open";
  const closed = list.status === "finished" || list.status === "cancelled";
  const readOnly: ListReadOnly | null = access.viewOnly
    ? "viewOnly"
    : list.status !== "open"
      ? list.status
      : holds || access.canManage
        ? null
        : "elsewhere";
  // The undo is whoever closed it, for five minutes; it is not `can.reopen`,
  // which outlasts them.
  const undoUntil = access.viewOnly ? null : undoDeadline(list, userId, now);
  return {
    now: now.toISOString(),
    timeZone,
    timing: {
      remindBeforeMinutes: settings.remindBeforeMinutes,
      lateAfterMinutes: settings.lateAfterMinutes,
    },
    lookups,
    userId,
    list,
    can: {
      fill: open && !access.viewOnly && (holds || access.canManage),
      reopen: !access.viewOnly && closed && access.canManage,
    },
    readOnly,
    undoUntil,
    pass: targets.length > 0 ? { targets, stays } : null,
    photos: { taking: photos },
  };
}

/**
 * Whether the business takes no photos (a demo one): its editors then keep a
 * photo item optional. Asked beside the rest; if it can't be asked, the
 * editor still opens, with a photo item's switch as usual.
 */
function photosClosedIn(businessId: string): Promise<boolean> {
  return listPhotosAllowed(businessId).then(
    (allowed) => allowed === "demo",
    () => false,
  );
}

/**
 * The published shifts a list can go to now, with their active people; null
 * while scheduling is off, when there are none to read.
 */
async function sendShifts(
  businessId: string,
  now: Date,
  timeZone: string,
  active: ReadonlySet<string>,
): Promise<SendShift[] | null> {
  if (!(await currentModules()).includes("scheduling")) return null;
  const today = dateIn(now, timeZone);
  const shifts = await getPublishedShifts(
    businessId,
    today,
    addDays(today, SHIFT_DAYS_AHEAD),
  );
  return upcomingShifts(shifts, now, timeZone).map((shift) => ({
    ...shift,
    // As `send_list` counts them: the shift's people still in the business.
    people: shift.people.filter((id) => active.has(id)),
  }));
}

/**
 * The send screen: the templates the person may send, a list typed now for
 * whoever sends lists, and who to. Null when they may send nothing, or are
 * only viewing.
 */
export async function currentSendForm(
  asked?: string,
): Promise<SendFormData | null> {
  const access = await listsAccess();
  if (!access || access.viewOnly) return null;
  const { businessId, userId, timeZone } = access;
  const now = new Date();
  const [templates, departments, colleagues, photosClosed] = await Promise.all([
    currentTemplates(businessId),
    currentDepartments(businessId),
    currentColleagues(businessId),
    photosClosedIn(businessId),
  ]);
  const offered = sendable(
    templates,
    access,
    departmentsOf(departments, userId, { live: true }),
  );
  const first = offered[0];
  if (!first && !access.canSend) return null;
  // A list goes to someone on the staff, never to an accountant.
  const staff = colleagues.filter((c) => isStaff(c.role));
  const shifts = access.canSend
    ? await sendShifts(
        businessId,
        now,
        timeZone,
        new Set(staff.map((c) => c.userId)),
      )
    : null;
  const initial =
    asked === NEW_LIST && access.canSend
      ? NEW_LIST
      : (offered.find((t) => t.id === asked)?.id ?? first?.id ?? NEW_LIST);
  return {
    now: now.toISOString(),
    timeZone,
    templates: offered.map((t) => ({
      id: t.id,
      name: t.name,
      note: t.note,
      items: t.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        required: item.required,
        unit: item.unit,
        min: item.min,
        max: item.max,
      })),
      recipient: t.recipient,
      fromDepartment: t.fromDepartment,
      quantities: t.asksQuantities
        ? t.items
            .filter((item) => item.kind === "check")
            .map((item) => ({
              id: item.id,
              label: item.label,
              usual: item.defaultQuantity,
            }))
        : [],
    })),
    initial,
    free: access.canSend,
    people: staff.map((c) => ({
      userId: c.userId,
      name: c.name,
      photo: c.photo,
    })),
    departments: departments
      .filter((d) => d.archivedAt === null)
      .map((d) => ({ id: d.id, name: d.name })),
    roles: STAFF_ROLES,
    shifts,
    photosClosed,
  };
}

/**
 * The lists the person sent today, newest first, with the words to show
 * them: "sent today" beside the send screen on a computer.
 */
export async function currentSentToday(): Promise<{
  lists: ListSummary[];
  lookups: ListLookups;
  userId: string;
  timeZone: string;
  now: string;
} | null> {
  const access = await listsAccess();
  if (!access || access.viewOnly) return null;
  const now = new Date();
  const [sent, lookups] = await Promise.all([
    getSentLists(
      access.businessId,
      access.userId,
      todayIn(now, access.timeZone),
    ),
    lookupsFor(access.businessId),
  ]);
  return {
    lists: sent === "notYet" ? [] : sent,
    lookups,
    userId: access.userId,
    timeZone: access.timeZone,
    now: now.toISOString(),
  };
}

/** The scheduling settings' shifts, which a template may go to. */
async function shiftPatterns() {
  return (await currentModuleSettings("scheduling")).shifts;
}

/** Whether Shabbat matters to the business's times: its schedule on and closed on Shabbat. */
async function closedOnShabbat(): Promise<boolean> {
  const [enabled, scheduling] = await Promise.all([
    currentModules(),
    currentModuleSettings("scheduling"),
  ]);
  return enabled.includes("scheduling") && scheduling.closedOnShabbat;
}

/**
 * What the editor works a template's times out with: the business's
 * Shabbat, the coming week's published shifts, its people, and the saved
 * times' next openings as the database will open them.
 */
async function templateTimes(
  access: Access,
  templateId: string | null,
  now: Date,
) {
  const today = dateIn(now, access.timeZone);
  const [closes, enabled, colleagues, openings] = await Promise.all([
    closedOnShabbat(),
    currentModules(),
    currentColleagues(access.businessId),
    templateId === null ? {} : nextListOpenings(access.userId, templateId, now),
  ]);
  const shifts = enabled.includes("scheduling")
    ? await getPublishedShifts(
        access.businessId,
        addDays(today, -1),
        addDays(today, SHIFT_DAYS_AHEAD),
      )
    : [];
  return editorTimes({
    now,
    place: access.place,
    closesOnShabbat: closes,
    shifts,
    // A list goes to someone on the staff, never to an accountant.
    people: colleagues.filter((c) => isStaff(c.role)),
    openings,
  });
}

/**
 * The business's templates on their own screen, for whoever manages lists
 * (a view session as a manager only reads). Null for anyone else.
 */
export async function currentTemplatesScreen(
  removed?: string,
): Promise<TemplatesScreenData | null> {
  const access = await listsAccess();
  if (!access?.canManage) return null;
  const [templates, departments, shifts] = await Promise.all([
    currentTemplates(access.businessId),
    currentDepartments(access.businessId),
    shiftPatterns(),
  ]);
  return templatesScreen({
    templates,
    departments,
    shifts,
    removed,
    readOnly: access.viewOnly,
  });
}

/**
 * One template in its editor, or a new one (`templateId` null), for whoever
 * manages lists. Null when they don't, or it isn't theirs to read.
 */
export async function currentTemplateEditor(
  templateId: string | null,
  changed: boolean,
): Promise<TemplateEditorData | null> {
  const access = await listsAccess();
  if (!access?.canManage) return null;
  if (templateId !== null && !isUuid(templateId)) return null;
  if (templateId === null && access.viewOnly) return null;
  const now = new Date();
  const [template, departments, shifts, times, photosClosed] =
    await Promise.all([
      templateId === null
        ? null
        : getListTemplate(access.businessId, templateId),
      currentDepartments(access.businessId),
      shiftPatterns(),
      templateTimes(access, templateId, now),
      photosClosedIn(access.businessId),
    ]);
  if (template === "notYet" || (templateId !== null && template === null)) {
    return null;
  }
  return templateEditor({
    template,
    departments,
    shifts,
    readOnly: access.viewOnly,
    changed,
    times,
    photosClosed,
  });
}

/**
 * The manager's overview of a day (L4), for whoever manages lists (a view
 * session as a manager only reads): today's lists, late first, then open,
 * closed and missed, with the day's readings and the week's, and the times
 * that open nothing since what they follow is gone; or, for a day of the
 * last week (`asked`), the lists that opened that day. Null for anyone else.
 */
export async function currentListsToday(
  asked?: string,
): Promise<ListsTodayData | null> {
  const access = await listsAccess();
  if (!access?.canManage) return null;
  const { businessId, userId, timeZone } = access;
  const now = new Date();
  const today = dateIn(now, timeZone);
  const week = overviewWeek(today);
  const day = asked && week.includes(asked) ? asked : today;
  const [settings, lookups, inWeek, current, templates, departments, shifts] =
    await Promise.all([
      currentModuleSettings("lists"),
      lookupsFor(businessId),
      getListsOn(businessId, daysIn(week[0] ?? today, today, timeZone)),
      // Today is every list still open, whenever it opened, and today's.
      day === today
        ? getBusinessLists(businessId, todayIn(now, timeZone))
        : null,
      currentTemplates(businessId),
      currentDepartments(businessId),
      shiftPatterns(),
    ]);
  const weekLists = inWeek === "notYet" ? [] : inWeek;
  const todays = current === "notYet" ? [] : current;
  const ids = [
    ...new Set([...weekLists, ...(todays ?? [])].map((list) => list.id)),
  ];
  const readings = await getListReadings(ids);
  return listsTodayData({
    now,
    timeZone,
    timing: {
      remindBeforeMinutes: settings.remindBeforeMinutes,
      lateAfterMinutes: settings.lateAfterMinutes,
    },
    lookups,
    userId,
    day,
    week,
    current: todays,
    weekLists,
    readings: readings === "notYet" ? [] : readings,
    templates,
    places: placesOf(departments, shifts),
    send: access.viewOnly ? null : { href: listsPaths.send, only: null },
    viewOnly: access.viewOnly,
  });
}
