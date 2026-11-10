import { dateIn } from "./availability";
import { timeIn } from "./shabbat";
import {
  correctionOf,
  type EntryProof,
  entryDate,
  entryMinutes,
  entryToConfirm,
  monthOf,
  type ShiftCorrection,
  type TimeEntry,
} from "./time-clock";
import { breakMs, countedEnd } from "./time-clock-format";

/**
 * A month of hours as payroll reads it (payroll P3): to the minute, whatever
 * the clock's rounding, each person's days, shifts, unpaid breaks, and what to
 * look at before paying (shifts corrected, waiting for a confirmation, still
 * open). Hours only: wages and amounts come with P4 and P7.
 */

/** One person's month. */
export type PayTotals = {
  /** Paid minutes, exact: unpaid breaks off, never rounded. */
  minutes: number;
  /** Business days with at least one shift. */
  days: number;
  shifts: number;
  unpaidBreakMinutes: number;
  /** Shifts a manager corrected or added. */
  corrected: number;
  /** Shifts with a time still waiting for a confirmation. */
  waiting: number;
  /** Of those, the ones only an owner confirms (someone's own hours). */
  ownerOnly: number;
  /** Shifts of the month that haven't ended. */
  open: number;
};

export const NO_PAY_TOTALS: PayTotals = {
  minutes: 0,
  days: 0,
  shifts: 0,
  unpaidBreakMinutes: 0,
  corrected: 0,
  waiting: 0,
  ownerOnly: 0,
  open: 0,
};

/** What to look at before paying: waiting and open shifts. */
export function toCheck(totals: PayTotals): number {
  return totals.waiting + totals.open;
}

/** Whole minutes of unpaid break in an entry. */
export function unpaidBreakMinutes(entry: TimeEntry, now: Date): number {
  const end = countedEnd(entry, now);
  const ms = entry.breaks
    .filter((pause) => pause.unpaid)
    .reduce((sum, pause) => sum + breakMs(pause, end), 0);
  return Math.floor(ms / 60_000);
}

/** Each person's month, from a business's entries. Other months are left out. */
export function payTotals(
  entries: readonly TimeEntry[],
  month: string,
  timeZone: string,
  now: Date,
): Map<string, PayTotals> {
  const people = new Map<string, PayTotals & { dates: Set<string> }>();
  for (const entry of entries) {
    const date = entryDate(entry, timeZone);
    if (monthOf(date) !== month) continue;
    const sum = people.get(entry.userId) ?? {
      ...NO_PAY_TOTALS,
      dates: new Set<string>(),
    };
    const waits = entryToConfirm(entry);
    sum.dates.add(date);
    people.set(entry.userId, {
      ...sum,
      minutes: sum.minutes + entryMinutes(entry, now),
      days: sum.dates.size,
      shifts: sum.shifts + 1,
      unpaidBreakMinutes:
        sum.unpaidBreakMinutes + unpaidBreakMinutes(entry, now),
      corrected: sum.corrected + (entry.editedBy !== null ? 1 : 0),
      waiting: sum.waiting + (waits ? 1 : 0),
      ownerOnly: sum.ownerOnly + (waits?.ownerOnly ? 1 : 0),
      open: sum.open + (entry.clockOut === null ? 1 : 0),
    });
  }
  return new Map(
    [...people].map(([userId, { dates: _dates, ...totals }]) => [
      userId,
      totals,
    ]),
  );
}

/** Several people's months as one. */
export function addTotals(all: Iterable<PayTotals>): PayTotals {
  let sum = NO_PAY_TOTALS;
  for (const one of all) {
    sum = {
      minutes: sum.minutes + one.minutes,
      days: sum.days + one.days,
      shifts: sum.shifts + one.shifts,
      unpaidBreakMinutes: sum.unpaidBreakMinutes + one.unpaidBreakMinutes,
      corrected: sum.corrected + one.corrected,
      waiting: sum.waiting + one.waiting,
      ownerOnly: sum.ownerOnly + one.ownerOnly,
      open: sum.open + one.open,
    };
  }
  return sum;
}

/**
 * How a shift was recorded, for the payroll's source column: a manager wrote
 * it down, or the weaker of its two times (someone's own, without a code, a
 * manager's correction, punched with no code asked, an owner's, typed digits,
 * a scan). "punch" for times from before codes.
 */
export type PaySource =
  | "added"
  | "self"
  | "none"
  | "manager"
  | "punch"
  | "off"
  | "owner"
  | "typed"
  | "scan";

/** From weakest to strongest. */
const SOURCES: readonly PaySource[] = [
  "self",
  "none",
  "manager",
  "punch",
  "off",
  "owner",
  "typed",
  "scan",
];

export function paySourceOf(
  entry: Pick<TimeEntry, "source" | "inProof" | "outProof">,
): PaySource {
  if (entry.source === "manager") return "added";
  const rank = (proof: EntryProof | null) =>
    SOURCES.indexOf(proof === null ? "punch" : proof);
  const proofs = [entry.inProof, entry.outProof].map(rank);
  return SOURCES[Math.min(...proofs)] ?? "punch";
}

/** One shift as payroll reads it. */
export type PayDay = {
  id: string;
  /** The business day it belongs to, `YYYY-MM-DD`. */
  date: string;
  in: string;
  /** Null while it hasn't ended. */
  out: string | null;
  /** Paid minutes, exact. */
  minutes: number;
  unpaidBreakMinutes: number;
  source: PaySource;
  /** Who corrected or added it, and why; null when nobody did. */
  correction: ShiftCorrection | null;
  /**
   * Its times before the first correction, from the log's clock.correct row,
   * when the reader may read it; null when nobody corrected it.
   */
  original: { in: string; out: string | null } | null;
  /** A time of it waits for a confirmation. */
  waiting: boolean;
  /** And only an owner confirms it. */
  ownerOnly: boolean;
};

/** An entry's times before its first correction, as the log has them. */
export type OriginalTimes = { clockIn: string; clockOut: string | null };

/**
 * One person's shifts of a month, oldest first, as payroll reads a month.
 * `nameOf` names whoever corrected a shift; `originals` holds each corrected
 * entry's times before its first correction.
 */
export function payDays(
  entries: readonly TimeEntry[],
  month: string,
  timeZone: string,
  now: Date,
  nameOf: (userId: string) => string | null,
  originals: ReadonlyMap<string, OriginalTimes> = new Map(),
): PayDay[] {
  const time = (instant: string) => timeIn(new Date(instant), timeZone);
  return entries
    .filter((entry) => monthOf(entryDate(entry, timeZone)) === month)
    .sort((a, b) => Date.parse(a.clockIn) - Date.parse(b.clockIn))
    .map((entry) => {
      const waits = entryToConfirm(entry);
      const before = originals.get(entry.id);
      return {
        id: entry.id,
        date: dateIn(new Date(entry.clockIn), timeZone),
        in: time(entry.clockIn),
        out: entry.clockOut === null ? null : time(entry.clockOut),
        minutes: entryMinutes(entry, now),
        unpaidBreakMinutes: unpaidBreakMinutes(entry, now),
        source: paySourceOf(entry),
        correction: correctionOf(entry, nameOf),
        original:
          before && entry.editedBy !== null
            ? {
                in: time(before.clockIn),
                out: before.clockOut === null ? null : time(before.clockOut),
              }
            : null,
        waiting: waits !== null,
        ownerOnly: waits?.ownerOnly ?? false,
      };
    });
}

/**
 * Each entry's times before its first correction, from the log's clock.correct
 * rows (any order): the oldest row's `from` for each entry.
 */
export function originalTimes(
  rows: readonly { entryId: string; at: string; from: OriginalTimes }[],
): Map<string, OriginalTimes> {
  const oldest = new Map<string, { at: number; from: OriginalTimes }>();
  for (const row of rows) {
    const at = Date.parse(row.at);
    const known = oldest.get(row.entryId);
    if (!known || at < known.at)
      oldest.set(row.entryId, { at, from: row.from });
  }
  return new Map([...oldest].map(([id, { from }]) => [id, from]));
}
