import { z } from "zod";
import { addDays, dateIn, instantIn } from "./availability";
import { timeIn } from "./shabbat";

/**
 * The time clock: entries of time at work and the breaks inside them, as the
 * database stores them (`public.time_entries`, `public.time_breaks`). The
 * database holds the rules (`clock_in`, `clock_out`, `start_break`,
 * `end_break`, `add_time_entry`, `correct_time_entry`); these are the sums
 * the screens show. An entry belongs to the day its clock-in falls on in the
 * business's time zone, so an evening that runs past midnight counts on the
 * evening's day and in that day's week and month.
 *
 * A break records whether it was unpaid when it began, from the business's
 * setting, so changing the setting never rewrites hours already worked.
 */

/** A punch code stays valid this long after the device shows it. */
export const PUNCH_CODE_TTL_SECONDS = 120;
/** The device shows a fresh code this often, well inside its lifetime. */
export const PUNCH_CODE_REFRESH_SECONDS = 30;
/** An entry is at most this long; a longer open one waits for a manager. */
export const MAX_ENTRY_HOURS = 24;
/** How long after leaving a person can take it back themselves. */
export const UNDO_CLOCK_OUT_SECONDS = 120;

export const timeBreak = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  unpaid: z.boolean(),
});
export type TimeBreak = z.infer<typeof timeBreak>;

export const timeEntry = z
  .object({
    id: z.uuid(),
    userId: z.string(),
    clockIn: z.iso.datetime({ offset: true }),
    clockOut: z.iso.datetime({ offset: true }).nullable(),
    source: z.enum(["punch", "manager"]),
    breaks: z.array(timeBreak).default([]),
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

type BreakSpan = Pick<TimeBreak, "startedAt" | "endedAt" | "unpaid">;
type Span = Pick<TimeEntry, "clockIn" | "clockOut"> & {
  breaks?: readonly BreakSpan[];
};

function breakMs(pause: BreakSpan, now: Date): number {
  const end =
    pause.endedAt === null ? now.getTime() : Date.parse(pause.endedAt);
  return Math.max(0, end - Date.parse(pause.startedAt));
}

/**
 * What an entry counts for, in milliseconds: its length, without its unpaid
 * breaks. An open entry and an open break count until `now`.
 */
export function entryMs(entry: Span, now: Date): number {
  const end =
    entry.clockOut === null ? now.getTime() : Date.parse(entry.clockOut);
  const unpaid = (entry.breaks ?? [])
    .filter((pause) => pause.unpaid)
    .reduce((sum, pause) => sum + breakMs(pause, now), 0);
  return Math.max(0, end - Date.parse(entry.clockIn) - unpaid);
}

/** The whole minutes an entry counts for. */
export function entryMinutes(entry: Span, now: Date): number {
  return Math.floor(entryMs(entry, now) / 60_000);
}

/** Whole minutes on break in an entry, paid or not. */
export function breakMinutes(entry: Pick<Span, "breaks">, now: Date): number {
  const all = (entry.breaks ?? []).reduce(
    (sum, pause) => sum + breakMs(pause, now),
    0,
  );
  return Math.floor(all / 60_000);
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

/** Where a person stands: away, at work, or on a break of their open entry. */
export type ClockStatus<E extends Pick<TimeEntry, "breaks">> =
  | { state: "off" }
  | { state: "working"; entry: E }
  | { state: "break"; entry: E; pause: TimeBreak };

export function clockStatus<E extends Pick<TimeEntry, "breaks">>(
  open: E | null,
): ClockStatus<E> {
  if (!open) return { state: "off" };
  const pause = open.breaks.find((b) => b.endedAt === null);
  return pause
    ? { state: "break", entry: open, pause }
    : { state: "working", entry: open };
}

/** A month as `YYYY-MM`: the first seven characters of a date. */
export const monthOf = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, months: number): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + months;
  const pad = String((total % 12) + 1).padStart(2, "0");
  return `${Math.floor(total / 12)}-${pad}`;
}

/** The instants a month starts and ends in the business's time zone. */
export function monthRange(
  month: string,
  timeZone: string,
): { from: Date; to: Date } {
  return {
    from: instantIn(`${month}-01`, "00:00", timeZone),
    to: instantIn(`${addMonths(month, 1)}-01`, "00:00", timeZone),
  };
}

/**
 * The minutes one person's entries count for in a month, each rounded by the
 * module's `roundToMinutes`. Pass only their entries; other months are left out.
 */
export function monthMinutes(
  entries: readonly Span[],
  month: string,
  timeZone: string,
  now: Date,
  step: 0 | 5 | 15 = 0,
): number {
  return entries
    .filter((entry) => monthOf(entryDate(entry, timeZone)) === month)
    .reduce(
      (sum, entry) => sum + roundMinutes(entryMinutes(entry, now), step),
      0,
    );
}

export type ShiftRecord = {
  id: string;
  /** The business day it belongs to. */
  date: string;
  in: string;
  /** Null while still at work. */
  out: string | null;
  minutes: number;
  breakMinutes: number;
  /** A manager wrote it down instead of the person punching. */
  byManager: boolean;
};

/** One person's entries of a month as the history shows them, newest first. */
export function monthRecords(
  entries: readonly TimeEntry[],
  month: string,
  timeZone: string,
  now: Date,
  step: 0 | 5 | 15 = 0,
): ShiftRecord[] {
  return entries
    .filter((entry) => monthOf(entryDate(entry, timeZone)) === month)
    .sort((a, b) => Date.parse(b.clockIn) - Date.parse(a.clockIn))
    .map((entry) => ({
      id: entry.id,
      date: entryDate(entry, timeZone),
      in: timeIn(new Date(entry.clockIn), timeZone),
      out:
        entry.clockOut === null
          ? null
          : timeIn(new Date(entry.clockOut), timeZone),
      minutes: roundMinutes(entryMinutes(entry, now), step),
      breakMinutes: breakMinutes(entry, now),
      byManager: entry.source === "manager",
    }));
}

/**
 * The entry the person can still take back: the one they left last, within
 * `UNDO_CLOCK_OUT_SECONDS`, when they punched it themselves.
 */
export function undoableEntry<E extends Pick<TimeEntry, "clockOut" | "source">>(
  entries: readonly E[],
  now: Date,
): E | null {
  const closed = entries
    .filter((entry) => entry.clockOut !== null)
    .sort(
      (a, b) => Date.parse(b.clockOut ?? "") - Date.parse(a.clockOut ?? ""),
    )[0];
  if (closed?.source !== "punch") return null;
  const age = now.getTime() - Date.parse(closed.clockOut ?? "");
  return age <= UNDO_CLOCK_OUT_SECONDS * 1000 ? closed : null;
}

/** Minutes as hours and minutes: `86:05`. */
export function formatHours(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** A running time as `3:42:07`. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const rest = String(seconds % 60).padStart(2, "0");
  return `${formatHours(Math.floor(seconds / 60))}:${rest}`;
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
  | "alreadyOnBreak"
  | "notOnBreak"
  | "tooLate"
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
      if (/already clocked in/i.test(message)) return "alreadyIn";
      return /already on a break/i.test(message) ? "alreadyOnBreak" : "times";
    case "55000":
      if (/24 hours/i.test(message)) return "tooLong";
      if (/not on a break/i.test(message)) return "notOnBreak";
      return /too late/i.test(message) ? "tooLate" : "notIn";
    case "22023":
      return "times";
    case "42501":
    case "P0002":
      return "noAccess";
    default:
      return "failed";
  }
}
