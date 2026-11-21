import type {
  NotificationLookups,
  NotificationRow,
  NotificationShift,
} from "@domain/notifications";
import { orderDemoDepartments } from "../../order-taking/data";
import { byId, demoShiftPatterns, teamMembers } from "../data";

// Shiran's notifications in the demo restaurant on Tuesday 3 November 2026 at
// 08:12, as rows from the database and the people they name. The names and
// shift names come from the demo's own data, so this file holds no copy.

/** The moment the demo reads them. */
export const demoInboxNow = "2026-11-03T06:12:00.000Z";

/** Shiran, who reads them. */
export const DEMO_READER = "00000000-0000-4000-a000-0000000000a0";

// The demo's people, with the ids rows carry.
const PEOPLE = {
  shiran: DEMO_READER,
  uri: "00000000-0000-4000-a000-0000000000a1",
  noa: "00000000-0000-4000-a000-0000000000a2",
  yoav: "00000000-0000-4000-a000-0000000000a3",
  maya: "00000000-0000-4000-a000-0000000000a4",
  itay: "00000000-0000-4000-a000-0000000000a5",
  omer: "00000000-0000-4000-a000-0000000000a6",
} as const;

const nameOf = (key: keyof typeof PEOPLE) =>
  byId[key]?.name ?? teamMembers.find((m) => m.userId === key)?.name ?? null;

export const demoInboxLookups: NotificationLookups = {
  members: new Map(
    (Object.keys(PEOPLE) as (keyof typeof PEOPLE)[]).map((key) => [
      PEOPLE[key],
      { active: true, name: nameOf(key) },
    ]),
  ),
};

function shift(pattern: string, day: string): NotificationShift {
  const found = demoShiftPatterns.find((p) => p.key === pattern);
  return {
    day,
    name: found?.name ?? pattern,
    start: found?.start ?? "09:00",
    end: found?.end ?? "16:00",
  };
}

const line = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`;

/** Unread: a swap and hours to approve, and a shift she could take. */
export const demoUnread: NotificationRow[] = [
  {
    id: line(1),
    kind: "clock.confirm",
    params: {
      entry: line(9),
      person: PEOPLE.yoav,
      proof: "none",
      direction: "in",
      at: "2026-11-03T05:58:00.000Z",
    },
    actorId: PEOPLE.yoav,
    createdAt: "2026-11-03T05:58:00.000Z",
    readAt: null,
    resolvedAt: null,
  },
  {
    id: line(2),
    kind: "swap.waiting",
    params: {
      swap: line(8),
      shift: shift("morning", "2026-11-04"),
      from: PEOPLE.maya,
      to: PEOPLE.itay,
    },
    actorId: PEOPLE.itay,
    createdAt: "2026-11-03T05:41:00.000Z",
    readAt: null,
    resolvedAt: null,
  },
  {
    id: line(3),
    kind: "swap.offered",
    params: {
      swap: line(7),
      shift: shift("friday", "2026-11-06"),
      from: PEOPLE.noa,
    },
    actorId: PEOPLE.noa,
    createdAt: "2026-11-02T18:20:00.000Z",
    readAt: null,
    resolvedAt: null,
  },
];

/**
 * Already read: a change to her shifts in the week under way (Wednesday's
 * evening starts later now, which replaced the line saying the week was
 * published: one line per week), her own wage set from the first of the
 * month (its day, never the amount), hours someone else confirmed, a swap
 * decided, what managers do in lists changed (sending taken away, R10), pay
 * access the ConceptApp team gave her from the console (who was never in the
 * restaurant, so the line says the team), someone joining.
 */
export const demoEarlier: NotificationRow[] = [
  {
    id: line(5),
    kind: "schedule.changed",
    params: {
      week: line(5),
      startsOn: "2026-11-01",
      mine: 3,
      running: true,
      nearest: {
        change: "moved",
        shift: { ...shift("evening", "2026-11-04"), start: "18:00" },
      },
    },
    actorId: PEOPLE.uri,
    createdAt: "2026-11-02T17:40:00.000Z",
    readAt: "2026-11-02T18:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: "a0000000-0000-4000-8000-000000000011",
    kind: "pay.wage_set",
    params: { since: "2026-11-01" },
    actorId: PEOPLE.uri,
    createdAt: "2026-11-02T07:30:00.000Z",
    readAt: "2026-11-02T08:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: line(0),
    kind: "clock.confirm",
    params: {
      entry: "a0000000-0000-4000-8000-000000000010",
      person: PEOPLE.maya,
      proof: "none",
      direction: "in",
      at: "2026-11-02T05:02:00.000Z",
    },
    actorId: PEOPLE.maya,
    createdAt: "2026-11-02T05:02:00.000Z",
    readAt: "2026-11-02T06:00:00.000Z",
    // Uri confirmed them: the line no longer asks Shiran for anything.
    resolvedAt: "2026-11-02T06:00:00.000Z",
  },
  {
    id: line(4),
    kind: "swap.approved",
    params: {
      swap: line(6),
      shift: shift("evening", "2026-11-01"),
      from: PEOPLE.yoav,
      to: PEOPLE.noa,
    },
    actorId: PEOPLE.uri,
    createdAt: "2026-10-31T17:05:00.000Z",
    readAt: "2026-10-31T17:30:00.000Z",
    resolvedAt: null,
  },
  {
    // Uri took sending lists from managers (the roles plan's R10): in the
    // app alone, from where her line began to now.
    id: "a0000000-0000-4000-8000-000000000013",
    kind: "role.changed",
    params: {
      role: "manager",
      area: "lists",
      from: { "lists.manage": true, "lists.send": true },
      to: { "lists.manage": true, "lists.send": false },
    },
    actorId: PEOPLE.uri,
    createdAt: "2026-10-29T08:15:00.000Z",
    readAt: "2026-10-29T09:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: "a0000000-0000-4000-8000-000000000012",
    kind: "access.pay_granted",
    params: {},
    // Someone on the ConceptApp team: in no membership of the restaurant.
    actorId: "00000000-0000-4000-a000-0000000000c0",
    createdAt: "2026-10-27T09:30:00.000Z",
    readAt: "2026-10-27T10:00:00.000Z",
    resolvedAt: null,
  },
  {
    id: line(6),
    kind: "team.joined",
    params: { person: PEOPLE.omer },
    actorId: PEOPLE.omer,
    createdAt: "2026-10-22T09:00:00.000Z",
    readAt: "2026-10-22T10:00:00.000Z",
    resolvedAt: null,
  },
];

// ---------------------------------------------------------------------------
// The lines about orders (waiter mode P8b), on the order twin's evening of
// Thursday 19 November 2026 at 20:42: Shiran runs orders and is on the
// clock, and sent tables 4 and 11 (app/design/order-taking/data.ts).

/** The moment the order lines are read: the order twin's evening. */
export const demoOrderInboxNow = "2026-11-19T18:42:00.000Z";

const ORDER_IDS = {
  order4: "b0000000-0000-4000-8000-0000000000a4",
  order11: "b0000000-0000-4000-8000-0000000000b1",
  table4: "b0000000-0000-4000-8000-0000000000c4",
  table11: "b0000000-0000-4000-8000-0000000000d1",
  kitchen: "b0000000-0000-4000-8000-0000000000e1",
  bar: "b0000000-0000-4000-8000-0000000000e2",
} as const;

const departmentName = (key: string) =>
  orderDemoDepartments.find((d) => d.key === key)?.name ?? null;

const orderLine = (n: number) => `a0000000-0000-4000-8000-0000000000f${n}`;

/**
 * Where an order line leads in the order twin: table 4 with its kitchen
 * screen not connected, table 11 as the evening runs, and one's own orders.
 */
export function orderTwinLead(href: `/${string}`): string | null {
  const base = "/design/order-taking";
  if (href === `/orders/place/${ORDER_IDS.table4}`) {
    return `${base}/floor/order?place=table-4&state=screenOff`;
  }
  if (href === `/orders/place/${ORDER_IDS.table11}`) {
    return `${base}/floor/order?place=table-11&state=service`;
  }
  if (href.startsWith("/orders")) return `${base}/mine?state=service`;
  return null;
}

/**
 * Unread: no kitchen screen fetched table 4's starters (from the app), and
 * table 11's desserts are ready (Noa marked them).
 */
export const demoOrderUnread: NotificationRow[] = [
  {
    id: orderLine(1),
    kind: "order.unseen",
    params: {
      order: ORDER_IDS.order4,
      ticket: "b0000000-0000-4000-8000-0000000000f1",
      place: ORDER_IDS.table4,
      placeName: "4",
      takeaway: null,
      department: ORDER_IDS.kitchen,
      departmentName: departmentName("kitchen"),
      count: 2,
    },
    actorId: null,
    createdAt: "2026-11-19T18:38:00.000Z",
    readAt: null,
    resolvedAt: null,
  },
  {
    id: orderLine(2),
    kind: "order.ready",
    params: {
      order: ORDER_IDS.order11,
      ticket: "b0000000-0000-4000-8000-0000000000f2",
      place: ORDER_IDS.table11,
      placeName: "11",
      takeaway: null,
      department: ORDER_IDS.kitchen,
      departmentName: departmentName("kitchen"),
      count: 2,
    },
    actorId: PEOPLE.noa,
    createdAt: "2026-11-19T18:40:00.000Z",
    readAt: null,
    resolvedAt: null,
  },
];

/**
 * Read and settled: table 4's beers, marked ready on the bar's screen (so by
 * nobody) and served since.
 */
export const demoOrderEarlier: NotificationRow[] = [
  {
    id: orderLine(3),
    kind: "order.ready",
    params: {
      order: ORDER_IDS.order4,
      ticket: "b0000000-0000-4000-8000-0000000000f3",
      place: ORDER_IDS.table4,
      placeName: "4",
      takeaway: null,
      department: ORDER_IDS.bar,
      departmentName: departmentName("bar"),
      count: 2,
    },
    actorId: null,
    createdAt: "2026-11-19T18:37:00.000Z",
    readAt: "2026-11-19T18:39:00.000Z",
    resolvedAt: "2026-11-19T18:39:00.000Z",
  },
];
