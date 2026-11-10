import type {
  NotificationLookups,
  NotificationRow,
  NotificationShift,
} from "@domain/notifications";
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
 * Already read: hours someone else confirmed, her own wage set from the
 * first of the month (its day, never the amount), a swap decided, the week
 * published, someone joining.
 */
export const demoEarlier: NotificationRow[] = [
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
    id: line(5),
    kind: "schedule.published",
    params: { week: line(5), startsOn: "2026-11-01", mine: 4 },
    actorId: PEOPLE.uri,
    createdAt: "2026-10-29T15:00:00.000Z",
    readAt: "2026-10-29T15:20:00.000Z",
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
