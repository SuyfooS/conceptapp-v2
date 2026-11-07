import { addDays, dateIn } from "./availability";
import { minutesOf, rangeMinutes } from "./hours";
import type { Role } from "./modules";
import type { ScheduledShift } from "./schedule";
import { timeIn } from "./shabbat";

/**
 * What the Today screen reads from the schedule, free of React and the
 * database: which part of the day it is, the next shift and how far off it
 * is, and what is waiting for the person. Shifts hold wall-clock times in
 * the business's zone, so everything here compares against the same clock.
 */

/** The moment the screen is read, on the business's clock. */
export type BusinessClock = {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
};

export function clockAt(instant: Date, timeZone: string): BusinessClock {
  return { date: dateIn(instant, timeZone), time: timeIn(instant, timeZone) };
}

export type DayPart = "morning" | "noon" | "evening" | "night";

/** Which greeting fits: morning from 05:00, noon from 12:00, evening from 17:00, night from 22:00. */
export function dayPart(time: string): DayPart {
  const hour = Math.floor(minutesOf(time) / 60);
  if (hour < 5 || hour >= 22) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "noon";
  return "evening";
}

type Timed = Pick<ScheduledShift, "day" | "start" | "end">;

/** Minutes on one running count across dates, for comparing wall-clock times. */
const minuteOf = (date: string, time: string) =>
  Date.parse(`${date}T00:00:00Z`) / 60_000 + minutesOf(time);

const spanOf = (shift: Timed): [number, number] => {
  const from = minuteOf(shift.day, shift.start);
  return [from, from + rangeMinutes(shift.start, shift.end)];
};

export type ShiftPhase = "before" | "now" | "after";

/** Whether a shift has started and ended (past midnight counts). */
export function shiftPhase(shift: Timed, clock: BusinessClock): ShiftPhase {
  const now = minuteOf(clock.date, clock.time);
  const [from, to] = spanOf(shift);
  if (now < from) return "before";
  return now < to ? "now" : "after";
}

/**
 * The shift on now or the soonest one to come, of `userId` when given and of
 * anyone otherwise. Shifts that already ended are skipped, also earlier today.
 */
export function nextShift<S extends Timed & Pick<ScheduledShift, "assignees">>(
  shifts: readonly S[],
  clock: BusinessClock,
  userId?: string,
): S | null {
  const ahead = shifts
    .filter(
      (shift) =>
        shiftPhase(shift, clock) !== "after" &&
        (userId === undefined ||
          shift.assignees.some((a) => a.user === userId)),
    )
    .map((shift) => ({ shift, from: spanOf(shift)[0] }))
    .sort((a, b) => a.from - b.from);
  return ahead[0]?.shift ?? null;
}

/**
 * The day before the week when `today` is the week's first day, else null. A
 * shift on that day that runs past midnight can still be on, and it belongs
 * to the week before, which this week's schedule does not hold.
 */
export function overnightDay(today: string, weekStart: string): string | null {
  return today === weekStart ? addDays(weekStart, -1) : null;
}

/** How far off a shift is, in the words someone would use for it. */
export type ShiftWhen =
  | { kind: "now" }
  | { kind: "minutes"; count: number }
  | { kind: "hours"; count: number }
  | { kind: "tomorrow" }
  | { kind: "later" };

/**
 * Under an hour in minutes, later today in rounded hours, then "tomorrow",
 * and after that the screen names the day. A shift that ended reads as "now";
 * `nextShift` never returns one.
 */
export function shiftWhen(shift: Timed, clock: BusinessClock): ShiftWhen {
  if (shiftPhase(shift, clock) !== "before") return { kind: "now" };
  const minutes =
    minuteOf(shift.day, shift.start) - minuteOf(clock.date, clock.time);
  if (minutes < 60) return { kind: "minutes", count: minutes };
  if (shift.day === clock.date) {
    return { kind: "hours", count: Math.round(minutes / 60) };
  }
  return shift.day === addDays(clock.date, 1)
    ? { kind: "tomorrow" }
    : { kind: "later" };
}

/**
 * Where the person's availability for next week stands:
 * - `sent`: it is in;
 * - `due`: not yet, and there is still time;
 * - `late`: not yet, and the due moment passed;
 * - `closed`: not yet, and next week is already published, so it is moot.
 */
export type AvailabilityStatus = "sent" | "due" | "late" | "closed";

export function availabilityStatus(week: {
  sent: boolean;
  published: boolean;
  /** ISO timestamp. */
  dueAt: string;
  now: Date;
}): AvailabilityStatus {
  if (week.sent) return "sent";
  if (week.published) return "closed";
  return Date.parse(week.dueAt) < week.now.getTime() ? "late" : "due";
}

/** One thing that waits for the person, with where it stands. */
export type TodayTile =
  | { key: "availability"; status: AvailabilityStatus }
  | { key: "offers"; count: number }
  | { key: "gaps"; count: number }
  | { key: "missing"; count: number; late: boolean }
  | { key: "swaps"; count: number };

/**
 * The tiles a person gets. Workers: their own availability and the shifts
 * they can take. Owners and managers: open places next week (when it has
 * shifts), who has not sent availability (until next week is published) and
 * swap requests. A manager works shifts too, so their own availability joins
 * while it is missing; owners do not owe one (`missingAvailability`).
 */
export function todayTiles({
  role,
  availability,
  offers,
  team,
}: {
  role: Role;
  availability: AvailabilityStatus;
  offers: number;
  /** What an owner or manager reads; null for a worker. */
  team: {
    /** People next week's shifts still need; null when it has no shifts. */
    gaps: number | null;
    /** Who has not sent availability; null once next week is published. */
    missing: number | null;
    /** Availability's due moment passed, whether or not this person sent theirs. */
    pastDue: boolean;
    swaps: number;
  } | null;
}): TodayTile[] {
  const own = { key: "availability", status: availability } as const;
  if (!team) return [own, { key: "offers", count: offers }];
  const owes = availability === "due" || availability === "late";
  return [
    ...(team.gaps === null ? [] : [{ key: "gaps", count: team.gaps } as const]),
    ...(team.missing === null
      ? []
      : [
          {
            key: "missing",
            count: team.missing,
            late: team.pastDue,
          } as const,
        ]),
    { key: "swaps", count: team.swaps },
    ...(role === "manager" && owes ? [own] : []),
  ];
}

/** Whether a tile asks the person to do something, rather than saying all is well. */
export function tileNeedsAction(tile: TodayTile): boolean {
  if (tile.key === "availability") {
    return tile.status === "due" || tile.status === "late";
  }
  return tile.count > 0;
}
