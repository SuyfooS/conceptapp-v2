/*
 * The clock's sums for the screens that run in the browser, apart from its
 * schemas in time-clock.ts, so a phone doesn't download Zod to tick a time. What
 * the server needs too is re-exported from there.
 */

/** An entry is at most this long; a longer open one waits for a manager. */
export const MAX_ENTRY_HOURS = 24;

type BreakSpan = {
  startedAt: string;
  endedAt: string | null;
  unpaid: boolean;
};

export type Span = {
  clockIn: string;
  clockOut: string | null;
  breaks?: readonly BreakSpan[];
};

const MAX_ENTRY_MS = MAX_ENTRY_HOURS * 3_600_000;

/**
 * Where an entry ends for counting: its end, or `now` while it is open. An
 * entry left open stops at `MAX_ENTRY_HOURS`, the most the database accepts,
 * so a forgotten clock-out does not keep adding to the month.
 */
export function countedEnd(entry: Span, now: Date): number {
  if (entry.clockOut !== null) return Date.parse(entry.clockOut);
  return Math.min(now.getTime(), Date.parse(entry.clockIn) + MAX_ENTRY_MS);
}

export function breakMs(pause: BreakSpan, end: number): number {
  const until = pause.endedAt === null ? end : Date.parse(pause.endedAt);
  return Math.max(0, until - Date.parse(pause.startedAt));
}

/** The entry is open for longer than one can be: only a manager can close it. */
export function entryOverdue(
  entry: Pick<Span, "clockIn" | "clockOut">,
  now: Date,
): boolean {
  return (
    entry.clockOut === null &&
    now.getTime() - Date.parse(entry.clockIn) > MAX_ENTRY_MS
  );
}

/**
 * The refusals of a press on the clock that say to ask whoever approves
 * hours (`app.clock.failure.*`, each a `PunchFailure`): a shift open over
 * `MAX_ENTRY_HOURS`, a clock-out too old to take back, times that meet
 * another shift's. Under each, the clock offers whom to ask (closing the
 * pilot, PR 8; @domain/ask-fix).
 */
export const FIX_FAILURES = ["tooLong", "tooLate", "times"] as const;

/** Whether the clock offers whom to ask under this refusal. */
export function asksForFix(failure: string | null): boolean {
  return (FIX_FAILURES as readonly string[]).includes(failure ?? "");
}

/**
 * A closed shift that counted longer than this is worth a look: 14 hours, the
 * payroll engine's own limit (`LIMITS.entry` in @domain/payroll-flags is this
 * one), the same for every kind of business. The clock takes a clock-out up
 * to `MAX_ENTRY_HOURS` after the clock-in, so a clock-out forgotten until the
 * next morning is recorded as a long shift, not one that needs fixing.
 */
export const LONG_ENTRY_MINUTES = 14 * 60;

/**
 * Whether a shift may hide a forgotten clock-out: closed, and counted longer
 * than `LONG_ENTRY_MINUTES`. Beside it, as beside one that needs fixing, the
 * clock offers whom to ask (closing the pilot, PR 8): under the one just
 * left, and in the person's shifts while nobody has looked at it yet
 * (`longShiftToAsk`).
 */
export function longShift(shift: {
  out: string | null;
  minutes: number;
}): boolean {
  return shift.out !== null && shift.minutes > LONG_ENTRY_MINUTES;
}

/**
 * Whether the person's shifts offer whom to ask beside this long one: nobody
 * has corrected it or added it for them. Once whoever approves hours wrote
 * its times, a long one is what they meant (a double shift), and there is
 * nothing left to ask.
 */
export function longShiftToAsk(shift: {
  out: string | null;
  minutes: number;
  byManager: boolean;
  correction: object | null;
}): boolean {
  return longShift(shift) && shift.correction === null && !shift.byManager;
}

/**
 * What an entry counts for, in milliseconds: its length, without its unpaid
 * breaks. An open entry and an open break count until `now`.
 */
export function entryMs(entry: Span, now: Date): number {
  const end = countedEnd(entry, now);
  const unpaid = (entry.breaks ?? [])
    .filter((pause) => pause.unpaid)
    .reduce((sum, pause) => sum + breakMs(pause, end), 0);
  return Math.max(0, end - Date.parse(entry.clockIn) - unpaid);
}

export function addMonths(month: string, months: number): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + months;
  const pad = String((total % 12) + 1).padStart(2, "0");
  return `${Math.floor(total / 12)}-${pad}`;
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
