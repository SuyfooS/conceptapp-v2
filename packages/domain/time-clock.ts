import { z } from "zod";
import { addDays, dateIn } from "./availability";

/**
 * The time clock: entries of time at work, as the database stores them
 * (`public.time_entries`). The database holds the rules (`clock_in`,
 * `clock_out`, `add_time_entry`, `correct_time_entry`); these are the
 * sums the screens show. An entry belongs to the day its clock-in falls
 * on in the business's time zone, so an evening that runs past midnight
 * counts on the evening's day and in that day's week.
 */

/** A punch code stays valid this long after the device shows it. */
export const PUNCH_CODE_TTL_SECONDS = 120;
/** The device shows a fresh code this often, well inside its lifetime. */
export const PUNCH_CODE_REFRESH_SECONDS = 30;
/** An entry is at most this long; a longer open one waits for a manager. */
export const MAX_ENTRY_HOURS = 24;

export const timeEntry = z
  .object({
    id: z.uuid(),
    userId: z.string(),
    clockIn: z.iso.datetime({ offset: true }),
    clockOut: z.iso.datetime({ offset: true }).nullable(),
    source: z.enum(["punch", "manager"]),
  })
  .refine(
    (e) =>
      e.clockOut === null || Date.parse(e.clockOut) > Date.parse(e.clockIn),
    {
      message: "An entry must end after it starts",
      path: ["clockOut"],
    },
  );
export type TimeEntry = z.infer<typeof timeEntry>;

type Span = Pick<TimeEntry, "clockIn" | "clockOut">;

/** Whole minutes in an entry; an open one counts until `now`. */
export function entryMinutes(entry: Span, now: Date): number {
  const end =
    entry.clockOut === null ? now.getTime() : Date.parse(entry.clockOut);
  return Math.max(0, Math.floor((end - Date.parse(entry.clockIn)) / 60_000));
}

/** The business day an entry belongs to: its clock-in's date there. */
export function entryDate(
  entry: Pick<TimeEntry, "clockIn">,
  timeZone: string,
): string {
  return dateIn(new Date(entry.clockIn), timeZone);
}

export type WeekSummary = {
  /** The seven dates of the week, each with its minutes. */
  days: { date: string; minutes: number }[];
  total: number;
};

/**
 * One person's week starting on `weekStart`: minutes per day and in all.
 * Pass only their entries; entries of other weeks are left out.
 */
export function weekSummary(
  entries: readonly Span[],
  weekStart: string,
  timeZone: string,
  now: Date,
): WeekSummary {
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    minutes: 0,
  }));
  for (const entry of entries) {
    const day = days.find((d) => d.date === entryDate(entry, timeZone));
    if (day) day.minutes += entryMinutes(entry, now);
  }
  return { days, total: days.reduce((sum, d) => sum + d.minutes, 0) };
}

/** Each person's minutes in the week, for the manager's table. */
export function weekTotals(
  entries: readonly Pick<TimeEntry, "userId" | "clockIn" | "clockOut">[],
  weekStart: string,
  timeZone: string,
  now: Date,
): Map<string, number> {
  const byUser = new Map<string, Span[]>();
  for (const entry of entries) {
    byUser.set(entry.userId, [...(byUser.get(entry.userId) ?? []), entry]);
  }
  return new Map(
    [...byUser].map(([userId, mine]) => [
      userId,
      weekSummary(mine, weekStart, timeZone, now).total,
    ]),
  );
}

export type AtWork = { userId: string; since: string; minutes: number };

/**
 * Who is at work at `now`: everyone with an open entry that has started,
 * the longest there first.
 */
export function atWorkNow(
  entries: readonly Pick<TimeEntry, "userId" | "clockIn" | "clockOut">[],
  now: Date,
): AtWork[] {
  return entries
    .filter(
      (e) => e.clockOut === null && Date.parse(e.clockIn) <= now.getTime(),
    )
    .sort((a, b) => Date.parse(a.clockIn) - Date.parse(b.clockIn))
    .map((e) => ({
      userId: e.userId,
      since: e.clockIn,
      minutes: entryMinutes(e, now),
    }));
}

/** The person's open entry, if they are clocked in. */
export function openEntryOf<E extends Pick<TimeEntry, "userId" | "clockOut">>(
  entries: readonly E[],
  userId: string,
): E | null {
  return (
    entries.find((e) => e.userId === userId && e.clockOut === null) ?? null
  );
}

/** Minutes rounded to the nearest `step` (the module's `roundToMinutes`). */
export function roundMinutes(minutes: number, step: 0 | 5 | 15): number {
  return step === 0 ? minutes : Math.round(minutes / step) * step;
}

/** Why the database refused a clock write, for the screen to say. */
export type ClockFailure =
  | "code"
  | "alreadyIn"
  | "notIn"
  | "tooLong"
  | "times"
  | "noAccess"
  | "failed";

/** Maps an error from the clock functions to what the screen says. */
export function clockFailureOf(
  code: string | undefined,
  message = "",
): ClockFailure {
  switch (code) {
    case "28000":
      return "code";
    case "23P01":
      return /already clocked in/i.test(message) ? "alreadyIn" : "times";
    case "55000":
      return /24 hours/i.test(message) ? "tooLong" : "notIn";
    case "22023":
      return "times";
    case "42501":
    case "P0002":
      return "noAccess";
    default:
      return "failed";
  }
}
