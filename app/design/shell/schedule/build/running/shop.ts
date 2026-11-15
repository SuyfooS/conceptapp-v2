import {
  type AvailabilityAnswer,
  addDays,
  weekDates,
} from "@domain/availability";
import { shabbatLimits } from "@domain/availability-form";
import { draftWeek, type ScheduledShift } from "@domain/schedule";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES } from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";
import type { Position, ShiftPattern } from "@domain/staffing";
import type { ShiftSwap } from "@domain/swaps";
import type { TeamMember } from "@domain/team";
import type { AvailabilityWeek } from "../../../../../(app)/schedule/week";

// The demo shop (supabase/seed.sql, the retail template) for the twin of the
// running week (the running-week plan's R3a): its people, positions and shift
// pattern, and a week under way. Haifa, closed on Shabbat, the week from
// Sunday.

/** Tuesday 17 November 2026 at 11:20 in Haifa (winter time, UTC+2). */
export const SHOP_NOW = "2026-11-17T09:20:00.000Z";

const THIS_WEEK = "2026-11-15";
const NEXT_WEEK = addDays(THIS_WEEK, 7);

/** The retail template's positions. */
export const shopPositions: Position[] = [
  { key: "cashier", name: "קופאי/ת" },
  { key: "sales", name: "מוכר/ת" },
  { key: "stock", name: "מחסנאי/ת" },
  { key: "lead", name: "אחראי/ת משמרת" },
];

/** The retail template's shift pattern. */
export const shopPatterns: ShiftPattern[] = [
  {
    key: "morning",
    name: "בוקר",
    days: [0, 1, 2, 3, 4],
    start: "08:00",
    end: "15:00",
    needed: 2,
  },
  {
    key: "evening",
    name: "ערב",
    days: [0, 1, 2, 3, 4],
    start: "15:00",
    end: "22:00",
    needed: 2,
  },
  {
    key: "friday",
    name: "שישי",
    days: [5],
    start: "08:00",
    end: "14:00",
    needed: 3,
  },
];

const person = (
  userId: string,
  name: string,
  role: TeamMember["role"],
  n: number,
): TeamMember => ({
  userId,
  name,
  phone: `+97250300000${n}`,
  role,
  photo: null,
  addressForm: null,
});

/**
 * The shop's staff now. Liya left the team on Monday evening: she stays on
 * the shifts she worked (the screen names her as no longer on the team), and
 * came off this evening's, which is one short.
 */
export const shopTeam: TeamMember[] = [
  person("michal", "מיכל הדגמה", "owner", 1),
  person("omer", "עומר הדגמה", "manager", 2),
  person("tamar", "תמר אברהם", "worker", 3),
  person("itai", "איתי מזרחי", "worker", 4),
  person("roni", "רוני שלום", "worker", 5),
];

function shabbatOf(start: string) {
  return shabbatLimits(
    shabbatTimes(ISRAELI_CITIES.haifa, addDays(start, 5)),
    ISRAEL_TIME_ZONE,
  );
}

const weekOf = (start: string, dueAt: string): AvailabilityWeek => ({
  start,
  dates: weekDates(start),
  dueAt,
  timeZone: ISRAEL_TIME_ZONE,
  shabbat: shabbatOf(start),
  mine: null,
});

/** The week under way, 15–21 November; its answers were due on the 11th. */
export const shopThisWeek = weekOf(THIS_WEEK, "2026-11-11T16:00:00.000Z");

/** Next week, 22–28 November, which people are answering for now. */
export const shopNextWeek = weekOf(NEXT_WEEK, "2026-11-18T16:00:00.000Z");

/** Who works which shift of the week under way, by day and pattern. */
const placed: Record<string, [string, string | null][]> = {
  "2026-11-15/morning": [
    ["tamar", "cashier"],
    ["itai", "sales"],
  ],
  "2026-11-15/evening": [
    ["roni", "stock"],
    ["liya", "cashier"],
  ],
  "2026-11-16/morning": [
    ["liya", "cashier"],
    ["roni", "stock"],
  ],
  "2026-11-16/evening": [
    ["itai", "sales"],
    ["omer", "lead"],
  ],
  // Under way at 11:20.
  "2026-11-17/morning": [
    ["tamar", "cashier"],
    ["itai", "sales"],
  ],
  // Liya's place, freed when she left.
  "2026-11-17/evening": [["roni", "stock"]],
  "2026-11-18/morning": [
    ["roni", "stock"],
    ["tamar", "cashier"],
  ],
  "2026-11-18/evening": [
    ["itai", "sales"],
    ["omer", "lead"],
  ],
  "2026-11-19/morning": [
    ["itai", "sales"],
    ["omer", "lead"],
  ],
  "2026-11-19/evening": [
    ["tamar", "cashier"],
    ["roni", "stock"],
  ],
  "2026-11-20/friday": [
    ["tamar", "cashier"],
    ["itai", "sales"],
    ["roni", "stock"],
  ],
};

/** A stand-in for what the database digests of a shift: 32 hex digits. */
const digest = (n: number) => `${n}`.padStart(32, "0");

/** The week under way as the builder reads it: published, each shift with its id. */
export const shopRunningShifts: (ScheduledShift & { id: string })[] = draftWeek(
  THIS_WEEK,
  shopPatterns,
).map((shift, i) => ({
  ...shift,
  id: `00000000-0000-4000-9000-${`${i + 1}`.padStart(12, "0")}`,
  assignees: (placed[`${shift.day}/${shift.pattern}`] ?? []).map(
    ([user, position]) => ({ user, position }),
  ),
}));

export const shopRunningBasis = Object.fromEntries(
  shopRunningShifts.map((shift, i) => [shift.id, digest(i + 1)]),
);

/** When the week under way was published: Thursday the 12th. */
export const SHOP_PUBLISHED_AT = "2026-11-12T14:05:00.000Z";

const thursdayEvening = shopRunningShifts.find(
  (s) => s.day === "2026-11-19" && s.pattern === "evening",
);
if (!thursdayEvening)
  throw new Error("The shop's week has no Thursday evening");

/**
 * Roni gives his Thursday evening away. Filling this evening touches no
 * other shift, so his request waits on.
 */
export const shopSwaps: ShiftSwap[] = [
  {
    id: "00000000-0000-4000-a000-000000000301",
    shiftId: thursdayEvening.id,
    requestedBy: "roni",
    takenBy: null,
    status: "open",
  },
];

/**
 * What the staff sent for the week under way, before it began: Omer and
 * Michal are free this evening, Tamar only in the mornings, Itai and Roni
 * sent nothing.
 */
export const shopRunningAnswers: AvailabilityAnswer[] = [
  {
    userId: "omer",
    note: null,
    updatedAt: "2026-11-10T08:00:00.000Z",
    ranges: [
      { day: "2026-11-16", start: "15:00", end: "22:00" },
      { day: "2026-11-17", start: "14:00", end: "22:00" },
      { day: "2026-11-18", start: "15:00", end: "22:00" },
      { day: "2026-11-19", start: "08:00", end: "15:00" },
    ],
  },
  {
    userId: "michal",
    note: "רק אם חסר",
    updatedAt: "2026-11-10T18:30:00.000Z",
    ranges: [{ day: "2026-11-17", start: "12:00", end: "22:00" }],
  },
  {
    userId: "tamar",
    note: null,
    updatedAt: "2026-11-09T12:15:00.000Z",
    ranges: [
      { day: "2026-11-15", start: "08:00", end: "15:00" },
      { day: "2026-11-17", start: "08:00", end: "15:00" },
      { day: "2026-11-18", start: "08:00", end: "15:00" },
      { day: "2026-11-19", start: "15:00", end: "22:00" },
      { day: "2026-11-20", start: "08:00", end: "14:00" },
    ],
  },
];

/** Next week as nobody has saved it yet: the pattern, with nobody on it. */
export const shopNextShifts = draftWeek(NEXT_WEEK, shopPatterns);
