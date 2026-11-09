// Mock rows for the lists demo: the demo restaurant's departments, the lists
// sent this Tuesday morning and its templates. They stand in for database
// rows, so their Hebrew stays here rather than in messages/; the Hebrew-literal
// check in tooling/ allows this file.

import {
  byUrgency,
  type ListDetail,
  type ListItem,
  type ListSummary,
  listProgress,
  listsTally,
} from "@domain/lists";
import { ROLES } from "@domain/modules";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import type {
  ListLookups,
  ListScreenData,
  ListsHomeData,
  ListsTiming,
  SendFormData,
} from "../../../(app)/lists/list-types";
import { teamMembers } from "../data";

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

/** The send screen as Shiran has it: the restaurant's templates. */
export const demoSendForm: SendFormData = {
  templates: [
    {
      id: "t-kitchen-opening",
      name: "פתיחת מטבח",
      note: null,
      items: demoLists[0]?.items ?? [],
      recipient: { kind: "department", department: "dep-kitchen" },
      fromDepartment: null,
    },
    {
      id: "t-floor-opening",
      name: "פתיחת אולם",
      note: null,
      items: demoLists[1]?.items ?? [],
      recipient: { kind: "department", department: "dep-floor" },
      fromDepartment: null,
    },
    {
      id: "t-kitchen-closing",
      name: "סגירת מטבח",
      note: null,
      items: [
        { kind: "number", label: "מקרר ראשי" },
        { kind: "number", label: "מקפיא" },
        { kind: "check", label: "כיסוי ואחסון מזון" },
        { kind: "check", label: "ניקוי כיריים וגריל" },
        { kind: "check", label: "פינוי פחים" },
        { kind: "check", label: "סגירת גז" },
      ],
      recipient: { kind: "department", department: "dep-kitchen" },
      fromDepartment: null,
    },
    {
      id: "t-bar-order",
      name: "הזמנה מהבר למחסן",
      note: null,
      items: demoLists[3]?.items ?? [],
      recipient: { kind: "department", department: "dep-storeroom" },
      fromDepartment: "dep-bar",
    },
  ],
  initial: "t-kitchen-opening",
  free: true,
  people: teamMembers.map((m) => ({
    userId: m.userId,
    name: m.name,
    photo: m.photo,
  })),
  departments: demoDepartments.map((d) => ({ id: d.id, name: d.name })),
  roles: ROLES,
};

/** The people the department editor can put in a department. */
export const demoDepartmentPeople = teamMembers.map((m) => ({
  userId: m.userId,
  name: m.name,
  photo: m.photo,
}));
