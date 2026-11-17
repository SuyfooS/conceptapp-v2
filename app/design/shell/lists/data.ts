// Mock rows for the lists demo: the demo restaurant's departments, the lists
// sent this Tuesday morning and its templates. They stand in for database
// rows, so their Hebrew stays here rather than in messages/; the Hebrew-literal
// check in tooling/ allows this file.

import type { ListReading } from "@db/lists";
import { dateIn } from "@domain/availability";
import { nextOpenings } from "@domain/list-openings";
import {
  byUrgency,
  DEFAULT_FIX_HOURS,
  fixDeadline,
  isOutOfRange,
  type ListDetail,
  type ListItem,
  type ListItemChange,
  type ListSchedule,
  type ListSummary,
  type ListTemplate,
  listProgress,
  listsTally,
  ofDepartment,
  passTargets,
  type SendShift,
  type TemplateItem,
} from "@domain/lists";
import { STAFF_ROLES } from "@domain/modules";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import {
  type EditorTimes,
  type ListLookups,
  type ListRoleOption,
  type ListScreenData,
  type ListsHomeData,
  type ListsTiming,
  type ListsTodayData,
  NEW_LIST,
  type SendFormData,
} from "../../../(app)/lists/list-types";
import { editorTimes } from "../../../(app)/lists/templates/editor-times";
import {
  placesOf,
  templateEditor,
  templatesScreen,
} from "../../../(app)/lists/templates/templates-data";
import {
  listsTodayData,
  overviewWeek,
} from "../../../(app)/lists/today/today-data";
import { listPhotos } from "../../list-photos";
import { demoNamedRole, demoShiftPatterns, teamMembers } from "../data";

/** Tuesday 3 November 2026, 08:12 in Tel Aviv, as the rest of the demo. */
export const demoListsNow = "2026-11-03T06:12:00.000Z";
const timing: ListsTiming = { remindBeforeMinutes: 30, lateAfterMinutes: 15 };

export const demoDepartments = [
  {
    id: "dep-kitchen",
    key: "kitchen",
    name: "מטבח",
    members: ["noa", "itay", "omer"],
  },
  { id: "dep-floor", key: "floor", name: "אולם", members: ["shiran", "maya"] },
  { id: "dep-bar", key: "bar", name: "בר", members: ["shiran", "yoav"] },
  { id: "dep-storeroom", key: "storeroom", name: "מחסן", members: ["yoav"] },
];

/**
 * The restaurant's own role on the lists' screens (the roles plan's R11d):
 * its shift leads, built on workers (`demoNamedRole`), which the send screen
 * and the template editor offer after the built-in roles. `removed` is the
 * restaurant after it archived the role, which the shift's opening still
 * names.
 */
export const demoListRoles = (removed = false): ListRoleOption[] => [
  {
    id: demoNamedRole.id,
    base: demoNamedRole.base,
    name: demoNamedRole.name,
    archived: removed,
  },
];

/** A list, a template or a time to the shift leads alone (R11d). */
const toShiftLeads = {
  kind: "role",
  role: "worker",
  namedRole: demoNamedRole.id,
} as const;

export const demoListLookups: ListLookups = {
  people: Object.fromEntries(
    teamMembers.map((m) => [m.userId, { name: m.name, photo: m.photo }]),
  ),
  departments: Object.fromEntries(demoDepartments.map((d) => [d.id, d.name])),
  roles: Object.fromEntries(demoListRoles().map((r) => [r.id, r.name])),
};

const item = (
  id: string,
  fields: Partial<ListItem> & Pick<ListItem, "kind" | "label">,
): ListItem => ({
  id,
  templateItemId: null,
  hint: null,
  required: true,
  unit: null,
  min: null,
  max: null,
  requested: null,
  given: null,
  checked: false,
  reading: null,
  answer: null,
  photo: null,
  photoRemoved: false,
  comment: null,
  done: false,
  doneBy: null,
  doneAt: null,
  fixedAt: null,
  ...fields,
});

const done = (by: string, at: string) => ({
  done: true,
  doneBy: by,
  doneAt: at,
});

const list = (
  fields: Omit<
    ListDetail,
    "progress" | "passes" | "shift" | "origin" | "changes" | "reopens"
  > &
    Partial<Pick<ListDetail, "origin">>,
): ListDetail => ({
  origin: "sent",
  shift: null,
  passes: [],
  // Each item's history (L6a) is in `withHistory`, for `?state=history`;
  // otherwise an item done reads as done once, by whoever did it.
  changes: [],
  reopens: [],
  ...fields,
  progress: listProgress(fields.items),
});

const base = {
  templateId: null,
  note: null,
  asksQuantities: false,
  fromDepartment: null,
  finishedAt: null,
  finishedBy: null,
  closedAt: null,
  closedBy: null,
  fixedAt: null,
} as const;

export const demoLists: ListDetail[] = [
  list({
    ...base,
    id: "list-kitchen-opening",
    name: "פתיחת מטבח",
    status: "open",
    holder: { kind: "department", department: "dep-kitchen" },
    sentBy: "shiran",
    opensAt: "2026-11-03T05:30:00.000Z",
    dueAt: "2026-11-03T06:30:00.000Z",
    note: "היום מגיעה סחורה ב-10:00, להשאיר מקום במקרר הראשי.",
    items: [
      item("kitchen-fridge", {
        kind: "number",
        templateItemId: "ti-ko-fridge",
        label: "מקרר ראשי",
        unit: "°C",
        min: 0,
        max: 5,
        reading: 3,
        ...done("noa", "2026-11-03T05:42:00.000Z"),
      }),
      item("kitchen-freezer", {
        kind: "number",
        templateItemId: "ti-ko-freezer",
        label: "מקפיא",
        unit: "°C",
        min: -25,
        max: -18,
      }),
      item("kitchen-dates", {
        kind: "check",
        label: "בדיקת תאריכים ותוויות",
        checked: true,
        ...done("noa", "2026-11-03T05:47:00.000Z"),
      }),
      item("kitchen-preps", {
        kind: "check",
        label: "הכנות לפי רשימת ההכנות",
        comment: "חסר בצל, הזמנתי",
      }),
      item("kitchen-surfaces", {
        kind: "check",
        label: "ניקוי משטחי עבודה",
      }),
      item("kitchen-missing", {
        kind: "note",
        label: "מה חסר במטבח",
        required: false,
      }),
    ],
  }),
  list({
    ...base,
    id: "list-floor-opening",
    name: "פתיחת אולם",
    status: "open",
    holder: { kind: "department", department: "dep-floor" },
    sentBy: "uri",
    opensAt: "2026-11-03T06:00:00.000Z",
    dueAt: "2026-11-03T08:30:00.000Z",
    items: [
      item("floor-tables", {
        kind: "check",
        label: "סידור שולחנות וכיסאות",
        checked: true,
        ...done("maya", "2026-11-03T06:05:00.000Z"),
      }),
      item("floor-toilets", { kind: "check", label: "ניקוי שירותים" }),
      item("floor-napkins", { kind: "check", label: "מילוי מפיות ותבלינים" }),
      item("floor-menus", { kind: "check", label: "תפריטים נקיים" }),
    ],
  }),
  list({
    ...base,
    id: "list-cash-check",
    name: "בדיקת קופה לפני המשמרת",
    status: "open",
    holder: { kind: "person", people: ["shiran"] },
    sentBy: "uri",
    opensAt: "2026-11-03T05:50:00.000Z",
    dueAt: null,
    items: [
      item("cash-count", {
        kind: "number",
        label: "מזומן בקופה",
        unit: "₪",
      }),
      item("cash-change", { kind: "check", label: "יש מספיק עודף" }),
    ],
  }),
  list({
    ...base,
    id: "list-bar-order",
    name: "הזמנה מהבר למחסן",
    status: "open",
    holder: { kind: "department", department: "dep-storeroom" },
    fromDepartment: "dep-bar",
    asksQuantities: true,
    sentBy: "yoav",
    opensAt: "2026-11-03T05:55:00.000Z",
    dueAt: null,
    items: [
      item("order-white", {
        kind: "check",
        label: "יין לבן",
        hint: "בקבוקים",
        requested: 6,
        given: 4,
        checked: true,
        comment: "נשארו רק 4 במחסן",
        ...done("yoav", "2026-11-03T06:02:00.000Z"),
      }),
      item("order-ice", {
        kind: "check",
        label: "קרח",
        hint: "שקיות",
        requested: 2,
      }),
      item("order-lemons", { kind: "check", label: "לימונים", requested: 20 }),
    ],
  }),
  list({
    ...base,
    id: "list-shift-opening",
    name: "פתיחת משמרת",
    origin: "scheduled",
    templateId: "t-shift-opening",
    status: "open",
    holder: toShiftLeads,
    sentBy: null,
    opensAt: "2026-11-03T05:45:00.000Z",
    dueAt: "2026-11-03T07:00:00.000Z",
    items: [
      item("shift-till", {
        kind: "check",
        templateItemId: "ti-so-till",
        label: "ספירת הקופה בפתיחה",
        checked: true,
        ...done("yoav", "2026-11-03T05:58:00.000Z"),
      }),
      item("shift-team", {
        kind: "check",
        templateItemId: "ti-so-team",
        label: "כל מי שבמשמרת הגיע",
      }),
      item("shift-briefing", {
        kind: "check",
        templateItemId: "ti-so-briefing",
        label: "תדריך קצר לצוות",
      }),
    ],
  }),
  list({
    ...base,
    id: "list-weekly-cleaning",
    name: "ניקיון שבועי",
    status: "finished",
    holder: { kind: "department", department: "dep-kitchen" },
    sentBy: "shiran",
    opensAt: "2026-11-03T04:30:00.000Z",
    dueAt: null,
    finishedAt: "2026-11-03T05:20:00.000Z",
    finishedBy: "noa",
    items: [
      item("weekly-fridge", {
        kind: "check",
        label: "ניקוי מקרר ראשי",
        checked: true,
        ...done("noa", "2026-11-03T05:00:00.000Z"),
      }),
      item("weekly-hood", {
        kind: "check",
        label: "ניקוי מנדף",
        checked: true,
        ...done("noa", "2026-11-03T05:15:00.000Z"),
      }),
      // A photo of the kitchen after cleaning (L6), an illustration.
      item("weekly-photo", {
        kind: "photo",
        templateItemId: "ti-wc-photo",
        label: "צילום של המטבח אחרי הניקיון",
        required: false,
        photo: listPhotos.kitchen,
        ...done("noa", "2026-11-03T05:18:00.000Z"),
      }),
    ],
  }),
];

/**
 * The restaurant's lists of the days before, for the manager's overview and
 * its history only: last night's kitchen closing, still open and late, with a
 * fridge reading out of range; Monday's and Sunday's openings, finished; and
 * Sunday's floor opening, which nobody did.
 */
const reading = (
  id: string,
  templateItemId: string,
  label: string,
  [min, max]: [number, number],
  value: number,
  at: string,
) =>
  item(id, {
    kind: "number",
    templateItemId,
    label,
    unit: "°C",
    min,
    max,
    reading: value,
    ...done("noa", at),
  });
const FRIDGE: [number, number] = [0, 5];
const FREEZER: [number, number] = [-25, -18];

export const demoEarlierLists: ListDetail[] = [
  list({
    ...base,
    id: "list-kitchen-closing-mon",
    name: "סגירת מטבח",
    origin: "scheduled",
    status: "open",
    holder: { kind: "department", department: "dep-kitchen" },
    sentBy: null,
    opensAt: "2026-11-02T21:00:00.000Z",
    dueAt: "2026-11-02T21:45:00.000Z",
    items: [
      reading(
        "kc-mon-fridge",
        "ti-kc-fridge",
        "מקרר ראשי",
        FRIDGE,
        7,
        "2026-11-02T21:20:00.000Z",
      ),
      reading(
        "kc-mon-freezer",
        "ti-kc-freezer",
        "מקפיא",
        FREEZER,
        -19,
        "2026-11-02T21:21:00.000Z",
      ),
      item("kc-mon-cover", { kind: "check", label: "כיסוי ואחסון מזון" }),
      item("kc-mon-gas", { kind: "check", label: "סגירת גז" }),
    ],
  }),
  list({
    ...base,
    id: "list-kitchen-opening-mon",
    name: "פתיחת מטבח",
    origin: "scheduled",
    status: "finished",
    holder: { kind: "department", department: "dep-kitchen" },
    sentBy: null,
    opensAt: "2026-11-02T05:30:00.000Z",
    dueAt: "2026-11-02T06:30:00.000Z",
    finishedAt: "2026-11-02T06:20:00.000Z",
    finishedBy: "noa",
    items: [
      reading(
        "ko-mon-fridge",
        "ti-ko-fridge",
        "מקרר ראשי",
        FRIDGE,
        4,
        "2026-11-02T05:41:00.000Z",
      ),
      reading(
        "ko-mon-freezer",
        "ti-ko-freezer",
        "מקפיא",
        FREEZER,
        -20,
        "2026-11-02T05:42:00.000Z",
      ),
    ],
  }),
  list({
    ...base,
    id: "list-kitchen-opening-sun",
    name: "פתיחת מטבח",
    origin: "scheduled",
    status: "finished",
    holder: { kind: "department", department: "dep-kitchen" },
    sentBy: null,
    opensAt: "2026-11-01T05:30:00.000Z",
    dueAt: "2026-11-01T06:30:00.000Z",
    finishedAt: "2026-11-01T06:10:00.000Z",
    finishedBy: "noa",
    items: [
      reading(
        "ko-sun-fridge",
        "ti-ko-fridge",
        "מקרר ראשי",
        FRIDGE,
        2,
        "2026-11-01T05:38:00.000Z",
      ),
      reading(
        "ko-sun-freezer",
        "ti-ko-freezer",
        "מקפיא",
        FREEZER,
        -21,
        "2026-11-01T05:39:00.000Z",
      ),
    ],
  }),
  list({
    ...base,
    id: "list-floor-opening-sun",
    name: "פתיחת אולם",
    origin: "scheduled",
    status: "missed",
    holder: { kind: "department", department: "dep-floor" },
    sentBy: null,
    opensAt: "2026-11-01T06:00:00.000Z",
    dueAt: "2026-11-01T08:30:00.000Z",
    closedAt: "2026-11-02T06:00:00.000Z",
    items: [
      item("fo-sun-tables", { kind: "check", label: "סידור שולחנות וכיסאות" }),
      item("fo-sun-menus", { kind: "check", label: "תפריטים נקיים" }),
    ],
  }),
];

const summaryOf = ({
  note: _note,
  asksQuantities: _asks,
  shift: _shift,
  items: _items,
  passes: _passes,
  changes: _changes,
  reopens: _reopens,
  ...summary
}: ListDetail): ListSummary => summary;

const now = new Date(demoListsNow);
const holdersOf = (userId: string, departments: string[]) => (l: ListDetail) =>
  l.holder.kind === "department"
    ? departments.includes(l.holder.department)
    : l.holder.kind === "person" || l.holder.kind === "shift"
      ? l.holder.people.includes(userId)
      : false;

/**
 * Lists as one person of the demo reads it: their own, the orders their
 * departments asked for that wait elsewhere, and the business's day;
 * `department` the filter's choice, for someone in more than one; `passed`
 * a department a list was just passed to, as after passing one on.
 * `manager` is whether they manage lists, and `sends` whether they send
 * them too (lists.send under lists.manage, the roles plan's R5).
 */
function homeFor(
  userId: string,
  manager: boolean,
  sent: string | undefined,
  department?: string,
  passed?: string,
  sends = manager,
): ListsHomeData {
  const theirs = demoDepartments.filter((d) => d.members.includes(userId));
  const departments = theirs.map((d) => d.id);
  // Today's lists, and last night's closing, still open and late.
  const current = [
    ...demoLists,
    ...demoEarlierLists.filter((l) => l.status === "open"),
  ];
  const holds = holdersOf(userId, departments);
  const chosen = departments.includes(department ?? "")
    ? (department ?? null)
    : null;
  const kept = (l: ListSummary) => chosen === null || ofDepartment(l, chosen);
  const mine = current.filter(holds).map(summaryOf).filter(kept);
  const asked = current
    .filter(
      (l) =>
        l.status === "open" &&
        l.fromDepartment !== null &&
        departments.includes(l.fromDepartment) &&
        !holds(l),
    )
    .map(summaryOf)
    .filter(kept);
  const sentList = demoLists.find((l) => l.id === sent);
  return {
    now: demoListsNow,
    timeZone: ISRAEL_TIME_ZONE,
    timing,
    lookups: demoListLookups,
    view: "mine",
    userId,
    open: byUrgency(
      mine.filter((l) => l.status === "open"),
      now,
      timing,
    ),
    closed: mine.filter((l) => l.status !== "open"),
    fixable: [],
    asked: byUrgency(asked, now, timing),
    filter:
      theirs.length > 1
        ? {
            departments: theirs.map((d) => ({ id: d.id, name: d.name })),
            chosen,
          }
        : null,
    team: manager ? listsTally(current, now, timing) : null,
    send: sends
      ? { href: "/lists/send", only: null }
      : departments.includes("dep-bar")
        ? { href: "/lists/send", only: "הזמנה מהבר למחסן" }
        : null,
    othersSend: manager && !sends,
    sent: sentList ? summaryOf(sentList) : null,
    passed: demoDepartments.find((d) => d.id === passed)?.name ?? null,
    templates: manager
      ? demoTemplates.filter((t) => t.archivedAt === null).length
      : null,
  };
}

/**
 * Shiran, a shift manager, on the floor and at the bar: the bar's order waits
 * at the storeroom, `department` is the filter's choice and `passed` a
 * department a list was just passed to.
 */
export const demoListsHome = (
  sent?: string,
  department?: string,
  passed?: string,
) => homeFor("shiran", true, sent, department, passed);
/** Noa, a worker in the kitchen. */
export const demoWorkerLists = () => homeFor("noa", false, undefined);
/**
 * Noa once the owner gave workers lists edit without sending (the roles
 * plan's R5): the business's day and its templates, no way to send, and who
 * does.
 */
export const demoWorkerEditsLists = () =>
  homeFor("noa", true, undefined, undefined, undefined, false);
/**
 * Noa in "עובד בכיר", given "תיקון רשימות שנסגרו" (L6b-2, the roles twin's
 * `demoSenior`): yesterday's kitchen opening, which she closed at 08:20,
 * under "עוד אפשר לתקן" until 08:20 this morning, a day after.
 */
export const demoWorkerFixesLists = (): ListsHomeData => ({
  ...homeFor("noa", false, undefined),
  fixable: demoEarlierLists
    .filter((l) => l.id === "list-kitchen-opening-mon")
    .flatMap((l) => {
      const list = summaryOf(l);
      const { until } = fixDeadline(
        list,
        { canManage: false, canFix: true, holds: true },
        DEFAULT_FIX_HOURS,
        now,
      );
      return until === null ? [] : [{ list, until }];
    }),
});
/** A worker with nothing sent to them yet. */
export const demoEmptyLists = (): ListsHomeData => ({
  ...homeFor("dana", false, undefined),
  open: [],
  closed: [],
  asked: [],
});
/** The team viewing the business as a manager, on a day nothing was sent. */
export const demoEmptyBusinessLists = (): ListsHomeData => ({
  ...homeFor("shiran", true, undefined),
  view: "business",
  open: [],
  closed: [],
  asked: [],
  filter: null,
  team: { total: 0, open: 0, finished: 0, late: 0 },
  send: null,
});

/**
 * The manager's overview as Shiran has it on the demo's Tuesday morning:
 * last night's closing late, the morning's lists, the cleaning closed, and
 * the week's readings; `day` one of the week's days (the history), `empty`
 * a day with nothing, `viewing` the team viewing as a manager, `noSend` a
 * role that manages lists without sending them (R5), `emptyNoSend` such a
 * role on a day with nothing, `shiftGone`
 * the restaurant after its evening shift left the settings, so the bar's
 * closing, which follows it, opens nothing; `fixed` the morning once Noa
 * closed the kitchen's opening and Shiran fixed its freezer reading after
 * the close (L6b-1, `withFix`).
 */
export function demoListsToday(
  day?: string,
  state?:
    | "empty"
    | "viewing"
    | "shiftGone"
    | "noSend"
    | "emptyNoSend"
    | "fixed",
): ListsTodayData {
  const empty = state === "empty" || state === "emptyNoSend";
  const noSend = state === "noSend" || state === "emptyNoSend";
  const all = empty
    ? []
    : [...demoLists, ...demoEarlierLists].map((l) =>
        state === "fixed" ? withFix(l, "fixed") : l,
      );
  const lists = all.map(summaryOf);
  const today = dateIn(now, ISRAEL_TIME_ZONE);
  const week = overviewWeek(today);
  const readings: ListReading[] = all.flatMap((l) =>
    l.items
      .filter((i) => i.kind === "number")
      .map((i) => ({
        listId: l.id,
        itemId: i.id,
        templateItemId: i.templateItemId,
        label: i.label,
        unit: i.unit,
        min: i.min,
        max: i.max,
        reading: i.reading,
        doneAt: i.doneAt,
        doneBy: i.doneBy,
        fixedAt: i.fixedAt,
        outOfRange: isOutOfRange(i),
      })),
  );
  return listsTodayData({
    now,
    timeZone: ISRAEL_TIME_ZONE,
    timing,
    lookups: demoListLookups,
    userId: "shiran",
    day: day && week.includes(day) ? day : today,
    week,
    current: lists.filter(
      (l) =>
        l.status === "open" ||
        dateIn(new Date(l.opensAt), ISRAEL_TIME_ZONE) === today,
    ),
    weekLists: lists,
    readings,
    templates: demoTemplates,
    places: placesOf(
      demoDepartments.map((d) => ({ ...d, archivedAt: null })),
      demoListShifts.filter(
        (s) => state !== "shiftGone" || s.key !== "evening",
      ),
      demoListRoles(),
    ),
    send:
      state === "viewing" || noSend
        ? null
        : { href: "/lists/send", only: null },
    othersSend: noSend,
    viewOnly: state === "viewing",
  });
}

/**
 * The bar's order once the storeroom gave what it had and passed it back to
 * the bar with a note (L5): the bar holds it, to finish.
 */
function passedBack(order: ListDetail): ListDetail {
  const passedAt = "2026-11-03T06:08:00.000Z";
  const given = (i: ListItem): ListItem =>
    i.done
      ? i
      : {
          ...i,
          checked: true,
          given: i.requested,
          ...done("yoav", "2026-11-03T06:07:00.000Z"),
        };
  return {
    ...order,
    holder: { kind: "department", department: "dep-bar" },
    items: order.items.map(given),
    passes: [
      {
        id: "pass-bar-order",
        fromDepartment: "dep-storeroom",
        toDepartment: "dep-bar",
        passedBy: "yoav",
        passedAt,
        note: "יין לבן יגיע מחר בבוקר. השאר כאן.",
      },
    ],
  };
}

/**
 * A list's photo states on the demo (L6): `photo` the list as just opened,
 * nothing done, its photo still to take; `demo` the same in a demo business,
 * which takes no photos; `gone` the list as it was, its photo no longer kept.
 */
export type DemoPhotoState = "photo" | "demo" | "gone";

function withPhotoState(list: ListDetail, state: DemoPhotoState): ListDetail {
  if (state === "gone") {
    return {
      ...list,
      items: list.items.map((i) =>
        i.kind === "photo" && i.photo !== null
          ? { ...i, photo: null, photoRemoved: true }
          : i,
      ),
    };
  }
  return {
    ...list,
    status: "open",
    finishedAt: null,
    finishedBy: null,
    items: list.items.map((i) => ({
      ...i,
      checked: false,
      given: null,
      reading: null,
      answer: null,
      photo: null,
      done: false,
      doneBy: null,
      doneAt: null,
    })),
  };
}

/** A change of an item on the demo (L6a), with the item as it left it. */
const change = (
  id: string,
  itemId: string,
  by: string,
  at: string,
  changed: ListItemChange["changed"],
  values: Partial<ListItemChange> = {},
): ListItemChange => ({
  id,
  itemId,
  by,
  at,
  changed,
  checked: false,
  given: null,
  reading: null,
  answer: null,
  comment: null,
  photo: false,
  done: false,
  fixed: false,
  ...values,
});

const FRIDGE_NOTE = "הדלת נשארה פתוחה, בודקים שוב בעשר";

/**
 * Each item's story on the demo (L6a, `?state=history`). On the kitchen's
 * opening, Noa wrote 4°C on the fridge at 07:42, Itay changed it to 6°C at
 * 08:02 and added a note at 08:05; Noa wrote a note on the preparations
 * without ticking them; and Omer's tick of the surfaces Itay took back at
 * 08:08. The weekly cleaning Noa closed at 07:16, Shiran opened it again at
 * 07:17 for its photo, and Itay took it and closed it at 07:20.
 */
function withHistory(list: ListDetail): ListDetail {
  if (list.id === "list-kitchen-opening") {
    return {
      ...list,
      items: list.items.map((i) =>
        i.id === "kitchen-fridge"
          ? {
              ...i,
              reading: 6,
              comment: FRIDGE_NOTE,
              ...done("itay", "2026-11-03T06:02:00.000Z"),
            }
          : i,
      ),
      changes: [
        change(
          "ch-fridge-1",
          "kitchen-fridge",
          "noa",
          "2026-11-03T05:42:00.000Z",
          ["reading"],
          { reading: 4, done: true },
        ),
        change(
          "ch-dates-1",
          "kitchen-dates",
          "noa",
          "2026-11-03T05:47:00.000Z",
          ["checked"],
          { checked: true, done: true },
        ),
        change(
          "ch-surfaces-1",
          "kitchen-surfaces",
          "omer",
          "2026-11-03T05:50:00.000Z",
          ["checked"],
          { checked: true, done: true },
        ),
        change(
          "ch-preps-1",
          "kitchen-preps",
          "noa",
          "2026-11-03T05:52:00.000Z",
          ["comment"],
          { comment: "חסר בצל, הזמנתי" },
        ),
        change(
          "ch-fridge-2",
          "kitchen-fridge",
          "itay",
          "2026-11-03T06:02:00.000Z",
          ["reading"],
          { reading: 6, done: true },
        ),
        change(
          "ch-fridge-3",
          "kitchen-fridge",
          "itay",
          "2026-11-03T06:05:00.000Z",
          ["comment"],
          { reading: 6, comment: FRIDGE_NOTE, done: true },
        ),
        change(
          "ch-surfaces-2",
          "kitchen-surfaces",
          "itay",
          "2026-11-03T06:08:00.000Z",
          ["checked"],
        ),
      ],
    };
  }
  if (list.id === "list-weekly-cleaning") {
    return {
      ...list,
      finishedBy: "itay",
      items: list.items.map((i) =>
        i.id === "weekly-photo"
          ? { ...i, ...done("itay", "2026-11-03T05:18:00.000Z") }
          : i,
      ),
      reopens: [
        {
          id: "reopen-weekly",
          reopenedBy: "shiran",
          reopenedAt: "2026-11-03T05:17:00.000Z",
          was: "finished",
          wasBy: "noa",
          wasAt: "2026-11-03T05:16:00.000Z",
        },
      ],
    };
  }
  return list;
}

/**
 * A closed list fixed in place on the demo (L6b-1): `fix` the kitchen's
 * opening as Noa closed it at 08:05, her freezer reading of −12°C out of its
 * range, for Shiran, who runs the lists, to fix; `fixed` the same once
 * Shiran fixed it to −19°C at 08:10. The list stays Noa's close; the
 * reading stays hers too, its fix Shiran's. `fix-worker` (L6b-2) the same
 * close for Omer of the kitchen, in "עובד בכיר" with "תיקון רשימות שנסגרו":
 * he fixes it until 08:05 tomorrow, a day after it closed, and doesn't open
 * it again for everyone.
 */
export type DemoFixState = "fix" | "fixed" | "fix-worker";

const CLOSED_AT = "2026-11-03T06:05:00.000Z";
/** The day the business gives "תיקון רשימות שנסגרו" (`fixHours` 24). */
const FIX_UNTIL = "2026-11-04T06:05:00.000Z";
const FIXED_AT = "2026-11-03T06:10:00.000Z";

function withFix(list: ListDetail, state: DemoFixState): ListDetail {
  if (list.id !== "list-kitchen-opening") return list;
  const fixed = state === "fixed";
  const items = list.items.map((i): ListItem => {
    switch (i.id) {
      case "kitchen-freezer":
        return {
          ...i,
          reading: fixed ? -19 : -12,
          ...done("noa", "2026-11-03T05:44:00.000Z"),
          fixedAt: fixed ? FIXED_AT : null,
        };
      case "kitchen-preps":
        return {
          ...i,
          checked: true,
          ...done("noa", "2026-11-03T05:58:00.000Z"),
        };
      case "kitchen-surfaces":
        return {
          ...i,
          checked: true,
          ...done("noa", "2026-11-03T06:01:00.000Z"),
        };
      default:
        return i;
    }
  });
  return {
    ...list,
    status: "finished",
    finishedAt: CLOSED_AT,
    finishedBy: "noa",
    fixedAt: fixed ? FIXED_AT : null,
    items,
    changes: fixed
      ? [
          change(
            "ch-freezer-1",
            "kitchen-freezer",
            "noa",
            "2026-11-03T05:44:00.000Z",
            ["reading"],
            { reading: -12, done: true },
          ),
          change(
            "ch-freezer-2",
            "kitchen-freezer",
            "shiran",
            FIXED_AT,
            ["reading"],
            { reading: -19, done: true, fixed: true },
          ),
        ]
      : [],
  };
}

/**
 * One list on its screen, as Shiran reads it; `finished` just now by her,
 * `passed` the bar's order passed back from the storeroom, `photos` one of
 * its photo states (`DemoPhotoState`), `history` with its items' stories
 * (`withHistory`), `fix` closed and to be fixed, or fixed (`withFix`);
 * `fix-worker` as Omer reads it, who may fix it for a day (L6b-2).
 */
export function demoListScreen(
  id: string,
  finished: boolean,
  passed = false,
  photos: DemoPhotoState | null = null,
  history = false,
  fix: DemoFixState | null = null,
): ListScreenData | null {
  const listed = [...demoLists, ...demoEarlierLists].find((l) => l.id === id);
  if (!listed) return null;
  const fixedOrNot = fix ? withFix(listed, fix) : listed;
  const told = history ? withHistory(fixedOrNot) : fixedOrNot;
  const read = passed && told.fromDepartment !== null ? passedBack(told) : told;
  const found =
    photos && read.items.some((i) => i.kind === "photo")
      ? withPhotoState(read, photos)
      : read;
  const finishedAt = new Date(now.getTime() - 60_000).toISOString();
  const shown: ListDetail = finished
    ? {
        ...found,
        status: "finished",
        finishedAt,
        finishedBy: "shiran",
        items: found.items.map((i) =>
          i.required && !i.done
            ? {
                ...i,
                ...done("shiran", finishedAt),
                checked: i.kind === "check",
                reading: i.kind === "number" ? (i.max ?? 0) - 1 : null,
              }
            : i,
        ),
      }
    : found;
  // Omer, given "תיקון רשימות שנסגרו" (L6b-2): his kitchen's list, fixed
  // until a day after it closed, never opened again by him.
  if (fix === "fix-worker" && shown.status === "finished") {
    return {
      now: demoListsNow,
      timeZone: ISRAEL_TIME_ZONE,
      timing,
      lookups: demoListLookups,
      userId: "omer",
      list: { ...shown, progress: listProgress(shown.items) },
      can: { fill: false, reopen: false, fix: true },
      fixUntil: FIX_UNTIL,
      fixEndedAt: null,
      readOnly: "finished",
      undoUntil: null,
      pass: null,
      photos: { taking: "yes" },
    };
  }
  return {
    now: demoListsNow,
    timeZone: ISRAEL_TIME_ZONE,
    timing,
    lookups: demoListLookups,
    userId: "shiran",
    list: { ...shown, progress: listProgress(shown.items) },
    // Shiran manages lists: she opens a closed one again whenever, besides
    // her own five minutes to take a finish back, and fixes a finished one
    // in place (L6b-1).
    can: {
      fill: shown.status === "open",
      reopen: shown.status === "finished" || shown.status === "cancelled",
      fix: shown.status === "finished",
    },
    // She runs the lists: no end to fixing.
    fixUntil: null,
    fixEndedAt: null,
    readOnly: shown.status === "open" ? null : "finished",
    undoUntil: finished
      ? new Date(Date.parse(finishedAt) + 5 * 60_000).toISOString()
      : null,
    // She manages lists: any open one passes to another department.
    pass:
      shown.status === "open"
        ? {
            targets: passTargets(
              demoDepartments.map((d) => ({ ...d, archivedAt: null })),
              shown.holder,
              new Set(teamMembers.map((m) => m.userId)),
            ),
            stays: true,
          }
        : null,
    // Shown as a business that takes photos; `demo` as a demo business,
    // which takes none (as the hosted ones).
    photos: { taking: photos === "demo" ? "demo" : "yes" },
  };
}

const templateItem = (
  id: string,
  fields: Partial<TemplateItem> & Pick<TemplateItem, "kind" | "label">,
): TemplateItem => ({
  id,
  hint: null,
  required: true,
  unit: null,
  min: null,
  max: null,
  defaultQuantity: null,
  ...fields,
});

const fridge = (id: string) =>
  templateItem(id, {
    kind: "number",
    label: "מקרר ראשי",
    unit: "°C",
    min: 0,
    max: 5,
  });
const freezer = (id: string) =>
  templateItem(id, {
    kind: "number",
    label: "מקפיא",
    unit: "°C",
    min: -25,
    max: -18,
  });

/** A template's time, saved long before the demo's week. */
const time = (
  id: string,
  fields: Pick<
    ListSchedule,
    "days" | "opensOffset" | "dueOffset" | "recipient"
  > &
    Partial<ListSchedule>,
): ListSchedule => ({
  id,
  anchor: "day",
  shift: null,
  active: true,
  startsOn: "2026-10-01",
  opensFrom: "2026-10-01T00:00:00.000Z",
  ...fields,
});
const kitchen = { kind: "department", department: "dep-kitchen" } as const;

const template = (
  fields: Pick<ListTemplate, "id" | "name" | "recipient" | "items"> &
    Partial<ListTemplate>,
): ListTemplate => ({
  key: null,
  note: null,
  fromDepartment: null,
  asksQuantities: false,
  version: 1,
  archivedAt: null,
  schedules: [],
  ...fields,
});

/** The demo restaurant's list templates, as its template made them. */
export const demoTemplates: ListTemplate[] = [
  template({
    id: "t-kitchen-opening",
    key: "kitchen-opening",
    name: "פתיחת מטבח",
    recipient: { kind: "department", department: "dep-kitchen" },
    schedules: [
      time("ts-ko-week", {
        days: [0, 1, 2, 3, 4, 5],
        opensOffset: 7 * 60 + 30,
        dueOffset: 8 * 60 + 30,
        recipient: kitchen,
      }),
    ],
    items: [
      fridge("ti-ko-fridge"),
      freezer("ti-ko-freezer"),
      templateItem("ti-ko-dates", {
        kind: "check",
        label: "בדיקת תאריכים ותוויות",
      }),
      templateItem("ti-ko-preps", {
        kind: "check",
        label: "הכנות לפי רשימת ההכנות",
      }),
      templateItem("ti-ko-surfaces", {
        kind: "check",
        label: "ניקוי משטחי עבודה",
      }),
      templateItem("ti-ko-missing", {
        kind: "note",
        label: "מה חסר במטבח",
        required: false,
      }),
    ],
  }),
  template({
    id: "t-floor-opening",
    key: "floor-opening",
    name: "פתיחת אולם",
    recipient: { kind: "department", department: "dep-floor" },
    schedules: [
      time("ts-fo-week", {
        days: [0, 1, 2, 3, 4],
        opensOffset: 8 * 60,
        dueOffset: 10 * 60 + 30,
        recipient: { kind: "department", department: "dep-floor" },
      }),
    ],
    items: [
      templateItem("ti-fo-tables", {
        kind: "check",
        label: "סידור שולחנות וכיסאות",
      }),
      templateItem("ti-fo-toilets", { kind: "check", label: "ניקוי שירותים" }),
      templateItem("ti-fo-napkins", {
        kind: "check",
        label: "מילוי מפיות ותבלינים",
      }),
      templateItem("ti-fo-menus", { kind: "check", label: "תפריטים נקיים" }),
    ],
  }),
  template({
    id: "t-kitchen-closing",
    key: "kitchen-closing",
    name: "סגירת מטבח",
    recipient: { kind: "department", department: "dep-kitchen" },
    schedules: [
      time("ts-kc-week", {
        days: [0, 1, 2, 3, 4],
        opensOffset: 23 * 60,
        dueOffset: 23 * 60 + 45,
        recipient: kitchen,
      }),
      time("ts-kc-saturday", {
        days: [6],
        opensOffset: 23 * 60 + 30,
        dueOffset: 24 * 60 + 15,
        recipient: kitchen,
      }),
    ],
    items: [
      fridge("ti-kc-fridge"),
      freezer("ti-kc-freezer"),
      templateItem("ti-kc-cover", {
        kind: "check",
        label: "כיסוי ואחסון מזון",
      }),
      templateItem("ti-kc-grill", {
        kind: "check",
        label: "ניקוי כיריים וגריל",
      }),
      templateItem("ti-kc-bins", { kind: "check", label: "פינוי פחים" }),
      templateItem("ti-kc-gas", { kind: "check", label: "סגירת גז" }),
    ],
  }),
  template({
    id: "t-bar-closing",
    key: "bar-closing",
    name: "סגירת בר",
    recipient: { kind: "department", department: "dep-bar" },
    schedules: [
      time("ts-bc-evening", {
        days: [0, 1, 2, 3, 4],
        anchor: "shift_end",
        shift: "evening",
        opensOffset: -30,
        dueOffset: 30,
        recipient: { kind: "shift", shift: "evening" },
      }),
    ],
    items: [
      templateItem("ti-bc-taps", {
        kind: "check",
        label: "ניקוי ברזים ומקררים",
      }),
      templateItem("ti-bc-bottles", {
        kind: "number",
        label: "ספירת בקבוקים פתוחים",
        unit: "יח׳",
      }),
      templateItem("ti-bc-till", { kind: "check", label: "סגירת קופה" }),
    ],
  }),
  template({
    id: "t-bar-order",
    key: "bar-order",
    name: "הזמנה מהבר למחסן",
    recipient: { kind: "department", department: "dep-storeroom" },
    fromDepartment: "dep-bar",
    asksQuantities: true,
    items: [
      templateItem("ti-bo-white", {
        kind: "check",
        label: "יין לבן",
        hint: "בקבוקים",
        defaultQuantity: 6,
      }),
      templateItem("ti-bo-ice", {
        kind: "check",
        label: "קרח",
        hint: "שקיות",
        defaultQuantity: 2,
      }),
      templateItem("ti-bo-lemons", {
        kind: "check",
        label: "לימונים",
        defaultQuantity: 20,
      }),
    ],
  }),
  template({
    id: "t-weekly-cleaning",
    key: "weekly-cleaning",
    name: "ניקיון שבועי",
    recipient: { kind: "department", department: "dep-kitchen" },
    note: "בסוף הניקיון מכבים את המנדף.",
    schedules: [
      time("ts-wc-sunday", {
        days: [0],
        opensOffset: 15 * 60,
        dueOffset: 17 * 60,
        recipient: kitchen,
        active: false,
      }),
    ],
    items: [
      templateItem("ti-wc-fridge", { kind: "check", label: "ניקוי מקרר ראשי" }),
      templateItem("ti-wc-hood", { kind: "check", label: "ניקוי מנדף" }),
      templateItem("ti-wc-store", { kind: "check", label: "סידור מחסן יבש" }),
      templateItem("ti-wc-photo", {
        kind: "photo",
        label: "צילום של המטבח אחרי הניקיון",
        required: false,
      }),
    ],
  }),
  template({
    id: "t-shift-opening",
    name: "פתיחת משמרת",
    recipient: toShiftLeads,
    schedules: [
      time("ts-so-week", {
        days: [0, 1, 2, 3, 4, 5],
        opensOffset: 7 * 60 + 45,
        dueOffset: 9 * 60,
        recipient: toShiftLeads,
      }),
    ],
    items: [
      templateItem("ti-so-till", {
        kind: "check",
        label: "ספירת הקופה בפתיחה",
      }),
      templateItem("ti-so-team", {
        kind: "check",
        label: "כל מי שבמשמרת הגיע",
      }),
      templateItem("ti-so-briefing", {
        kind: "check",
        label: "תדריך קצר לצוות",
      }),
    ],
  }),
  template({
    id: "t-cash-check",
    name: "בדיקת קופה לפני המשמרת",
    recipient: { kind: "role", role: "manager" },
    items: [
      templateItem("ti-cc-cash", {
        kind: "number",
        label: "מזומן בקופה",
        unit: "₪",
      }),
      templateItem("ti-cc-change", { kind: "check", label: "יש מספיק עודף" }),
    ],
  }),
  template({
    id: "t-stock-count",
    name: "ספירת מלאי חודשית",
    recipient: null,
    archivedAt: "2026-11-02T15:00:00.000Z",
    items: [
      templateItem("ti-sc-wine", { kind: "number", label: "בקבוקי יין" }),
      templateItem("ti-sc-oil", { kind: "number", label: "שמן זית" }),
    ],
  }),
];

/** The restaurant's shift pattern, as its scheduling settings have it. */
const demoListShifts = demoShiftPatterns;

/**
 * The screen of templates as Shiran has it; `removed` just in its editor.
 * `readOnly` is the team viewing the restaurant as a manager.
 */
export const demoTemplatesScreen = (removed?: string, readOnly = false) =>
  templatesScreen({
    templates: demoTemplates,
    departments: demoDepartments.map((d) => ({ ...d, archivedAt: null })),
    shifts: demoListShifts,
    namedRoles: demoListRoles(),
    removed,
    readOnly,
  });

/** A business whose own lists are all gone, for the empty screen. */
export const demoEmptyTemplatesScreen = (readOnly = false) =>
  templatesScreen({
    templates: [],
    departments: [],
    shifts: demoListShifts,
    removed: undefined,
    readOnly,
  });

/**
 * One template in its editor, or a new one (`id` "new"). `readOnly` is a
 * view session, which opens no new one; a removed template is only read too.
 * `removedDepartment` is one removed since, which the template may still
 * name (the bar, for its order: an editor that can't save it), and
 * `removedShift` a shift the settings no longer have (the evening, which the
 * bar's closing follows: a time that holds the editor's saves).
 * `photosClosed` is a demo business, which takes no photos: a photo item
 * stays optional there. `removedRole` is the restaurant after it archived
 * its shift leads' role (R11d), which the shift's opening and its time still
 * name: chosen again, and a time that holds the editor's saves.
 */
export function demoTemplateEditor(
  id: string,
  changed: boolean,
  readOnly = false,
  removedDepartment?: string,
  removedShift?: string,
  photosClosed = false,
  removedRole = false,
) {
  if (id === "new" && readOnly) return null;
  const found = id === "new" ? null : demoTemplates.find((t) => t.id === id);
  if (found === undefined) return null;
  return templateEditor({
    template: found,
    departments: demoDepartments.map((d) => ({
      ...d,
      archivedAt:
        d.id === removedDepartment ? "2026-11-02T15:00:00.000Z" : null,
    })),
    shifts: demoListShifts.filter((s) => s.key !== removedShift),
    namedRoles: demoListRoles(removedRole),
    readOnly,
    changed,
    times: demoEditorTimes(found, removedShift),
    // A business that takes photos unless asked, as the list's screen is.
    photosClosed,
  });
}

/**
 * What the demo's editor works its times out with: the restaurant, closed on
 * Shabbat in Tel Aviv, on its Tuesday morning, with its week's shifts and
 * people, and each saved time's next openings by the same rules the
 * database's job opens lists by (none for one that follows `removedShift`).
 */
export function demoEditorTimes(
  found: ListTemplate | null,
  removedShift?: string,
): EditorTimes {
  const base = editorTimes({
    now,
    place: { shabbatCity: "telAviv", timeZone: ISRAEL_TIME_ZONE },
    closesOnShabbat: true,
    shifts: demoSendShifts,
    people: teamMembers,
    openings: {},
  });
  const context = {
    timeZone: base.timeZone,
    shabbat: base.shabbat,
    shifts: base.shifts,
    patterns: demoListShifts
      .map((s) => s.key)
      .filter((key) => key !== removedShift),
  };
  return {
    ...base,
    openings: Object.fromEntries(
      (found?.schedules ?? []).map((s) => [
        s.id,
        nextOpenings(s, now, context),
      ]),
    ),
  };
}

/**
 * The demo's published shifts from this Tuesday on, with their people: the
 * evening has Noa, Yoav, Maya and Omer; Thursday's morning has nobody yet.
 */
const demoSendShifts: SendShift[] = [
  {
    id: "s-tue-evening",
    day: "2026-11-03",
    name: "ערב",
    start: "16:00",
    end: "23:30",
    pattern: "evening",
    people: ["noa", "yoav", "maya", "omer"],
  },
  {
    id: "s-wed-morning",
    day: "2026-11-04",
    name: "בוקר",
    start: "09:00",
    end: "16:00",
    pattern: "morning",
    people: ["shiran", "itay", "shira"],
  },
  {
    id: "s-thu-morning",
    day: "2026-11-05",
    name: "בוקר",
    start: "09:00",
    end: "16:00",
    pattern: "morning",
    people: [],
  },
];

/**
 * The send screen as Shiran has it: the restaurant's templates, a list typed
 * now, and the week's shifts. `initial` is a template's id, or "new".
 * `kitchenGone` is the restaurant after its kitchen was removed, which the
 * kitchen's templates still name; `roleGone` after it archived its shift
 * leads' role (R11d), which the shift's opening still names. The shift
 * leads' role with who holds it (Yoav and Itay).
 */
export const demoSendForm = (
  initial?: string,
  kitchenGone = false,
  roleGone = false,
): SendFormData => {
  const live = demoTemplates.filter((t) => t.archivedAt === null);
  return {
    now: demoListsNow,
    timeZone: ISRAEL_TIME_ZONE,
    templates: live.map((t) => ({
      id: t.id,
      name: t.name,
      note: t.note,
      items: t.items,
      recipient: t.recipient,
      fromDepartment: t.fromDepartment,
      quantities: t.asksQuantities
        ? t.items
            .filter((i) => i.kind === "check")
            .map((i) => ({
              id: i.id,
              label: i.label,
              usual: i.defaultQuantity,
            }))
        : [],
    })),
    initial:
      initial === NEW_LIST || live.some((t) => t.id === initial)
        ? (initial ?? "t-kitchen-opening")
        : "t-kitchen-opening",
    free: true,
    people: teamMembers.map((m) => ({
      userId: m.userId,
      name: m.name,
      photo: m.photo,
    })),
    departments: demoDepartments
      .filter((d) => !kitchenGone || d.id !== "dep-kitchen")
      .map((d) => ({ id: d.id, name: d.name })),
    roles: STAFF_ROLES,
    namedRoles: demoListRoles(roleGone).map((r) => ({
      ...r,
      people: teamMembers.filter((m) => m.namedRole?.id === r.id).length,
    })),
    shifts: demoSendShifts,
    photosClosed: false,
  };
};

/** What Shiran sent this morning, for the send screen on a computer. */
export const demoSentToday = {
  lists: demoLists.filter((l) => l.sentBy === "shiran").map(summaryOf),
  lookups: demoListLookups,
  userId: "shiran",
  timeZone: ISRAEL_TIME_ZONE,
  now: demoListsNow,
};

/** The people the department editor can put in a department. */
export const demoDepartmentPeople = teamMembers.map((m) => ({
  userId: m.userId,
  name: m.name,
  photo: m.photo,
}));
