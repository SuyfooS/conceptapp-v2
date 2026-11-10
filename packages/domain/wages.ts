import { addDays } from "./availability";
import {
  type AgeBand,
  hourlyFor,
  MINIMUM_WAGES,
  type MinimumWageRow,
  minimumWageRowOn,
} from "./minimum-wage";
import { MAX_HOURLY_AGOROT, parseShekels } from "./money";
import { addYears, ageBandOn } from "./youth";

/**
 * Hourly wages (payroll P4): each person's wage from a date, append-only
 * (`public.member_wages`, 20261110000500_hourly_wages.sql). The wage on a day
 * is the row with the latest `from` on or before it, then the latest set, so a
 * typo is fixed by a new row for the same date and both stay in the history.
 * Pay holders set them, never their own; each person reads their own.
 */

export type WageRow = {
  id: string;
  agorot: number;
  /** The day it takes effect, `YYYY-MM-DD`. */
  from: string;
  /** When it was set, as an ISO instant. */
  setAt: string;
  /** Who set it; null when their account is gone, or the demo seeded it. */
  setBy: string | null;
  note: string | null;
};

/** What the rule for the wage on a day reads of a row (the payroll engine passes no more). */
type Dated = Pick<WageRow, "from" | "setAt">;

const newer = (a: Dated, b: Dated) =>
  a.from === b.from ? a.setAt > b.setAt : a.from > b.from;

/** The wage in effect on a date: the latest `from` on or before it, then the latest set. */
export function wageOn<Row extends Dated>(
  rows: readonly Row[],
  date: string,
): Row | null {
  let found: Row | null = null;
  for (const row of rows) {
    if (row.from <= date && (found === null || newer(row, found))) {
      found = row;
    }
  }
  return found;
}

/** The first day any wage takes effect; null with none. Wages never stop once set. */
export function wageStart(rows: readonly WageRow[]): string | null {
  return rows.reduce<string | null>(
    (first, row) => (first === null || row.from < first ? row.from : first),
    null,
  );
}

/** A row of the history, and whether a later one for the same day replaced it. */
export type WageHistoryRow = WageRow & { superseded: boolean };

/**
 * Every wage set, newest first (by its day, then by when it was set). A row
 * is superseded when a later one was set for the same day: it never applied
 * after that, and the screen marks it as corrected.
 */
export function wageHistory(rows: readonly WageRow[]): WageHistoryRow[] {
  return [...rows]
    .sort((a, b) => (newer(a, b) ? -1 : newer(b, a) ? 1 : 0))
    .map((row) => ({
      ...row,
      superseded: rows.some(
        (other) =>
          other.id !== row.id &&
          other.from === row.from &&
          other.setAt > row.setAt,
      ),
    }));
}

/** One stretch of a month at one wage: from `since` to the next one, or the month's end. */
export type WageSpan = { agorot: number; since: string };

/**
 * The wages of a month, from its first day to its last (`YYYY-MM-DD`): the
 * one in effect when it began, if any, then each change inside it, oldest
 * first. A change to the same amount is no new stretch.
 */
export function wagesBetween(
  rows: readonly WageRow[],
  firstDay: string,
  lastDay: string,
): WageSpan[] {
  const days = [
    firstDay,
    ...new Set(
      rows
        .map((row) => row.from)
        .filter((from) => from > firstDay && from <= lastDay),
    ),
  ].sort();
  const spans: WageSpan[] = [];
  for (const day of days) {
    const wage = wageOn(rows, day);
    if (!wage || spans.at(-1)?.agorot === wage.agorot) continue;
    spans.push({ agorot: wage.agorot, since: day });
  }
  return spans;
}

/** Whether some of these days (`YYYY-MM-DD`) come before any wage: they have none to pay by. */
export function wageMissing(
  rows: readonly WageRow[],
  days: readonly string[],
): boolean {
  const start = wageStart(rows);
  return days.some((day) => start === null || day < start);
}

/** A person's wages in a month, as payroll reads them. */
export type MonthWage = {
  /** Its stretches, oldest first: the wage it began with, then each change. */
  spans: WageSpan[];
  /**
   * Some of its shifts come before any wage, so nothing says what to pay
   * them: `since` is the day the first wage starts, or null when none was
   * ever set. Null when every shift has a wage.
   */
  missing: { since: string | null } | null;
};

/** The last day of a month (`YYYY-MM`), `YYYY-MM-DD`. */
export function lastDayOf(month: string): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

/** A person's wages in a month (`YYYY-MM`), with the days (`YYYY-MM-DD`) of their shifts in it. */
export function monthWage(
  rows: readonly WageRow[],
  month: string,
  shiftDays: readonly string[],
): MonthWage {
  return {
    spans: wagesBetween(rows, `${month}-01`, lastDayOf(month)),
    missing: wageMissing(rows, shiftDays) ? { since: wageStart(rows) } : null,
  };
}

/** What a pay screen shows of someone's wage today: the one in effect, and the next set to start. */
export type WageNow = {
  current: { agorot: number; from: string } | null;
  next: { agorot: number; from: string } | null;
};

/**
 * The wage in effect on `today` (`YYYY-MM-DD`), and the first change set for
 * after it. A later day whose wage is the same amount is no change: a raise
 * taken back by a new row with the old amount for its day leaves no next.
 */
export function wageNow(rows: readonly WageRow[], today: string): WageNow {
  const current = wageOn(rows, today);
  const ahead = [
    ...new Set(rows.map((row) => row.from).filter((from) => from > today)),
  ].sort();
  let next: WageRow | null = null;
  for (const day of ahead) {
    const wage = wageOn(rows, day);
    if (wage && wage.agorot !== current?.agorot) {
      next = wage;
      break;
    }
  }
  return {
    current: current ? { agorot: current.agorot, from: current.from } : null,
    next: next ? { agorot: next.agorot, from: next.from } : null,
  };
}

/** A note on a wage is at most this long, as `public.member_wages` keeps it. */
export const WAGE_NOTE_MAX = 200;

/**
 * The days a wage may start from, for a business's today (`YYYY-MM-DD`): the
 * first of last month at the earliest, so last month's pay can still be
 * fixed, and a year ahead at the latest. `public.set_hourly_wage` says the
 * same.
 */
export function wageFromBounds(today: string): {
  earliest: string;
  latest: string;
} {
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  const back = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const earliest = `${back.y}-${String(back.m).padStart(2, "0")}-01`;
  // The same day next year, or the month's last day when it has no such day
  // (29 February), as Postgres adds an interval of 12 months.
  const last = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  const latest = `${year + 1}-${String(month).padStart(2, "0")}-${String(
    Math.min(day, last),
  ).padStart(2, "0")}`;
  return { earliest, latest };
}

/** The first of the month a business's today (`YYYY-MM-DD`) is in: where a new wage starts unless said. */
export function firstOfMonth(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

export type WageForm = { amount: string; from: string; note: string };

export type WageFormErrors = {
  amount?: "invalid" | "tooHigh" | "zero";
  from?: "invalid" | "tooEarly" | "tooLate" | "beforeStart";
  note?: "tooLong";
};

export type ParsedWage =
  | { ok: true; agorot: number; from: string; note: string | null }
  | { ok: false; errors: WageFormErrors };

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A real day of the calendar, `YYYY-MM-DD`. */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  return addDays(value, 0) === value;
}

/**
 * The wage form, read: the amount in shekels ("38", "38.50", "38,50"), the
 * day it starts, within `wageFromBounds(today)` and not before `startsOn`
 * (the start a holder set, payroll P5), and an optional note. Everything
 * wrong at once, by field.
 */
export function parseWageForm(
  input: WageForm,
  today: string,
  startsOn: string | null = null,
): ParsedWage {
  const errors: WageFormErrors = {};
  const agorot = parseShekels(input.amount, Number.MAX_SAFE_INTEGER);
  if (agorot === null) errors.amount = "invalid";
  else if (agorot === 0) errors.amount = "zero";
  else if (agorot > MAX_HOURLY_AGOROT) errors.amount = "tooHigh";

  const from = input.from.trim();
  const { earliest, latest } = wageFromBounds(today);
  if (!isDay(from)) errors.from = "invalid";
  else if (from < earliest) errors.from = "tooEarly";
  else if (from > latest) errors.from = "tooLate";
  else if (startsOn !== null && from < startsOn) errors.from = "beforeStart";

  const note = input.note.trim();
  if ([...note].length > WAGE_NOTE_MAX) errors.note = "tooLong";

  if (agorot === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, agorot, from, note: note === "" ? null : note };
}

/** A wage under the minimum: which minimum, from when, and for whom. */
export type WageWarning = {
  /** The minimum's hourly figure, in agorot. */
  minimum: number;
  /** The day that minimum took effect. */
  tableFrom: string;
  band: AgeBand;
};

/**
 * Whether a wage starting on `from` is under the minimum wage, on that day or
 * on any later change of the table while it stands (the minimum goes up each
 * April): the first such minimum, or null. Below the minimum the screens warn
 * and still save. For someone whose age is known, `wageWarningFor`.
 */
export function wageWarning(
  agorot: number,
  from: string,
  band: AgeBand = "adult",
  table: readonly MinimumWageRow[] = MINIMUM_WAGES,
): WageWarning | null {
  const first = minimumWageRowOn(from, table);
  const rows = [
    ...(first ? [first] : []),
    ...table
      .filter((row) => row.from > from)
      .sort((a, b) => (a.from < b.from ? -1 : 1)),
  ];
  for (const row of rows) {
    const minimum = hourlyFor(row, band);
    if (agorot < minimum) return { minimum, tableFrom: row.from, band };
  }
  return null;
}

/**
 * `wageWarning` for someone a minor until `youthUntil` (payroll P5; null for
 * an adult): the band on the day the wage starts, then on each later
 * birthday that moves them up one (16, 17, 18) and each later change of the
 * table, while the wage stands. The first minimum it falls under; its
 * `tableFrom` is then the day that minimum starts to apply to them: the
 * table's day, or the birthday.
 */
export function wageWarningFor(
  agorot: number,
  from: string,
  youthUntil: string | null,
  table: readonly MinimumWageRow[] = MINIMUM_WAGES,
): WageWarning | null {
  if (youthUntil === null) return wageWarning(agorot, from, "adult", table);
  const birthdays = [
    addYears(youthUntil, -2),
    addYears(youthUntil, -1),
    youthUntil,
  ];
  const days = [
    ...new Set([from, ...table.map((row) => row.from), ...birthdays]),
  ]
    .filter((day) => day >= from)
    .sort();
  for (const day of days) {
    const row = minimumWageRowOn(day, table);
    if (!row) continue;
    const band = ageBandOn(day, youthUntil);
    const minimum = hourlyFor(row, band);
    if (agorot < minimum) {
      return {
        minimum,
        tableFrom: birthdays.includes(day) && day > row.from ? day : row.from,
        band,
      };
    }
  }
  return null;
}

/** Why the database refused a wage, in the screen's terms. */
export type WageFailure =
  | "ownWage"
  | "ownerOnly"
  | "noAccess"
  | "notInTeam"
  | "notStaff"
  | "tooEarly"
  | "tooLate"
  | "beforeStart"
  | "invalid"
  | "failed";

/** The refusal of `public.set_hourly_wage`, by its code and message. */
export function wageFailureOf(
  code: string | undefined,
  message = "",
): WageFailure {
  switch (code) {
    case "42501":
      if (/your own wage/i.test(message)) return "ownWage";
      if (/owner's wage/i.test(message)) return "ownerOnly";
      return "noAccess";
    case "P0002":
      return "notInTeam";
    case "22023":
      if (/accountant/i.test(message)) return "notStaff";
      if (/last month/i.test(message)) return "tooEarly";
      if (/year ahead/i.test(message)) return "tooLate";
      // A holder said when they started (payroll P5): not before it.
      if (/before they started/i.test(message)) return "beforeStart";
      return "invalid";
    default:
      return "failed";
  }
}

/** A day as the app writes it in full, `1.11.2026`, for lines that carry no formatter. */
export function dayMonthYear(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return `${day}.${month}.${year}`;
}
