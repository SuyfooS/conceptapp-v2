import { getDepartments } from "@db/departments";
import {
  getBusinessLists,
  getList,
  getListTemplates,
  getMyLists,
  type Window,
} from "@db/lists";
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
  REOPEN_MINUTES,
  undoDeadline,
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
import type {
  ListLookups,
  ListReadOnly,
  ListScreenData,
  ListsHomeData,
  ListsView,
  SendFormData,
  SendWay,
} from "./list-types";

export const listsPaths = {
  lists: "/lists",
  send: "/lists/send",
  list: (id: string) => `/lists/${id}`,
  home: "/home",
};

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
  if (
    !member ||
    !membership ||
    !canOpenModule(manifest, enabled, membership.role)
  ) {
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

/** Today in the business, as instants: from its midnight to the next. */
function todayIn(now: Date, timeZone: string): Window {
  const today = dateIn(now, timeZone);
  return {
    from: instantIn(today, "00:00", timeZone).toISOString(),
    to: instantIn(addDays(today, 1), "00:00", timeZone).toISOString(),
  };
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
 * urgent first, those closed today, the business's day for those who manage
 * lists, and how to send one. `sent` is a list they just sent, from the
 * address, while it can still be taken back.
 */
export async function currentListsHome(
  sent?: string,
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
      access.viewOnly ? [] : currentTemplates(businessId),
      access.view === "mine"
        ? getMyLists(businessId, { userId, role: access.role }, window)
        : [],
      access.canManage ? getBusinessLists(businessId, window) : [],
      sent && isUuid(sent) && !access.viewOnly ? getList(sent) : null,
    ]);
  const timing = {
    remindBeforeMinutes: settings.remindBeforeMinutes,
    lateAfterMinutes: settings.lateAfterMinutes,
  };
  const everyone = business === "notYet" ? [] : business;
  const shown: ListSummary[] =
    access.view === "mine" ? (own === "notYet" ? [] : own) : everyone;
  const mine = departmentsOf(departments, userId, { live: true });
  const offered = sendable(templates, access, mine);
  const send: SendWay | null =
    offered.length === 0
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
      shown.filter((list) => list.status === "open"),
      now,
      timing,
    ),
    closed: shown
      .filter(
        (list) =>
          list.status !== "open" &&
          list.opensAt >= window.from &&
          list.opensAt < window.to,
      )
      .sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt)),
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
  };
}

/** One list on its screen, or null when the person may not read it. */
export async function currentList(
  listId: string,
): Promise<ListScreenData | null> {
  const access = await listsAccess();
  if (!access || !isUuid(listId)) return null;
  const { businessId, userId, timeZone } = access;
  const [list, settings, departments, lookups] = await Promise.all([
    getList(listId),
    currentModuleSettings("lists"),
    currentDepartments(businessId),
    lookupsFor(businessId),
  ]);
  if (!list || list === "notYet") return null;
  const now = new Date();
  // Removed departments count: what they already hold stays with their
  // people, as `private.holds_list` and Lists have it.
  const holds = holdsList(list.holder, {
    userId,
    role: access.role,
    departments: departmentsOf(departments, userId, { live: false }),
  });
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
  };
}

/**
 * The send screen: the templates the person may send, and who to. Null when
 * they may send nothing, or are only viewing.
 */
export async function currentSendForm(
  asked?: string,
): Promise<SendFormData | null> {
  const access = await listsAccess();
  if (!access || access.viewOnly) return null;
  const { businessId, userId } = access;
  const [templates, departments, colleagues] = await Promise.all([
    currentTemplates(businessId),
    currentDepartments(businessId),
    currentColleagues(businessId),
  ]);
  const offered = sendable(
    templates,
    access,
    departmentsOf(departments, userId, { live: true }),
  );
  const first = offered[0];
  if (!first) return null;
  return {
    templates: offered.map((t) => ({
      id: t.id,
      name: t.name,
      note: t.note,
      items: t.items.map((item) => ({ kind: item.kind, label: item.label })),
      recipient: t.recipient,
      fromDepartment: t.fromDepartment,
    })),
    initial: offered.find((t) => t.id === asked)?.id ?? first.id,
    free: access.canSend,
    // A list goes to someone on the staff, never to an accountant.
    people: colleagues
      .filter((c) => isStaff(c.role))
      .map((c) => ({
        userId: c.userId,
        name: c.name,
        photo: c.photo,
      })),
    departments: departments
      .filter((d) => d.archivedAt === null)
      .map((d) => ({ id: d.id, name: d.name })),
    roles: STAFF_ROLES,
  };
}
