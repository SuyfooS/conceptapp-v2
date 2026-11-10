// Mock rows for the lists demo: the demo restaurant's departments, the lists
// sent this Tuesday morning and its templates. They stand in for database
// rows, so their Hebrew stays here rather than in messages/; the Hebrew-literal
// check in tooling/ allows this file.

import {
  byUrgency,
  type ListDetail,
  type ListItem,
  type ListSummary,
  type ListTemplate,
  listProgress,
  listsTally,
  type SendShift,
  type TemplateItem,
} from "@domain/lists";
import { STAFF_ROLES } from "@domain/modules";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import {
  type ListLookups,
  type ListScreenData,
  type ListsHomeData,
  type ListsTiming,
  NEW_LIST,
  type SendFormData,
} from "../../../(app)/lists/list-types";
import {
  templateEditor,
  templatesScreen,
} from "../../../(app)/lists/templates/templates-data";
import { demoShiftPatterns, teamMembers } from "../data";

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

export const demoListLookups: ListLookups = {
  people: Object.fromEntries(
    teamMembers.map((m) => [m.userId, { name: m.name, photo: m.photo }]),
  ),
  departments: Object.fromEntries(demoDepartments.map((d) => [d.id, d.name])),
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
  comment: null,
  done: false,
  doneBy: null,
  doneAt: null,
  ...fields,
});

const done = (by: string, at: string) => ({
  done: true,
  doneBy: by,
  doneAt: at,
});

const list = (
  fields: Omit<ListDetail, "progress" | "passes" | "shift" | "origin"> &
    Partial<Pick<ListDetail, "origin">>,
): ListDetail => ({
  origin: "sent",
  shift: null,
  passes: [],
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
        label: "מקרר ראשי",
        unit: "°C",
        min: 0,
        max: 5,
        reading: 3,
        ...done("noa", "2026-11-03T05:42:00.000Z"),
      }),
      item("kitchen-freezer", {
        kind: "number",
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
    ],
  }),
];

const summaryOf = ({
  note: _note,
  asksQuantities: _asks,
  shift: _shift,
  items: _items,
  passes: _passes,
  ...summary
}: ListDetail): ListSummary => summary;

const now = new Date(demoListsNow);
const holdersOf = (userId: string, departments: string[]) => (l: ListDetail) =>
  l.holder.kind === "department"
    ? departments.includes(l.holder.department)
    : l.holder.kind === "person" || l.holder.kind === "shift"
      ? l.holder.people.includes(userId)
      : false;

/** Lists as one person of the demo reads it: their own, and the business's day. */
function homeFor(
  userId: string,
  manager: boolean,
  sent: string | undefined,
): ListsHomeData {
  const departments = demoDepartments
    .filter((d) => d.members.includes(userId))
    .map((d) => d.id);
  const mine = demoLists.filter(holdersOf(userId, departments)).map(summaryOf);
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
    team: manager ? listsTally(demoLists, now, timing) : null,
    send: manager
      ? { href: "/lists/send", only: null }
      : departments.includes("dep-bar")
        ? { href: "/lists/send", only: "הזמנה מהבר למחסן" }
        : null,
    sent: sentList ? summaryOf(sentList) : null,
    templates: manager
      ? demoTemplates.filter((t) => t.archivedAt === null).length
      : null,
  };
}

/** Shiran, a shift manager, on the floor and at the bar. */
export const demoListsHome = (sent?: string) => homeFor("shiran", true, sent);
/** Noa, a worker in the kitchen. */
export const demoWorkerLists = () => homeFor("noa", false, undefined);
/** A worker with nothing sent to them yet. */
export const demoEmptyLists = (): ListsHomeData => ({
  ...homeFor("dana", false, undefined),
  open: [],
  closed: [],
});
/** The team viewing the business as a manager, on a day nothing was sent. */
export const demoEmptyBusinessLists = (): ListsHomeData => ({
  ...homeFor("shiran", true, undefined),
  view: "business",
  open: [],
  closed: [],
  team: { total: 0, open: 0, finished: 0, late: 0 },
  send: null,
});

/** One list on its screen, as Shiran reads it; `finished` just now by her. */
export function demoListScreen(
  id: string,
  finished: boolean,
): ListScreenData | null {
  const found = demoLists.find((l) => l.id === id);
  if (!found) return null;
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
  return {
    now: demoListsNow,
    timeZone: ISRAEL_TIME_ZONE,
    timing,
    lookups: demoListLookups,
    userId: "shiran",
    list: { ...shown, progress: listProgress(shown.items) },
    // Shiran manages lists: she opens a closed one again whenever, besides
    // her own five minutes to take a finish back.
    can: {
      fill: shown.status === "open",
      reopen: shown.status === "finished" || shown.status === "cancelled",
    },
    readOnly: shown.status === "open" ? null : "finished",
    undoUntil: finished
      ? new Date(Date.parse(finishedAt) + 5 * 60_000).toISOString()
      : null,
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
    items: [
      templateItem("ti-wc-fridge", { kind: "check", label: "ניקוי מקרר ראשי" }),
      templateItem("ti-wc-hood", { kind: "check", label: "ניקוי מנדף" }),
      templateItem("ti-wc-store", { kind: "check", label: "סידור מחסן יבש" }),
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
 * name (the bar, for its order: an editor that can't save it).
 */
export function demoTemplateEditor(
  id: string,
  changed: boolean,
  readOnly = false,
  removedDepartment?: string,
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
    shifts: demoListShifts,
    readOnly,
    changed,
  });
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
 * kitchen's templates still name.
 */
export const demoSendForm = (
  initial?: string,
  kitchenGone = false,
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
    shifts: demoSendShifts,
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
