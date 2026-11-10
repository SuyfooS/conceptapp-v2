import { dateIn, weekdayOf } from "./availability";
import type { HolidayPayLine } from "./holiday-pay";
import {
  type OriginalTimes,
  type PayDay,
  type PaySource,
  payDays,
} from "./pay-month";
import {
  aboutPayOf,
  flagWhen,
  type RestName,
  remarksOf,
  restNameOf,
  restNameOfAll,
} from "./pay-rates";
import {
  addBuckets,
  BUCKETS,
  type Bucket,
  type MonthWageSpan,
  monthWageSpans,
  type PayrollDay,
  type PayrollMonth,
  type PayrollPerson,
  type PayrollSettings,
  type PersonPayroll,
} from "./payroll";
import { decimalHours } from "./payroll-access";
import type { HolidayKey } from "./payroll-calendar";
import type { HoursLaw, RestDay } from "./payroll-details";
import type { DayDiff } from "./payroll-diff";
import type {
  PayrollFlag,
  PayrollFlagCode,
  PayrollNote,
} from "./payroll-flags";
import type { AddressForm } from "./profile";
import { type ShabbatCity, timeIn } from "./shabbat";
import { entryDate, type TimeEntry } from "./time-clock";
import { breakMs, countedEnd } from "./time-clock-format";
import { lastDayOf } from "./wages";

/*
 * The file for payroll (payroll P8, plan §11): a month's hours as four sheets
 * (five when the month before it was closed and changed since: payroll P9)
 * of a generic Hebrew workbook, for whoever runs the payroll to import or
 * type from. Pure: the words come in (`ExportWords`, from the messages), and
 * the app's server code writes the sheets as XLSX.
 *
 * No estimate and no amount worked out is ever in it, not even on a summary
 * sheet (Orel, 9 November 2026): nothing here reads an estimate, a segment's
 * amount or the amount of a day not worked, so the file is the same whether
 * the business shows amounts or not. The hourly wage, a fact the payroll
 * needs, is there as it was set. No ID numbers either (they come with the
 * hiring file, H6).
 */

/**
 * A cell: text, a number (hours or a wage to two decimals, or a whole count),
 * a day (`YYYY-MM-DD`), a time of day (`HH:MM`) or a day and a time
 * (`YYYY-MM-DDTHH:MM`), the last three on the business's own clock. Null is
 * an empty cell.
 */
export type Cell =
  | { t: "s"; v: string }
  | { t: "n"; v: number; whole?: boolean }
  | { t: "d"; v: string }
  | { t: "time"; v: string }
  | { t: "dt"; v: string }
  | null;

/**
 * A column: its header, about how many characters wide it is, and whether it
 * holds an identifier kept as text (the payroll number), which a spreadsheet
 * then doesn't offer to turn into a number, dropping its leading zeros.
 */
export type Column = { header: string; width: number; id?: true };

/**
 * The sheets, in order. "differences" is there only when the month before
 * the file's was closed for payroll and changed since (payroll P9).
 */
export const EXPORT_SHEETS = [
  "summary",
  "daily",
  "check",
  "differences",
  "about",
] as const;
export type SheetKey = (typeof EXPORT_SHEETS)[number];

/** One sheet, right to left, its first row the headers. */
export type Sheet = {
  key: SheetKey;
  name: string;
  rtl: true;
  columns: Column[];
  rows: Cell[][];
};

/** The workbook, with how many people and shifts it lists (for the log). */
export type PayrollExport = { sheets: Sheet[]; people: number; shifts: number };

// The columns of each sheet, in order; each rate sits where its key is.
export const SUMMARY_COLUMNS = [
  "name",
  "number",
  "wage",
  "from",
  "to",
  "days",
  "hours",
  "rates",
  "nights",
  "unpaidBreaks",
  "corrected",
  "open",
  "waiting",
  "hoursLaw",
  "daysNotWorked",
  "toCheck",
] as const;
export type SummaryColumn = Exclude<(typeof SUMMARY_COLUMNS)[number], "rates">;

export const DAILY_COLUMNS = [
  "name",
  "number",
  "date",
  "weekday",
  "in",
  "out",
  "originalIn",
  "originalOut",
  "paidBreaks",
  "unpaidBreaks",
  "hours",
  "rates",
  "night",
  "eve",
  "holidayOrRest",
  "oneOff",
  "source",
  "status",
  "correctedBy",
  "correctedAt",
  "reason",
] as const;
export type DailyColumn = Exclude<(typeof DAILY_COLUMNS)[number], "rates">;

export const CHECK_COLUMNS = [
  "name",
  "number",
  "date",
  "what",
  "rule",
  "unchanged",
] as const;
export type CheckColumn = (typeof CHECK_COLUMNS)[number];

/** The sheet of differences: a row per day that changed since its month closed. */
export const DIFF_COLUMNS = [
  "name",
  "number",
  "month",
  "date",
  "weekday",
  "before",
  "now",
  "difference",
  "rates",
  "reason",
] as const;
export type DiffColumn = Exclude<(typeof DIFF_COLUMNS)[number], "rates">;

export const ABOUT_COLUMNS = ["topic", "details"] as const;
export type AboutColumn = (typeof ABOUT_COLUMNS)[number];

/** The fixed lines of the sheet about the file, in order. */
export const ABOUT_LINES = [
  "minutes",
  "proposal",
  "firstShift",
  "open",
  "daysNotWorked",
  "nothingElse",
] as const;
export type AboutLine = (typeof ABOUT_LINES)[number];

/** The business's settings the month was worked out by, for the sheet about the file. */
export type ExportSettings = PayrollSettings & {
  /** Breaks come off the hours. */
  unpaidBreaks: boolean;
  /** The city its Shabbat and holiday times are worked out for. */
  city: ShabbatCity;
};

/** What the file says about itself. */
export type ExportMeta = {
  business: string;
  month: string;
  /** When it was made, on the business's own clock: `YYYY-MM-DDTHH:MM`. */
  madeAt: string;
  /** Who made it, as they are named; null without a name. */
  madeBy: string | null;
  /** Made by the ConceptApp team, viewing the business as an accountant. */
  viewing: boolean;
  settings: ExportSettings;
  /** The day the minimum wage table's newest row took effect. */
  minimumWageFrom: string | null;
};

/** The words of the file, from the messages (`app.pay.file`), as plain text. */
export type ExportWords = {
  sheets: Record<SheetKey, string>;
  columns: {
    summary: Record<SummaryColumn, string>;
    daily: Record<DailyColumn, string>;
    check: Record<CheckColumn, string>;
    differences: Record<DiffColumn, string>;
    about: Record<AboutColumn, string>;
  };
  /** A rate's header on the sheet of differences. */
  differenceRate: (bucket: Bucket, rest: RestName) => string;
  /** A rate's header, named by the rest day everyone listed shares. */
  rate: (bucket: Bucket, rest: RestName) => string;
  /** A weekday, Sunday 0 to Saturday 6. */
  weekday: (day: number) => string;
  source: (source: PaySource) => string;
  status: (status: "open" | "waiting" | "waitingOwner") => string;
  hoursLaw: (law: HoursLaw) => string;
  /** The rest day by name, for a day with minutes in its rest window. */
  rest: (rest: RestName) => string;
  holiday: (key: HolidayKey) => string;
  oneOff: (key: string) => string;
  yes: string;
  /** Someone with no name written down. */
  noName: string;
  /** Who corrected a shift, when the reader can't name them. */
  someone: string;
  /** A flag in its words. */
  flag: (flag: PayrollFlag) => string;
  /** The rule a flag is about, with its law and section. */
  rule: (code: PayrollFlagCode) => string;
  /** A day not worked and paid, for the summary: the day and its average, never an amount. */
  dayNotWorked: (line: HolidayPayLine) => string;
  /** The same day for the sheet of things to check, with what to check by the person's form of address. */
  dayNotWorkedCheck: (line: HolidayPayLine, form: AddressForm) => string;
  dayNotWorkedRule: (line: HolidayPayLine) => string;
  /** A note of the hours engine in its words. */
  note: (note: PayrollNote) => string;
  /** The rule a week worked out three ways is about. */
  workWeekRule: string;
  /** "The hours weren't changed." */
  unchanged: string;
  about: {
    business: string;
    month: string;
    madeAt: string;
    madeBy: string;
    engine: string;
    minimumWage: string;
    /** The label of a note or a fixed line. */
    note: string;
    monthName: (month: string) => string;
    /** Who made it, while the team views the business. */
    madeByTeam: (name: string | null) => string;
    /** Each setting the month was worked out by: its name, and its value in words. */
    settings: (settings: ExportSettings) => { label: string; value: string }[];
    lines: Record<AboutLine, string>;
    /**
     * The month before was closed (`month`, `YYYY-MM`) on `date`
     * (`YYYY-MM-DD`), and whether it changed since: its differences are on
     * their own sheet.
     */
    closed: (month: string, date: string, changed: boolean) => string;
    /** The hours engine changed since that month closed. */
    closedEngine: string;
  };
};

/** One day that changed since its month closed, as the file lists it (payroll P9). */
export type ExportDifference = {
  userId: string;
  name: string | null;
  payrollNumber: string | null;
  restDay: RestDay;
  day: DayDiff;
  /** Why it changed: the reasons given for its shifts since the month closed. */
  reasons: string[];
};

/** The month before the file's, closed for payroll, and what changed in it since. */
export type ExportDifferences = {
  /** `YYYY-MM`. */
  month: string;
  /** When it closed, on the business's clock: `YYYY-MM-DDTHH:MM`. */
  closedAt: string;
  /** The hours engine is another version than the one it closed with. */
  engineChanged: boolean;
  rows: ExportDifference[];
};

/** Someone listed in the file. */
export type ExportPerson = {
  userId: string;
  name: string | null;
  /** How the app writes about them. */
  form: AddressForm;
  payrollNumber: string | null;
  hoursLaw: HoursLaw;
  restDay: RestDay;
  /** Their wages as the engine read them: each summary row's wage, from and to. */
  wages: PayrollPerson["wages"];
  /** Their shifts of the month, oldest first (`exportShiftsOf`). */
  shifts: readonly ExportShift[];
};

/** One shift as the file lists it. */
export type ExportShift = PayDay & {
  userId: string;
  /** Minutes on paid breaks, each break to the whole minute, as the engine counts them. */
  paidBreakMinutes: number;
  /** Not ended: the engine counts none of it yet. */
  open: boolean;
  /** When it was last corrected or added, on the business's clock (`YYYY-MM-DDTHH:MM`); null when nobody did. */
  correctedAt: string | null;
};

const MINUTE = 60_000;

/** An instant on the business's own clock, `YYYY-MM-DDTHH:MM`. */
export function localDateTime(instant: string, timeZone: string): string {
  const at = new Date(instant);
  return `${dateIn(at, timeZone)}T${timeIn(at, timeZone)}`;
}

/**
 * A month's shifts as the file lists them, oldest first: payroll's own reading
 * of each (`payDays`), with its breaks paid and unpaid, each to the whole
 * minute as the engine counts them, and when it was corrected.
 */
export function exportShiftsOf(
  entries: readonly TimeEntry[],
  month: string,
  timeZone: string,
  now: Date,
  nameOf: (userId: string) => string | null,
  originals: ReadonlyMap<string, OriginalTimes> = new Map(),
): ExportShift[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return payDays(entries, month, timeZone, now, nameOf, originals).flatMap(
    (day) => {
      const entry = byId.get(day.id);
      if (!entry) return [];
      const end = countedEnd(entry, now);
      let paid = 0;
      let unpaid = 0;
      for (const pause of entry.breaks) {
        const minutes = Math.floor(breakMs(pause, end) / MINUTE);
        if (pause.unpaid) unpaid += minutes;
        else paid += minutes;
      }
      return [
        {
          ...day,
          userId: entry.userId,
          paidBreakMinutes: paid,
          unpaidBreakMinutes: unpaid,
          open: entry.clockOut === null,
          correctedAt:
            entry.editedBy !== null && entry.editedAt !== null
              ? localDateTime(entry.editedAt, timeZone)
              : null,
        },
      ];
    },
  );
}

/** Characters that make a spreadsheet read text as a formula, at its start. */
const FORMULA_START = new Set([
  "=",
  "+",
  "-",
  "@",
  "\t",
  "\r",
  // Their full-width forms, which some spreadsheets read the same way.
  "＝",
  "＋",
  "－",
  "＠",
]);

/**
 * Text as a cell may hold it: text that would start a formula (`=`, `+`, `-`,
 * `@`, a tab or a carriage return) gets a leading apostrophe, so no
 * spreadsheet, and no CSV made from it later, runs it. Safe to apply twice.
 */
export function escapeCellText(text: string): string {
  return FORMULA_START.has(text.charAt(0)) ? `'${text}` : text;
}

const text = (value: string): Cell => ({ t: "s", v: escapeCellText(value) });
const textOrNull = (value: string | null): Cell =>
  value === null || value === "" ? null : text(value);
/** A total's minutes as decimal hours, two places, from summed minutes (plan §3). */
const hours = (minutes: number): Cell => ({
  t: "n",
  v: Number(decimalHours(minutes)),
});
/**
 * A shift's or a day's minutes as decimal hours, exactly (shown to two
 * places): a column of them adds up to its total, which is rounded once,
 * never a sum of rounded rows.
 */
const exactHours = (minutes: number): Cell => ({
  t: "n",
  v: Math.max(0, minutes) / 60,
});
/** A difference in minutes as decimal hours, exactly, below zero when fewer. */
const signedHours = (minutes: number): Cell => ({ t: "n", v: minutes / 60 });
const whole = (value: number): Cell => ({ t: "n", v: value, whole: true });
const day = (date: string): Cell => ({ t: "d", v: date });
const time = (value: string | null): Cell =>
  value === null ? null : { t: "time", v: value };

const WIDTHS: Record<string, number> = {
  name: 20,
  number: 12,
  wage: 10,
  from: 12,
  to: 12,
  date: 12,
  weekday: 10,
  in: 8,
  out: 8,
  originalIn: 10,
  originalOut: 10,
  daysNotWorked: 40,
  hoursLaw: 22,
  holidayOrRest: 18,
  oneOff: 18,
  source: 16,
  status: 18,
  correctedBy: 18,
  correctedAt: 17,
  reason: 32,
  what: 70,
  rule: 46,
  unchanged: 16,
  topic: 28,
  details: 90,
  month: 16,
  before: 12,
  now: 12,
  difference: 12,
};
const widthOf = (key: string) => WIDTHS[key] ?? 11;

/** A column by its key: the payroll number is an identifier, kept as text. */
const columnOf = (key: string, header: string): Column =>
  key === "number"
    ? { header, width: widthOf(key), id: true }
    : { header, width: widthOf(key) };

/** Headers, with the six rates where `rates` stands. */
function columnsOf<K extends string>(
  keys: readonly (K | "rates")[],
  words: Record<K, string>,
  rate: (bucket: Bucket) => string,
): Column[] {
  return keys.flatMap((key) =>
    key === "rates"
      ? BUCKETS.map((bucket) => ({ header: rate(bucket), width: 12 }))
      : [columnOf(key, words[key])],
  );
}

/**
 * The stretches of someone's month the summary lists, each at one wage
 * (`monthWageSpans`, from the wages the engine read): every one holding a
 * day worked, a day not worked and paid, or a shift (an open one too), with
 * the wage in force on it. So a raise after the last day worked, with
 * election day after it, is a row of its own at the new wage, and a month
 * with only a day not worked still shows the wage. The month's last stretch
 * when nothing falls in any.
 */
function stretchesOf(
  person: PersonPayroll | undefined,
  info: ExportPerson,
  month: string,
): MonthWageSpan[] {
  const spans = monthWageSpans(info.wages, month);
  const kept = spans.filter((span) => {
    const holds = (date: string) => span.from <= date && date <= span.to;
    return (
      info.shifts.some((shift) => holds(shift.date)) ||
      (person?.days ?? []).some((one) => one.minutes > 0 && holds(one.date)) ||
      (person?.holidayPay ?? []).some((line) => holds(line.date))
    );
  });
  return kept.length > 0 ? kept : spans.slice(-1);
}

/**
 * The summary row a day belongs to: the stretch holding it, which is the
 * wage on that day (`wageOn`), else the last one before it (a remark on a
 * day of a stretch with nothing listed), and the first for a remark on the
 * whole month (null) or a week that began before it.
 */
function stretchIndex(
  stretches: readonly MonthWageSpan[],
  date: string | null,
): number {
  if (date === null) return 0;
  let found = 0;
  for (const [index, stretch] of stretches.entries()) {
    if (stretch.from <= date) found = index;
  }
  return found;
}

/** A thing to check, with the day it is about (null for the month). */
type CheckItem = { date: string | null; what: string; rule: string };

/**
 * What a pay holder checks in someone's month, for the sheet of things to
 * check: how they are paid when the Hours law doesn't apply, the engine's
 * remarks (minors first, then by day), days with no wage and a missing
 * payroll number, each day not worked and paid, and how each week was worked
 * out while the business's week isn't set. A shift open, corrected or
 * waiting is on its own row of the daily sheet instead.
 */
function checksOf(
  person: PersonPayroll,
  info: ExportPerson,
  notes: readonly PayrollNote[],
  words: ExportWords,
): CheckItem[] {
  const flags = [
    ...aboutPayOf(person.flags),
    ...remarksOf(person.flags),
    ...person.flags.filter(
      (flag) => flag.code === "noWage" || flag.code === "noPayrollNumber",
    ),
  ];
  return [
    ...flags.map((flag) => ({
      date: flagWhen(flag) || null,
      what: words.flag(flag),
      rule: words.rule(flag.code),
    })),
    ...person.holidayPay.map((line) => ({
      date: line.date,
      what: words.dayNotWorkedCheck(line, info.form),
      rule: words.dayNotWorkedRule(line),
    })),
    ...notes.flatMap((note) =>
      note.code === "workWeekUnset" && note.userId === person.userId
        ? [
            {
              date: note.weekOf,
              what: words.note(note),
              rule: words.workWeekRule,
            },
          ]
        : [],
    ),
  ];
}

const byName = (a: ExportPerson, b: ExportPerson) =>
  // Unnamed people go last, as on the pay screens.
  (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
  (a.name ?? "").localeCompare(b.name ?? "", "he");

/** Whether someone has anything in the month's file: a shift, or a day not worked and paid. */
const inFile = (person: PersonPayroll | undefined, info: ExportPerson) =>
  info.shifts.length > 0 || (person?.holidayPay.length ?? 0) > 0;

/** The engine's day a shift belongs to. */
function dayOf(
  person: PersonPayroll | undefined,
  shift: ExportShift,
): PayrollDay | undefined {
  return (
    person?.days.find((one) => one.entryIds.includes(shift.id)) ??
    person?.days.find((one) => one.date === shift.date)
  );
}

/**
 * The month's file (plan §11.3), from the engine's month, the people in it
 * with their shifts, and what the file says about itself:
 *
 * - "summary": a row per person per stretch at one wage with something in it
 *   (a raise mid-month is two rows; `stretchesOf`), with the hours at each
 *   rate, the shifts corrected, open (not counted) and waiting, the Hours
 *   law, the days not worked and paid (the day and its average, no amount)
 *   and how many things to check, each on the row of the wage on its day;
 * - "daily": a row per shift, with its times, those before a correction, its
 *   breaks, its hours (exact, so a column adds up to the summary), and on the
 *   day's first counted shift the day's rates and what kind of day it was,
 *   then how it was recorded, and who corrected it, when and why;
 * - "check": a row per thing to check, in words, with the rule it is about,
 *   and that the hours weren't changed;
 * - "differences" (payroll P9), only when the month before was closed and
 *   changed since (`differences`): a row per day that changed, with the month
 *   it belongs to, its hours then and now, the difference in all and at each
 *   rate, and why, never an amount;
 * - "about": the business, the month, who made the file and when, the
 *   settings, the engine and the minimum wage table, the month before when it
 *   was closed, and what the file holds and doesn't.
 */
export function exportSheets(
  month: PayrollMonth,
  people: readonly ExportPerson[],
  meta: ExportMeta,
  words: ExportWords,
  differences: ExportDifferences | null = null,
): PayrollExport {
  const engineOf = (userId: string) =>
    month.people.find((one) => one.userId === userId);
  const listed = [...people]
    .filter((info) => inFile(engineOf(info.userId), info))
    .sort(byName);
  const restName = restNameOfAll(listed.map((info) => info.restDay));
  const rate = (bucket: Bucket) => words.rate(bucket, restName);

  const summary: Cell[][] = [];
  const daily: Cell[][] = [];
  const check: Cell[][] = [];

  for (const info of listed) {
    const person = engineOf(info.userId);
    const name = text(info.name ?? words.noName);
    const number = textOrNull(info.payrollNumber);
    const items = person ? checksOf(person, info, month.notes, words) : [];
    const lines = person?.holidayPay ?? [];

    // The summary: a row per stretch at one wage with something in it, each
    // shift, day not worked and thing to check on the row of its day's wage.
    const stretches = stretchesOf(person, info, month.month);
    for (const [index, stretch] of stretches.entries()) {
      const mine = <T>(list: readonly T[], dateOf: (one: T) => string | null) =>
        list.filter((one) => stretchIndex(stretches, dateOf(one)) === index);
      const worked = (person?.days ?? []).filter(
        (one) =>
          one.minutes > 0 && stretch.from <= one.date && one.date <= stretch.to,
      );
      const minutes = (of: (one: PayrollDay) => number) =>
        worked.reduce((sum, one) => sum + of(one), 0);
      const buckets = addBuckets(...worked.map((one) => one.buckets));
      const shifts = mine(info.shifts, (shift) => shift.date);
      const notWorked = mine(lines, (line) => line.date);
      summary.push([
        name,
        number,
        // The wage as it was set: a fact for payroll, not an amount worked out.
        stretch.agorot === null ? null : { t: "n", v: stretch.agorot / 100 },
        day(stretch.from),
        day(stretch.to),
        whole(worked.length),
        hours(minutes((one) => one.minutes)),
        ...BUCKETS.map((bucket) => hours(buckets[bucket])),
        whole(worked.filter((one) => one.night).length),
        hours(minutes((one) => one.unpaidBreakMinutes)),
        whole(shifts.filter((shift) => shift.correction !== null).length),
        whole(shifts.filter((shift) => shift.open).length),
        whole(shifts.filter((shift) => shift.waiting).length),
        text(words.hoursLaw(info.hoursLaw)),
        textOrNull(notWorked.map(words.dayNotWorked).join("; ")),
        whole(mine(items, (item) => item.date).length),
      ]);
    }

    // The daily sheet: a row per shift, its hours exact. A day's rates and
    // what kind of day it was (night, eve, holiday or rest, election day) are
    // the whole day's: once, on its first counted shift, so each column adds
    // up to the summary and a morning shift isn't marked as the night or
    // Shabbat of a later one.
    const ratesShownOn = new Set<string>();
    for (const shift of info.shifts) {
      const engineDay = dayOf(person, shift);
      const carries =
        !shift.open && engineDay !== undefined && !ratesShownOn.has(shift.date);
      if (carries) ratesShownOn.add(shift.date);
      const shown = carries ? engineDay : undefined;
      const kind = shown?.holiday
        ? words.holiday(shown.holiday)
        : shown && shown.restMinutes > 0
          ? words.rest(restNameOf(info.restDay))
          : null;
      daily.push([
        name,
        number,
        day(shift.date),
        text(words.weekday(weekdayOf(shift.date))),
        time(shift.in),
        time(shift.out),
        time(shift.original?.in ?? null),
        time(shift.original?.out ?? null),
        shift.open ? null : whole(shift.paidBreakMinutes),
        shift.open ? null : whole(shift.unpaidBreakMinutes),
        shift.open ? null : exactHours(shift.minutes),
        ...BUCKETS.map((bucket) =>
          shown ? exactHours(shown.buckets[bucket]) : null,
        ),
        shown?.night ? text(words.yes) : null,
        shown?.eve ? text(words.yes) : null,
        textOrNull(kind),
        shown?.oneOffRestDay ? text(words.oneOff(shown.oneOffRestDay)) : null,
        text(words.source(shift.source)),
        shift.open
          ? text(words.status("open"))
          : shift.waiting
            ? text(words.status(shift.ownerOnly ? "waitingOwner" : "waiting"))
            : null,
        shift.correction ? text(shift.correction.by ?? words.someone) : null,
        shift.correctedAt ? { t: "dt", v: shift.correctedAt } : null,
        textOrNull(shift.correction?.note ?? null),
      ]);
    }

    for (const item of items) {
      check.push([
        name,
        number,
        item.date ? day(item.date) : null,
        text(item.what),
        text(item.rule),
        text(words.unchanged),
      ]);
    }
  }

  // The month before, closed and changed since: a row per day that changed,
  // by name and then day, its hours exact and each rate's difference only
  // where there is one.
  const changed = differences
    ? [...differences.rows].sort(
        (a, b) =>
          (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
          (a.name ?? "").localeCompare(b.name ?? "", "he") ||
          (a.day.date < b.day.date ? -1 : a.day.date > b.day.date ? 1 : 0),
      )
    : [];
  const differenceRest = restNameOfAll(changed.map((row) => row.restDay));
  const differenceRows: Cell[][] = changed.map((row) => [
    text(row.name ?? words.noName),
    textOrNull(row.payrollNumber),
    text(words.about.monthName(differences?.month ?? month.month)),
    day(row.day.date),
    text(words.weekday(weekdayOf(row.day.date))),
    exactHours(row.day.before),
    exactHours(row.day.now),
    signedHours(row.day.now - row.day.before),
    ...BUCKETS.map((bucket) =>
      row.day.buckets[bucket] === 0
        ? null
        : signedHours(row.day.buckets[bucket]),
    ),
    textOrNull(row.reasons.join("; ")),
  ]);

  const about: Cell[][] = [
    [text(words.about.business), text(meta.business)],
    [text(words.about.month), text(words.about.monthName(meta.month))],
    [text(words.about.madeAt), { t: "dt", v: meta.madeAt }],
    [
      text(words.about.madeBy),
      text(
        meta.viewing
          ? words.about.madeByTeam(meta.madeBy)
          : (meta.madeBy ?? words.noName),
      ),
    ],
    [text(words.about.engine), text(month.engineVersion)],
    [
      text(words.about.minimumWage),
      meta.minimumWageFrom ? day(meta.minimumWageFrom) : null,
    ],
    ...words.about
      .settings(meta.settings)
      .map(({ label, value }) => [text(label), text(value)]),
    // The month's notes; how each person's weeks were worked out is theirs,
    // on the sheet of things to check.
    ...month.notes.flatMap((note) =>
      note.code === "workWeekUnset"
        ? []
        : [[text(words.about.note), text(words.note(note))]],
    ),
    // The month before, when it was closed: whether it changed since, and
    // whether the engine did.
    ...(differences
      ? [
          [
            text(words.about.note),
            text(
              words.about.closed(
                differences.month,
                differences.closedAt.slice(0, 10),
                differenceRows.length > 0,
              ),
            ),
          ],
          ...(differences.engineChanged && differenceRows.length > 0
            ? [[text(words.about.note), text(words.about.closedEngine)]]
            : []),
        ]
      : []),
    ...ABOUT_LINES.map((line) => [
      text(words.about.note),
      text(words.about.lines[line]),
    ]),
  ];

  const sheet = (key: SheetKey, columns: Column[], rows: Cell[][]): Sheet => ({
    key,
    name: words.sheets[key],
    rtl: true,
    columns,
    rows,
  });

  return {
    sheets: [
      sheet(
        "summary",
        columnsOf(SUMMARY_COLUMNS, words.columns.summary, rate),
        summary,
      ),
      sheet(
        "daily",
        columnsOf(DAILY_COLUMNS, words.columns.daily, rate),
        daily,
      ),
      sheet(
        "check",
        CHECK_COLUMNS.map((key) => columnOf(key, words.columns.check[key])),
        check,
      ),
      ...(differenceRows.length > 0
        ? [
            sheet(
              "differences",
              columnsOf(DIFF_COLUMNS, words.columns.differences, (bucket) =>
                words.differenceRate(bucket, differenceRest),
              ),
              differenceRows,
            ),
          ]
        : []),
      sheet(
        "about",
        ABOUT_COLUMNS.map((key) => columnOf(key, words.columns.about[key])),
        about,
      ),
    ],
    people: listed.length,
    shifts: daily.length,
  };
}

/**
 * Whether a month changed after its newest file went out (`exportedAt`, an
 * instant): one of its shifts written, corrected, confirmed or ended since,
 * or a wage set since that reaches into the month. The pay screen then says
 * a new file is worth taking. `entries` are the month's own.
 */
export function changedSinceExport(
  entries: readonly Pick<
    TimeEntry,
    "createdAt" | "editedAt" | "confirmedAt" | "clockOut"
  >[],
  wages: readonly { setAt: string; from: string }[],
  month: string,
  exportedAt: string,
): boolean {
  const since = Date.parse(exportedAt);
  const after = (instant: string | null) =>
    instant !== null && Date.parse(instant) > since;
  return (
    entries.some(
      (entry) =>
        after(entry.createdAt) ||
        after(entry.editedAt) ||
        after(entry.confirmedAt) ||
        after(entry.clockOut),
    ) ||
    wages.some((wage) => after(wage.setAt) && wage.from <= lastDayOf(month))
  );
}

/** The entries of a month, by the business's day each belongs to. */
export function entriesOfMonth<E extends Pick<TimeEntry, "clockIn">>(
  entries: readonly E[],
  month: string,
  timeZone: string,
): E[] {
  return entries.filter((entry) =>
    entryDate(entry, timeZone).startsWith(month),
  );
}

/** The file's name in plain ASCII, for every browser: `hours-<slug>-2026-10.xlsx`. */
export function exportFileName(slug: string, month: string): string {
  const safe =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business";
  return `hours-${safe}-${month}.xlsx`;
}

/** Characters no file name may hold, on any system a download lands on. */
const NOT_IN_NAMES = new Set([...'<>:"/\\|?*']);

/** A file name in words, without what a file system refuses, or control characters. */
export function cleanFileName(name: string): string {
  return [...name]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f || NOT_IN_NAMES.has(char)
        ? " "
        : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `Content-Disposition` for a download (RFC 6266): a plain ASCII name for
 * every browser, and the name in words as UTF-8 (`filename*`, RFC 5987).
 */
export function attachmentHeader(ascii: string, full: string): string {
  const plain = [...ascii]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code < 0x7f && char !== '"' && char !== "\\";
    })
    .join("");
  const encoded = encodeURIComponent(cleanFileName(full)).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${plain}"; filename*=UTF-8''${encoded}`;
}
