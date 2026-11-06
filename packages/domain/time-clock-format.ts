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
