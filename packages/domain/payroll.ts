import { addDays, instantIn, weekdayOf, weekStartOf } from "./availability";
import {
  type HolidayPayLine,
  holidayPayLines,
  holidaysFor,
} from "./holiday-pay";
import {
  type AgeBand,
  MINIMUM_WAGES,
  type MinimumWageRow,
  minimumWageOn,
  minimumWageTableStale,
} from "./minimum-wage";
import { isStaff, type Role } from "./modules";
import { minutesAgorot } from "./money";
import { decimalHours } from "./payroll-access";
import type {
  Holiday,
  HolidayKey,
  PayrollCalendar,
  Window,
} from "./payroll-calendar";
import type {
  EmploymentPeriod,
  HoursLaw,
  PayrollDetails,
  RestDay,
} from "./payroll-details";
import { DEFAULT_DETAILS } from "./payroll-details";
import {
  adultDayFlags,
  adultWeekFlags,
  breakMissingFlag,
  type DayFacts,
  flagDate,
  LIMITS,
  minorDayFlags,
  minorWeekFlags,
  type PayrollFlag,
  type PayrollNote,
  type WeekFacts,
} from "./payroll-flags";
import { PAYROLL_READINGS, type PayrollReadings } from "./payroll-readings";
import { entryMinutes, entryToConfirm, type TimeEntry } from "./time-clock";
import { breakMs, countedEnd } from "./time-clock-format";
import { lastDayOf, type WageRow, wageOn } from "./wages";
import { ageBandOn, isMinorOn, minorUnderAge } from "./youth";

export type { HolidayPayLine } from "./holiday-pay";
export type {
  Holiday,
  HolidayKey,
  OneOffRestDay,
  PayrollCalendar,
  Window,
} from "./payroll-calendar";
export type { HoursLaw, RestDay } from "./payroll-details";
export type { PayrollFlag, PayrollNote } from "./payroll-flags";

/*
 * The legal hours engine (payroll P6, plan §9). From a month's entries, each
 * person's details and wages, the business's settings and a calendar of rest
 * windows and holidays, it works out every person's minutes at each rate, day
 * by day and week by week, the pay for days not worked, an estimate in whole
 * agorot, and what to check. Pure: no I/O, no clock of its own (`now` comes
 * in), no hebcal (the calendar comes in, from `payroll-calendar.ts`).
 *
 * Durations come from instants, so a night the clocks change has its real
 * length; workdays, the night window and the week come from local time in the
 * business's zone. Where the law leaves a choice, the engine takes the one in
 * `PAYROLL_READINGS` (plan §14).
 */

/** Bumped whenever a rule changes what a month comes to (P9 keeps it with a closed month). */
export const PAYROLL_ENGINE_VERSION = "2026-11";

export const BUCKETS = [
  "regular",
  "ot125",
  "ot150",
  "rest150",
  "rest175",
  "rest200",
] as const;
export type Bucket = (typeof BUCKETS)[number];
/** Minutes at each rate. */
export type Buckets = Record<Bucket, number>;

export const BUCKET_PERCENT = {
  regular: 100,
  ot125: 125,
  ot150: 150,
  rest150: 150,
  rest175: 175,
  rest200: 200,
} as const satisfies Record<Bucket, number>;

/** The week's regular hours: 42 (the 2018 extension order). */
export const WEEK_MINUTES = 2520;
/** Overtime is 125% for its first 2 hours, 150% after (s.16). */
export const OT_STEP_MINUTES = 120;
/** A day's regular minutes: 8 in a six-day week, 8.6 in a five-day week (7.6 on its short day), 7 on an eve and for a night shift. */
export const NORM = {
  six: 480,
  five: 516,
  fiveShort: 456,
  eve: 420,
  night: 420,
} as const;
/** The night (s.1), local time, in minutes from midnight. */
export const NIGHT_WINDOW = {
  from: 22 * 60,
  to: 6 * 60,
  minMinutes: PAYROLL_READINGS.nightShiftMinutes,
} as const;

export type WorkWeek = "unset" | "five" | "six";

export type PayrollSettings = {
  workWeek: WorkWeek;
  /** The short day of a five-day week, Sunday (0) to Thursday (4). */
  shortDay: 0 | 1 | 2 | 3 | 4;
  restStart: "candleLighting" | "fixed";
  /** The fixed Friday time the rest starts, `HH:MM`, when `restStart` is fixed. */
  restStartTime: string;
  /** Read only to say it is ignored: payroll counts exact minutes. */
  roundToMinutes: 0 | 5 | 15;
};

export type PayrollPerson = {
  userId: string;
  payrollNumber: string | null;
  restDay: RestDay;
  hoursLaw: HoursLaw;
  youthUntil: string | null;
  compulsoryEducation: boolean;
  periods: readonly { startedOn: string; endedOn: string | null }[];
  wages: readonly { agorot: number; from: string; setAt: string }[];
};

/** A person's months before, for holiday and one-off rest-day pay. */
export type PayrollHistory = {
  minutes: number;
  days: number;
  /** Weeks they worked in. */
  weeks: number;
  /** In how many of those weeks each weekday was worked. */
  weekdays: Readonly<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, number>>;
};

export type PayrollInput = {
  /** `YYYY-MM`. */
  month: string;
  timeZone: string;
  now: Date;
  /**
   * Everyone's entries over `payrollRange(month)` (whole weeks), and from a
   * week before it, where the 36 hours after a holiday look back.
   */
  entries: readonly TimeEntry[];
  people: readonly PayrollPerson[];
  settings: PayrollSettings;
  calendar: PayrollCalendar;
  minimumWage?: readonly MinimumWageRow[];
  /**
   * Paid minutes, days worked, and the weeks in which each weekday was
   * worked, in the calendar months before `month` (`payrollHistory`), per
   * person: holiday and one-off rest-day pay.
   */
  history?: ReadonlyMap<string, PayrollHistory>;
  /** The readings of plan §14; screens never pass them, the tests of the other reading do. */
  readings?: PayrollReadings;
};

export type PayrollDay = {
  date: string;
  entryIds: string[];
  minutes: number;
  buckets: Buckets;
  /** Its regular minutes, by the way its week was worked out. */
  norm: number;
  night: boolean;
  /** A 7-hour eve for this person: the day before their rest day, or a holiday's they don't work. */
  eve: boolean;
  /** Minutes in a rest window, at any rate (paid as regular when the Hours law doesn't apply). */
  restMinutes: number;
  holiday: HolidayKey | null;
  oneOffRestDay: string | null;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  flags: PayrollFlag[];
};

/** A stretch of the month at one wage, with its minutes and what they come to. */
export type WageSegment = {
  /** Null for days with no wage. */
  agorot: number | null;
  from: string;
  to: string;
  buckets: Buckets;
  amountAgorot: number | null;
};

export type PersonPayroll = {
  userId: string;
  daysWorked: number;
  minutes: number;
  buckets: Buckets;
  nightShifts: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  editedEntries: number;
  openEntries: number;
  unconfirmedEntries: number;
  byWage: WageSegment[];
  /** Holiday pay and one-off rest-day pay, in the month. */
  holidayPay: HolidayPayLine[];
  /** Null while any worked day has no wage; always shown as an estimate. */
  estimateAgorot: number | null;
  days: PayrollDay[];
  /** Every flag of the month: the days' and the person's. */
  flags: PayrollFlag[];
};

export type PayrollMonth = {
  month: string;
  engineVersion: string;
  people: PersonPayroll[];
  notes: PayrollNote[];
};

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const NO_BUCKETS: Buckets = {
  regular: 0,
  ot125: 0,
  ot150: 0,
  rest150: 0,
  rest175: 0,
  rest200: 0,
};

/**
 * The days a month's weeks cover: the Sunday on or before its first day to
 * the Saturday on or after its last. The weekly 42 needs whole weeks; only
 * the month's own days are reported.
 */
export function payrollRange(month: string): { from: string; to: string } {
  const first = `${month}-01`;
  const last = lastDayOf(month);
  const start = PAYROLL_READINGS.weekStartsOn;
  return {
    from: weekStartOf(first, start),
    to: addDays(weekStartOf(last, start), 6),
  };
}

/** `Math.round(minutes × wage × percent / 6000)`, in agorot. */
export function bucketAgorot(
  minutes: number,
  hourlyAgorot: number,
  bucket: Bucket,
): number {
  return minutesAgorot(minutes, hourlyAgorot, BUCKET_PERCENT[bucket]);
}

/** Minutes as decimal hours, as the screens and the file show them: 516 is "8.60". */
export function hoursText(minutes: number): string {
  return decimalHours(minutes);
}

/** Each bucket added. */
export function addBuckets(...all: readonly Buckets[]): Buckets {
  const sum = { ...NO_BUCKETS };
  for (const one of all) {
    for (const bucket of BUCKETS) sum[bucket] += one[bucket];
  }
  return sum;
}

/** Minutes × percent: how a week's ways of working out are compared. */
function weight(buckets: Buckets): number {
  return BUCKETS.reduce(
    (sum, bucket) => sum + buckets[bucket] * BUCKET_PERCENT[bucket],
    0,
  );
}

/**
 * Whole minutes from milliseconds by largest remainder: each part's floor,
 * then the minutes left over to the parts with the largest remainders, so
 * the parts add up to `total` (the minutes the clock's screens show).
 */
export function apportion(ms: readonly number[], total: number): number[] {
  const minutes = ms.map((part) => Math.floor(part / MINUTE));
  const order = ms
    .map((part, index) => ({
      index,
      rest: part - (minutes[index] ?? 0) * MINUTE,
    }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  let left = total - minutes.reduce((sum, part) => sum + part, 0);
  for (const { index } of order) {
    if (left <= 0) break;
    if ((ms[index] ?? 0) > 0) {
      minutes[index] = (minutes[index] ?? 0) + 1;
      left -= 1;
    }
  }
  // Breaks that overlap their entry's edges can leave the parts off by more:
  // the largest part takes the difference.
  if (left !== 0 && minutes.length > 0) {
    const largest = minutes.indexOf(Math.max(...minutes));
    minutes[largest] = Math.max(0, (minutes[largest] ?? 0) + left);
  }
  return minutes;
}

function bucketsFromMs(ms: Readonly<Record<Bucket, number>>, total: number) {
  const minutes = apportion(
    BUCKETS.map((bucket) => ms[bucket]),
    total,
  );
  return Object.fromEntries(
    BUCKETS.map((bucket, index) => [bucket, minutes[index] ?? 0]),
  ) as Buckets;
}

/** Joins windows that overlap or touch, in time order. */
function joined(windows: readonly Window[]): Window[] {
  const sorted = [...windows].sort((a, b) => a.from - b.from);
  const out: Window[] = [];
  for (const window of sorted) {
    const last = out.at(-1);
    if (last && window.from <= last.to) last.to = Math.max(last.to, window.to);
    else out.push({ ...window });
  }
  return out;
}

/** Whether `at` is inside one of the (joined) windows, and until when that holds. */
function windowAt(
  windows: readonly Window[],
  at: number,
): { inside: boolean; until: number } {
  for (const window of windows) {
    if (at < window.from) return { inside: false, until: window.from };
    if (at < window.to) return { inside: true, until: window.to };
  }
  return { inside: false, until: Number.POSITIVE_INFINITY };
}

/** How much of the spans falls inside the window. */
function overlap(spans: readonly Window[], window: Window): number {
  return spans.reduce(
    (sum, span) =>
      sum +
      Math.max(
        0,
        Math.min(span.to, window.to) - Math.max(span.from, window.from),
      ),
    0,
  );
}

/** A day's paid time, cut into pieces at its unpaid breaks. */
type Piece = Window & {
  entryId: string;
  /** A whole shift after a holiday, counted as holiday work. */
  wholeRest: boolean;
};

/** A piece at one rate. `weekly`: moved there by the week's 42 hours. */
type Part = Window & { bucket: Bucket; rest: boolean; weekly: boolean };

/** One person's workday: the closed entries whose clock-in falls on it. */
type WorkDay = {
  date: string;
  entries: TimeEntry[];
  pieces: Piece[];
  /** The minutes the clock's screens show: each entry's whole minutes, added. */
  total: number;
  night: boolean;
  eve: boolean;
};

type Way = "six" | "five" | "smaller";

/** The ways an `unset` week is worked out, in the order a tie is settled. */
const UNSET_WAYS: readonly Way[] = ["six", "five", "smaller"];

const WORK: readonly Bucket[] = ["regular", "ot125", "ot150"];
const REST: readonly Bucket[] = ["rest150", "rest175", "rest200"];

/** The paid stretches of an entry: in to out, without its unpaid breaks. */
function paidSpans(entry: TimeEntry): Window[] {
  if (entry.clockOut === null) return [];
  const start = Date.parse(entry.clockIn);
  const end = Date.parse(entry.clockOut);
  const unpaid = joined(
    entry.breaks
      .filter((pause) => pause.unpaid)
      .map((pause) => ({
        from: Math.max(start, Date.parse(pause.startedAt)),
        to: Math.min(
          end,
          pause.endedAt === null ? end : Date.parse(pause.endedAt),
        ),
      }))
      .filter((pause) => pause.to > pause.from),
  );
  const spans: Window[] = [];
  let at = start;
  for (const pause of unpaid) {
    if (pause.from > at) spans.push({ from: at, to: pause.from });
    at = Math.max(at, pause.to);
  }
  if (end > at) spans.push({ from: at, to: end });
  return spans;
}

/** Local dates and times for one zone, worked out once each. */
function clockOf(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const instants = new Map<string, number>();
  const at = (date: string, time: string): number => {
    const key = `${date} ${time}`;
    let found = instants.get(key);
    if (found === undefined) {
      found = instantIn(date, time, timeZone).getTime();
      instants.set(key, found);
    }
    return found;
  };
  const dateOf = (ms: number): string => format.format(new Date(ms));
  /**
   * The windows from `from` to `to` (local `HH:MM`; one that ends at or
   * before it starts runs past midnight) on every day the spans touch.
   */
  const daily = (
    spans: readonly Window[],
    from: string,
    to: string,
  ): Window[] => {
    if (spans.length === 0) return [];
    const first = addDays(dateOf(Math.min(...spans.map((s) => s.from))), -1);
    const last = dateOf(Math.max(...spans.map((s) => s.to)));
    const windows: Window[] = [];
    for (let day = first; day <= last; day = addDays(day, 1)) {
      windows.push({
        from: at(day, from),
        to: at(to > from ? day : addDays(day, 1), to),
      });
    }
    return windows;
  };
  const inDaily = (spans: readonly Window[], from: string, to: string) =>
    daily(spans, from, to).reduce((sum, w) => sum + overlap(spans, w), 0);
  return { at, dateOf, inDaily };
}

type Clock = ReturnType<typeof clockOf>;

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * How much of someone's paid time works a holiday or a one-off rest day, in
 * milliseconds (plan §9.4 steps 3 and 7): any of it means no 7-hour eve
 * before it (C17d), no pay line for it, and the flag. Every paid minute in
 * its window counts, but a shift that clocked in before the holiday began
 * (`began`: candle lighting on its eve, or the first day's for Rosh
 * Hashana's second) counts only by its minutes on the holiday's own date, so
 * the eve's shift that runs past candle lighting doesn't (C17b), while one
 * wholly in the holiday's evening, or a night shift from the eve into the
 * day, does. That exception is a reading (`eveShiftFromHolidayDate`, §14).
 */
function workedOn(
  entries: readonly TimeEntry[],
  spansOf: ReadonlyMap<string, readonly Window[]>,
  day: { date: string; window: Window },
  began: number,
  clock: Clock,
  readings: PayrollReadings,
): number {
  const ownDate = {
    from: Math.max(day.window.from, clock.at(day.date, "00:00")),
    to: day.window.to,
  };
  return entries.reduce((sum, entry) => {
    const before =
      readings.eveShiftFromHolidayDate && Date.parse(entry.clockIn) < began;
    const spans = spansOf.get(entry.id) ?? [];
    return sum + overlap(spans, before ? ownDate : day.window);
  }, 0);
}

/** The holidays grouped into the days they run on together (both days of Rosh Hashana). */
function holidaySpans(holidays: readonly Holiday[]): Holiday[][] {
  const spans: Holiday[][] = [];
  for (const holiday of [...holidays].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  )) {
    const last = spans.at(-1);
    const previous = last?.at(-1);
    if (last && previous && previous.window.to >= holiday.window.from) {
      last.push(holiday);
    } else spans.push([holiday]);
  }
  return spans;
}

/** One way of working out a week: each day's parts, and their minutes. */
type WeekWay = {
  way: Way;
  days: { day: WorkDay; norm: number; parts: Part[]; buckets: Buckets }[];
  weight: number;
};

/** A day's norm, by the way its week is worked out (plan §9.4 step 3). */
function normOf(
  day: WorkDay,
  way: Way,
  settings: PayrollSettings,
  readings: PayrollReadings,
): number {
  const six = day.eve ? NORM.eve : NORM.six;
  const shortDay = weekdayOf(day.date) === settings.shortDay;
  const fiveBase = shortDay ? NORM.fiveShort : NORM.five;
  const five =
    day.eve && readings.fiveDayEve ? Math.min(fiveBase, NORM.eve) : fiveBase;
  const base =
    way === "six" ? six : way === "five" ? five : Math.min(six, five);
  return day.night ? Math.min(base, NORM.night) : base;
}

/**
 * A day's paid time at its rates (plan §9.4 step 4), walked in time order
 * with a running count: up to the norm regular, then 2 hours at 125%, then
 * 150%; inside a rest window 150%, 175% and 200%. With the Hours law not
 * applying (`flat`: plan §9.4 step 9), no overtime: regular, and inside a
 * rest window regular too while `PAYROLL_READINGS.hoursLawRestRegular` holds
 * (`restRegular`, §14 lawyer 3), or 150% under the other reading.
 */
function dayParts(
  day: WorkDay,
  norm: number,
  rest: readonly Window[],
  hoursLaw: { flat: boolean; restRegular: boolean },
): Part[] {
  const parts: Part[] = [];
  const first = norm * MINUTE;
  const second = (norm + OT_STEP_MINUTES) * MINUTE;
  let counted = 0;
  for (const piece of day.pieces) {
    let at = piece.from;
    while (at < piece.to) {
      const phase = counted < first ? 0 : counted < second ? 1 : 2;
      const phaseEnd =
        phase === 0
          ? at + (first - counted)
          : phase === 1
            ? at + (second - counted)
            : Number.POSITIVE_INFINITY;
      const inRest = piece.wholeRest
        ? { inside: true, until: Number.POSITIVE_INFINITY }
        : windowAt(rest, at);
      const end = Math.min(piece.to, phaseEnd, inRest.until);
      const rates = inRest.inside ? REST : WORK;
      const bucket: Bucket =
        inRest.inside && hoursLaw.restRegular
          ? "regular"
          : (rates[hoursLaw.flat ? 0 : phase] ?? "regular");
      parts.push({
        from: at,
        to: end,
        bucket,
        rest: inRest.inside,
        weekly: false,
      });
      counted += end - at;
      at = end;
    }
  }
  return parts;
}

/**
 * The weekly 42 hours (plan §9.4 step 5): the week's regular time, and its
 * time at 150% in a rest window (`PAYROLL_READINGS.restCountsTowardWeek`),
 * walked in time order toward 2,520 minutes, with each paid day not worked
 * counted at the start of its day. Past them, regular becomes 125% for the
 * week's first 2 hours of overtime and 150% after, and rest 175% and 200%, on
 * the same count. Daily overtime isn't counted, and each minute stays on its
 * day.
 */
function weekParts(
  days: readonly Part[][],
  absences: readonly { at: number; ms: number }[],
  readings: PayrollReadings,
): Part[][] {
  const limit = WEEK_MINUTES * MINUTE;
  const step = OT_STEP_MINUTES * MINUTE;
  let counted = 0;
  let over = 0;
  const queue = [...absences].sort((a, b) => a.at - b.at);
  return days.map((parts) =>
    parts.flatMap((part) => {
      while (queue.length > 0 && (queue[0]?.at ?? 0) <= part.from) {
        counted += queue.shift()?.ms ?? 0;
      }
      const counts =
        part.bucket === "regular" ||
        (part.bucket === "rest150" && readings.restCountsTowardWeek);
      if (!counts) return [part];
      const out: Part[] = [];
      let at = part.from;
      while (at < part.to) {
        if (counted < limit) {
          const take = Math.min(part.to - at, limit - counted);
          out.push({ ...part, from: at, to: at + take });
          counted += take;
          at += take;
          continue;
        }
        const early = over < step;
        const take = early ? Math.min(part.to - at, step - over) : part.to - at;
        const bucket: Bucket =
          part.bucket === "regular"
            ? early
              ? "ot125"
              : "ot150"
            : early
              ? "rest175"
              : "rest200";
        out.push({ ...part, from: at, to: at + take, bucket, weekly: true });
        over += take;
        counted += take;
        at += take;
      }
      return out;
    }),
  );
}

function partsMs(parts: readonly Part[]): Record<Bucket, number> {
  const ms = { ...NO_BUCKETS };
  for (const part of parts) ms[part.bucket] += part.to - part.from;
  return ms;
}

/** The minutes of a day's parts that `keep` picks, rounded. */
function partMinutes(
  parts: readonly Part[],
  keep: (part: Part) => boolean,
): number {
  return Math.round(
    parts.filter(keep).reduce((sum, part) => sum + part.to - part.from, 0) /
      MINUTE,
  );
}

const overtimeOf = (buckets: Buckets) =>
  buckets.ot125 + buckets.ot150 + buckets.rest175 + buckets.rest200;
const restOf = (buckets: Buckets) =>
  buckets.rest150 + buckets.rest175 + buckets.rest200;

/**
 * The 7-hour eve, for one person: the day before their rest day, or the eve
 * of a holiday they don't work (s.2(ב); plan §14, accountant 4).
 */
function eveFor(
  date: string,
  person: PayrollPerson,
  calendar: PayrollCalendar,
  holidayWorked: ReadonlyMap<string, boolean>,
): boolean {
  if (weekdayOf(date) === (person.restDay + 6) % 7) return true;
  if (!calendar.eves.has(date)) return false;
  return holidayWorked.get(addDays(date, 1)) === false;
}

/** Calendar days from `from` to `to`. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** A stretch of a month at one wage, null for days before any. */
export type MonthWageSpan = { agorot: number | null; from: string; to: string };

/**
 * A month's stretches at one wage (`YYYY-MM`), from its first day to its
 * last: the wage on each day (`wageOn`), null before any, and a new stretch
 * at each change of amount. The engine's wage segments (`byWage`) are those
 * holding a worked day; the file for payroll lists each one with something in
 * it (payroll P8).
 */
export function monthWageSpans(
  wages: PayrollPerson["wages"],
  month: string,
): MonthWageSpan[] {
  const spans: MonthWageSpan[] = [];
  for (const date of daysBetween(`${month}-01`, lastDayOf(month))) {
    const agorot = wageOn(wages, date)?.agorot ?? null;
    const last = spans.at(-1);
    if (last && last.agorot === agorot) last.to = date;
    else spans.push({ agorot, from: date, to: date });
  }
  return spans;
}

/** One person's month: the engine's work for them. */
function personMonth(
  input: PayrollInput,
  person: PayrollPerson,
  clock: Clock,
  readings: PayrollReadings,
  notes: PayrollNote[],
): PersonPayroll {
  const { month, now, settings, calendar } = input;
  const range = payrollRange(month);
  const inMonth = (date: string) => date.slice(0, 7) === month;
  const inRange = (date: string) => date >= range.from && date <= range.to;
  const flat = person.hoursLaw !== "applies";
  const hoursLaw = { flat, restRegular: flat && readings.hoursLawRestRegular };
  const holidays = holidaysFor(person, calendar.holidays, readings);
  const holidayRuns = holidaySpans(holidays);

  const own = input.entries
    .filter((entry) => entry.userId === person.userId)
    .sort((a, b) => Date.parse(a.clockIn) - Date.parse(b.clockIn));
  const closed = own.filter((entry) => entry.clockOut !== null);
  const spansOf = new Map(closed.map((entry) => [entry.id, paidSpans(entry)]));
  const allSpans = closed.flatMap((entry) => spansOf.get(entry.id) ?? []);
  const dateOfEntry = (entry: TimeEntry) =>
    clock.dateOf(Date.parse(entry.clockIn));

  // Which holidays and one-off rest days they worked (`workedOn`), and by how much.
  const workedMs = new Map<string, number>();
  const holidayWorked = new Map<string, boolean>();
  const workedDates = new Set<string>();
  for (const run of holidayRuns) {
    const began = run[0]?.window.from ?? Number.NEGATIVE_INFINITY;
    for (const holiday of run) {
      const ms = workedOn(closed, spansOf, holiday, began, clock, readings);
      workedMs.set(holiday.date, ms);
      holidayWorked.set(holiday.date, ms > 0);
      if (ms > 0) workedDates.add(holiday.date);
    }
  }
  for (const day of calendar.oneOffRestDays) {
    const ms = workedOn(closed, spansOf, day, day.window.from, clock, readings);
    if (ms > 0) workedDates.add(day.date);
  }

  // The 36 hours after a holiday, per person (plan §9.4 step 4; §14, lawyer 2):
  // a shift that starts within them after the holiday ends, or starts in the
  // holiday and runs past its end, is holiday work as a whole.
  const afterHoliday = new Map<string, HolidayKey>();
  for (const run of holidayRuns) {
    const first = run[0];
    const last = run.at(-1);
    if (!first || !last) continue;
    const starts = first.window.from;
    const ends = last.window.to;
    const lookBack = starts - readings.afterHolidayLookbackDays * DAY;
    const before = closed.filter(
      (entry) =>
        Date.parse(entry.clockIn) < starts &&
        Date.parse(entry.clockOut ?? entry.clockIn) >= lookBack,
    );
    const lastWork = before.length
      ? Math.max(...before.map((entry) => Date.parse(entry.clockOut ?? "")))
      : starts;
    const until = lastWork + readings.afterHolidayHours * HOUR;
    for (const entry of closed) {
      const begins = Date.parse(entry.clockIn);
      const after = begins >= ends;
      const through =
        begins >= starts && Date.parse(entry.clockOut ?? "") > ends;
      if (begins < until && (after || through)) {
        afterHoliday.set(entry.id, last.key);
      }
    }
  }

  const rest = joined([
    ...calendar.weeklyRest[person.restDay],
    ...holidays.map((holiday) => holiday.window),
  ]);

  // Workdays: an entry belongs to the local date of its clock-in (step 1).
  const byDate = new Map<string, TimeEntry[]>();
  for (const entry of own) {
    const date = dateOfEntry(entry);
    byDate.set(date, [...(byDate.get(date) ?? []), entry]);
  }
  const workDays: WorkDay[] = [];
  for (const [date, entries] of [...byDate].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (!inRange(date)) continue;
    const done = entries.filter((entry) => entry.clockOut !== null);
    if (done.length === 0) continue;
    const pieces: Piece[] = done.flatMap((entry) =>
      (spansOf.get(entry.id) ?? []).map((span) => ({
        ...span,
        entryId: entry.id,
        wholeRest: afterHoliday.has(entry.id),
      })),
    );
    const nightMs = clock.inDaily(
      pieces,
      hhmm(NIGHT_WINDOW.from),
      hhmm(NIGHT_WINDOW.to),
    );
    workDays.push({
      date,
      entries: done,
      pieces,
      total: done.reduce((sum, entry) => sum + entryMinutes(entry, now), 0),
      night: nightMs >= readings.nightShiftMinutes * MINUTE,
      eve: eveFor(date, person, calendar, holidayWorked),
    });
  }

  // Pay for days not worked, over the whole range: the weekly 42 counts them.
  const lines = holidayPayLines(
    {
      holidays: holidays.filter((holiday) => inRange(holiday.date)),
      oneOffRestDays: calendar.oneOffRestDays.filter((day) =>
        inRange(day.date),
      ),
      person,
      workedDates,
      history: input.history?.get(person.userId),
    },
    readings,
  );

  // Week by week, in the way the business's week says (step 3, 5).
  const ways: readonly Way[] = flat
    ? ["six"]
    : settings.workWeek === "unset"
      ? UNSET_WAYS
      : [settings.workWeek];
  const chosen = new Map<string, WeekWay["days"][number]>();
  for (
    let weekOf = range.from;
    weekOf <= range.to;
    weekOf = addDays(weekOf, 7)
  ) {
    const weekDays = workDays.filter(
      (day) => day.date >= weekOf && day.date <= addDays(weekOf, 6),
    );
    if (weekDays.length === 0) continue;
    // Paid days not worked, at their average or their norm (§14, accountant 1).
    const atNorm = readings.paidAbsenceCountsAt === "norm";
    const paidAbsent = flat
      ? []
      : lines.filter(
          (line) =>
            (atNorm || line.averageMinutes !== null) &&
            line.date >= weekOf &&
            line.date <= addDays(weekOf, 6),
        );
    const results: WeekWay[] = ways.map((way) => {
      const absences = paidAbsent.map((line) => ({
        at: clock.at(line.date, "00:00"),
        ms:
          (atNorm
            ? normOf(
                {
                  date: line.date,
                  entries: [],
                  pieces: [],
                  total: 0,
                  night: false,
                  eve: eveFor(line.date, person, calendar, holidayWorked),
                },
                way,
                settings,
                readings,
              )
            : (line.averageMinutes ?? 0)) * MINUTE,
      }));
      const daily = weekDays.map((day) => {
        const norm = normOf(day, way, settings, readings);
        return { day, norm, parts: dayParts(day, norm, rest, hoursLaw) };
      });
      const weekly = flat
        ? daily.map((d) => d.parts)
        : weekParts(
            daily.map((d) => d.parts),
            absences,
            readings,
          );
      const out = daily.map((d, index) => {
        const parts = weekly[index] ?? d.parts;
        return {
          ...d,
          parts,
          buckets: bucketsFromMs(partsMs(parts), d.day.total),
        };
      });
      return {
        way,
        days: out,
        weight: out.reduce((sum, d) => sum + weight(d.buckets), 0),
      };
    });
    // The highest-paying way; a tie goes to the first (six) (plan §14, accountant 2).
    const best = results.reduce((top, result) =>
      result.weight > top.weight ? result : top,
    );
    for (const d of best.days) chosen.set(d.day.date, d);
    if (
      !flat &&
      settings.workWeek === "unset" &&
      weekDays.some((day) => inMonth(day.date))
    ) {
      notes.push({
        code: "workWeekUnset",
        userId: person.userId,
        weekOf,
        used: best.way,
      });
    }
  }

  // The month's days, with every entry, and what each says.
  const flags: PayrollFlag[] = [];
  const breakDays: string[] = [];
  const days: PayrollDay[] = [];
  const holidayOn = new Map(holidays.map((h) => [h.date, h]));
  const oneOffOn = new Map(calendar.oneOffRestDays.map((d) => [d.date, d]));

  for (const entry of own) {
    const date = dateOfEntry(entry);
    if (!inMonth(date)) continue;
    if (entry.clockOut === null) {
      flags.push({ code: "openEntry", entryId: entry.id, date });
    } else {
      const minutes = entryMinutes(entry, now);
      if (minutes > LIMITS.entry) {
        flags.push({ code: "longEntry", entryId: entry.id, date, minutes });
      }
      const end = Date.parse(entry.clockOut);
      for (const pause of entry.breaks) {
        const length = Math.floor(breakMs(pause, end) / MINUTE);
        if (pause.unpaid && length < LIMITS.shortUnpaidBreak) {
          flags.push({ code: "shortUnpaidBreak", date, minutes: length });
        }
      }
    }
    if (entry.editedBy !== null) {
      flags.push({
        code: "edited",
        entryId: entry.id,
        date,
        by: entry.editedBy,
        note: entry.note,
      });
    }
    const waits = entryToConfirm(entry);
    if (waits) {
      flags.push({
        code: "unconfirmed",
        entryId: entry.id,
        date,
        ownerOnly: waits.ownerOnly,
      });
    }
    const afterKey = afterHoliday.get(entry.id);
    if (afterKey) {
      flags.push({
        code: "holidayNight",
        date,
        holiday: afterKey,
        entryId: entry.id,
      });
    }
  }

  const workDates = [...byDate.keys()].filter(inMonth).sort();
  for (const date of workDates) {
    const entries = byDate.get(date) ?? [];
    const computed = chosen.get(date);
    const work = workDays.find((day) => day.date === date);
    const buckets = computed?.buckets ?? { ...NO_BUCKETS };
    const parts = computed?.parts ?? [];
    const minutes = work?.total ?? 0;
    const eve = work?.eve ?? eveFor(date, person, calendar, holidayWorked);
    const restMinutes = flat
      ? partMinutes(parts, (part) => part.rest)
      : restOf(buckets);

    // Breaks: recorded ones, and the gaps between the day's entries.
    let paidBreak = 0;
    let unpaidBreak = 0;
    const breaks: number[] = [];
    let atWork = 0;
    const done = entries.filter((entry) => entry.clockOut !== null);
    done.forEach((entry, index) => {
      const end = countedEnd(entry, now);
      atWork += Math.floor((end - Date.parse(entry.clockIn)) / MINUTE);
      for (const pause of entry.breaks) {
        const length = Math.floor(breakMs(pause, end) / MINUTE);
        if (pause.unpaid) unpaidBreak += length;
        else paidBreak += length;
        breaks.push(length);
      }
      const next = done[index + 1];
      if (next) {
        const gap = Math.floor((Date.parse(next.clockIn) - end) / MINUTE);
        if (gap >= readings.doubleShiftGapMinutes) {
          flags.push({ code: "doubleShift", date, gap });
        } else if (gap > 0) breaks.push(gap);
      }
    });

    const facts: DayFacts = {
      date,
      minutes,
      overtimeMinutes: overtimeOf(buckets),
      restMinutes,
      eve,
      atWorkMinutes: atWork,
      breakMinutes: breaks.reduce((sum, length) => sum + length, 0),
      longestBreak: breaks.length ? Math.max(...breaks) : 0,
      longBreaks: breaks.filter((length) => length > LIMITS.longBreak),
    };
    if (minutes > 0) {
      if (isMinorOn(date, person.youthUntil)) {
        const band = ageBandOn(date, person.youthUntil);
        const school = band === "under16" || person.compulsoryEducation;
        const window = school
          ? readings.minorNight.school
          : readings.minorNight.other;
        const pieces = work?.pieces ?? [];
        flags.push(
          ...minorDayFlags({
            ...facts,
            band,
            underAge: minorUnderAge(date, person.youthUntil),
            fiveDayWeek: settings.workWeek === "five",
            night: {
              ...window,
              minutes: Math.round(
                clock.inDaily(pieces, window.from, window.to) / MINUTE,
              ),
            },
            after23:
              clock.inDaily(
                pieces,
                readings.minorNight.takeHomeAfter,
                "06:00",
              ) > 0,
          }),
        );
      } else if (!flat) {
        const adult = adultDayFlags(facts);
        flags.push(...adult.flags);
        if (adult.breakMissing) breakDays.push(date);
      }
    }
    if (flat && restMinutes > 0 && readings.hoursLawRestRegular) {
      flags.push({ code: "hoursLawRestDay", date, minutes: restMinutes });
    }
    const weeklyRest = partMinutes(parts, (part) => part.weekly && part.rest);
    if (weeklyRest > 0) {
      flags.push({ code: "restWeekOvertime", date, minutes: weeklyRest });
    }

    days.push({
      date,
      entryIds: entries.map((entry) => entry.id),
      minutes,
      buckets,
      norm:
        computed?.norm ??
        normOf(
          { date, entries: [], pieces: [], total: 0, night: false, eve },
          settings.workWeek === "five" ? "five" : "six",
          settings,
          readings,
        ),
      night: work?.night ?? false,
      eve,
      restMinutes,
      holiday: holidayOn.get(date)?.key ?? null,
      oneOffRestDay: oneOffOn.get(date)?.key ?? null,
      paidBreakMinutes: paidBreak,
      unpaidBreakMinutes: unpaidBreak,
      flags: [],
    });
  }
  flags.push(...breakMissingFlag(breakDays));

  // Rest between workdays (8 hours), over every workday they have.
  const allDates = [...byDate.keys()].sort();
  for (let index = 1; index < allDates.length; index++) {
    const before = (byDate.get(allDates[index - 1] ?? "") ?? []).filter(
      (entry) => entry.clockOut !== null,
    );
    const after = byDate.get(allDates[index] ?? "") ?? [];
    const date = allDates[index] ?? "";
    if (!inMonth(date) || before.length === 0 || after.length === 0) continue;
    if (flat || isMinorOn(date, person.youthUntil)) continue;
    const ended = Math.max(
      ...before.map((entry) => Date.parse(entry.clockOut ?? "")),
    );
    const began = Math.min(...after.map((entry) => Date.parse(entry.clockIn)));
    const gap = Math.floor((began - ended) / MINUTE);
    if (gap >= 0 && gap < LIMITS.restBetween) {
      flags.push({ code: "restBetweenUnder8", date, minutes: gap });
    }
  }

  // Each week's limits, for the weeks with work in the month.
  const atWork = own.map((entry) => ({
    from: Date.parse(entry.clockIn),
    to: countedEnd(entry, now),
  }));
  for (
    let weekOf = range.from;
    weekOf <= range.to;
    weekOf = addDays(weekOf, 7)
  ) {
    const weekEnd = addDays(weekOf, 6);
    const week = [...chosen.values()].filter(
      (d) => d.day.date >= weekOf && d.day.date <= weekEnd,
    );
    if (week.length === 0) continue;
    if (!week.some((d) => inMonth(d.day.date))) continue;
    // Someone resting on Sunday has a week from Saturday 18:00 to Saturday
    // 18:00, so their rest is looked for across the week's edge.
    const shift = person.restDay === 0;
    const from = shift
      ? clock.at(addDays(weekOf, -1), readings.otherRestDay.from)
      : clock.at(weekOf, "00:00");
    const to = shift
      ? clock.at(addDays(weekOf, 6), readings.otherRestDay.from)
      : clock.at(addDays(weekOf, 7), "00:00");
    // By age on each day (plan §9.5): in the week someone turns 18, the
    // minor's 40 hours count the days before the birthday, and the adults'
    // limits the days from it, with the week's rest looked for over all of it.
    const rested = longestRest(atWork, { from, to });
    const factsOf = (part: typeof week): WeekFacts => ({
      weekOf,
      minutes: part.reduce((sum, d) => sum + d.day.total, 0),
      overtimeMinutes: part.reduce((sum, d) => sum + overtimeOf(d.buckets), 0),
      night: part.some((d) => d.day.night),
      longestRest: rested,
    });
    const minorDays = week.filter((d) =>
      isMinorOn(d.day.date, person.youthUntil),
    );
    const adultDays = week.filter(
      (d) => !isMinorOn(d.day.date, person.youthUntil),
    );
    if (minorDays.length > 0) flags.push(...minorWeekFlags(factsOf(minorDays)));
    if (adultDays.length > 0 && !flat) {
      flags.push(...adultWeekFlags(factsOf(adultDays)));
    }
  }

  // Holidays and one-off rest days in the month.
  for (const holiday of holidays) {
    if (!inMonth(holiday.date)) continue;
    const minutes = Math.floor((workedMs.get(holiday.date) ?? 0) / MINUTE);
    if (minutes > 0) {
      flags.push({
        code: "holidayWorked",
        date: holiday.date,
        holiday: holiday.key,
        minutes,
        paidAt: hoursLaw.restRegular ? "regular" : "rest",
      });
    }
    if (person.restDay !== 6 && overlap(allSpans, holiday.window) > 0) {
      flags.push({
        code: "restDayHolidays",
        date: holiday.date,
        holiday: holiday.key,
      });
    }
  }
  for (const day of calendar.oneOffRestDays) {
    if (!inMonth(day.date)) continue;
    const minutes = Math.floor(overlap(allSpans, day.window) / MINUTE);
    if (minutes > 0) {
      flags.push({
        code: "oneOffRestDay",
        date: day.date,
        key: day.key,
        minutes,
      });
    }
  }

  // Wages (step 6) and the estimate (step 8).
  const worked = days.filter((day) => day.minutes > 0);
  const monthDays = daysBetween(`${month}-01`, lastDayOf(month));
  const wageFor = (date: string) => wageOn(person.wages, date)?.agorot ?? null;
  const wageSpans = monthWageSpans(person.wages, month);
  const byWage: WageSegment[] = wageSpans.flatMap((span) => {
    const inSpan = worked.filter(
      (day) => day.date >= span.from && day.date <= span.to,
    );
    if (inSpan.length === 0) return [];
    const buckets = addBuckets(...inSpan.map((day) => day.buckets));
    const { agorot } = span;
    return [
      {
        agorot,
        from: span.from,
        to: span.to,
        buckets,
        amountAgorot:
          agorot === null
            ? null
            : BUCKETS.reduce(
                (sum, bucket) =>
                  sum + bucketAgorot(buckets[bucket], agorot, bucket),
                0,
              ),
      },
    ];
  });
  const unpaidDay = worked.find((day) => wageFor(day.date) === null);
  if (unpaidDay) flags.push({ code: "noWage", from: unpaidDay.date });

  if (worked.length > 0) {
    if (person.payrollNumber === null) flags.push({ code: "noPayrollNumber" });
    if (person.hoursLaw === "trust") flags.push({ code: "hoursLawTrust" });
    if (person.hoursLaw === "unsupervised") {
      flags.push({ code: "hoursLawUnsupervised" });
    }
    flags.push(
      ...belowMinimum(person, monthDays, input.minimumWage ?? MINIMUM_WAGES),
    );
  }

  const holidayPay = lines.filter((line) => inMonth(line.date));
  const estimateAgorot = unpaidDay
    ? null
    : byWage.reduce((sum, segment) => sum + (segment.amountAgorot ?? 0), 0) +
      holidayPay.reduce((sum, line) => sum + (line.agorot ?? 0), 0);

  for (const day of days) {
    day.flags = flags.filter((flag) => flagDate(flag) === day.date);
  }
  const ownMonth = own.filter((entry) => inMonth(dateOfEntry(entry)));
  return {
    userId: person.userId,
    daysWorked: worked.length,
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    buckets: addBuckets(...days.map((day) => day.buckets)),
    nightShifts: days.filter((day) => day.night).length,
    paidBreakMinutes: days.reduce((sum, day) => sum + day.paidBreakMinutes, 0),
    unpaidBreakMinutes: days.reduce(
      (sum, day) => sum + day.unpaidBreakMinutes,
      0,
    ),
    editedEntries: ownMonth.filter((entry) => entry.editedBy !== null).length,
    openEntries: ownMonth.filter((entry) => entry.clockOut === null).length,
    unconfirmedEntries: ownMonth.filter((entry) => entryToConfirm(entry))
      .length,
    byWage,
    holidayPay,
    estimateAgorot,
    days,
    flags,
  };
}

/**
 * A week's longest rest, in minutes: of the stretches without work that
 * start in the window, the longest, to the next work after it however far on
 * (Infinity with none yet), and the stretch under way when the window opens,
 * from its opening. So a rest from Friday afternoon to Sunday morning is the
 * week's it starts in, and someone who started work midweek had their rest.
 */
function longestRest(work: readonly Window[], window: Window): number {
  const spans = joined(work);
  let longest = 0;
  let restFrom = Number.NEGATIVE_INFINITY;
  for (const span of [...spans, { from: Number.POSITIVE_INFINITY, to: 0 }]) {
    const restTo = span.from;
    if (restTo > restFrom) {
      if (restFrom < window.from && restTo > window.from) {
        longest = Math.max(longest, restTo - window.from);
      } else if (restFrom >= window.from && restFrom < window.to) {
        longest = Math.max(longest, restTo - restFrom);
      }
    }
    restFrom = Math.max(restFrom, span.to);
  }
  return longest === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.floor(longest / MINUTE);
}

/**
 * The days of the month a wage is under the minimum for the person's age on
 * the day, in runs of the same wage, minimum and band.
 */
function belowMinimum(
  person: PayrollPerson,
  days: readonly string[],
  table: readonly MinimumWageRow[],
): PayrollFlag[] {
  const runs: Extract<PayrollFlag, { code: "belowMinimumWage" }>[] = [];
  for (const date of days) {
    const wage = wageOn(person.wages, date);
    if (!wage) continue;
    const band: AgeBand = ageBandOn(date, person.youthUntil);
    const minimum = minimumWageOn(date, band, table);
    if (!minimum || wage.agorot >= minimum.agorot) continue;
    const last = runs.at(-1);
    if (
      last &&
      last.to === addDays(date, -1) &&
      last.agorot === wage.agorot &&
      last.minimum === minimum.agorot &&
      last.band === band
    ) {
      last.to = date;
    } else {
      runs.push({
        code: "belowMinimumWage",
        from: date,
        to: date,
        agorot: wage.agorot,
        minimum: minimum.agorot,
        band,
      });
    }
  }
  return runs;
}

/**
 * Everyone's month (plan §9.4): minutes at each rate by day and wage, the
 * pay for days not worked, an estimate, and what to check, with the notes on
 * the whole month.
 */
export function payrollMonth(input: PayrollInput): PayrollMonth {
  const readings = input.readings ?? PAYROLL_READINGS;
  const clock = clockOf(input.timeZone);
  const notes: PayrollNote[] = [];
  if (minimumWageTableStale(input.month, input.minimumWage ?? MINIMUM_WAGES)) {
    notes.push({ code: "minimumWageTableStale" });
  }
  notes.push({ code: "paidAbsencesMissing" });
  if (input.settings.roundToMinutes !== 0) {
    notes.push({
      code: "roundingIgnored",
      step: input.settings.roundToMinutes,
    });
  }
  const people = input.people.map((person) =>
    personMonth(input, person, clock, readings, notes),
  );
  return {
    month: input.month,
    engineVersion: PAYROLL_ENGINE_VERSION,
    people,
    notes,
  };
}

/** One person's month: the worker's own. Null when they aren't among `input.people`. */
export function personPayroll(
  input: PayrollInput,
  userId: string,
): PersonPayroll | null {
  const person = input.people.find((one) => one.userId === userId);
  if (!person) return null;
  return (
    payrollMonth({
      ...input,
      people: [person],
      entries: input.entries.filter((entry) => entry.userId === userId),
    }).people[0] ?? null
  );
}

/**
 * The month without its amounts: while the business's `payEstimate` is off
 * (a team setting, on only once an accountant confirms; Orel, 10 November
 * 2026), hours and rates show and no shekel does.
 */
export function withoutAmounts(month: PayrollMonth): PayrollMonth {
  return {
    ...month,
    people: month.people.map((person) => ({
      ...person,
      estimateAgorot: null,
      byWage: person.byWage.map((segment) => ({
        ...segment,
        amountAgorot: null,
      })),
      holidayPay: person.holidayPay.map((line) => ({ ...line, agorot: null })),
    })),
  };
}

/**
 * Whether a worker sees an estimate of their own month (Orel, 9 and 10
 * November 2026): only while the business shows estimates at all (the team's
 * `payEstimate`), the owner lets workers see theirs (`workersSeeEstimate`),
 * and they have a wage to work it out by.
 */
export function ownEstimateShown(
  settings: { payEstimate: boolean; workersSeeEstimate: boolean },
  wages: readonly unknown[],
): boolean {
  return (
    settings.payEstimate && settings.workersSeeEstimate && wages.length > 0
  );
}

/**
 * A person as the engine reads them, from what payroll keeps: their details
 * (the defaults when they have none), periods and wages.
 */
export function payrollPersonOf(
  userId: string,
  details: PayrollDetails | undefined,
  periods: readonly Pick<EmploymentPeriod, "startedOn" | "endedOn">[],
  wages: readonly Pick<WageRow, "agorot" | "from" | "setAt">[],
): PayrollPerson {
  const own = details ?? DEFAULT_DETAILS;
  return {
    userId,
    payrollNumber: own.payrollNumber,
    restDay: own.restDay,
    hoursLaw: own.hoursLaw,
    youthUntil: own.youthUntil,
    compulsoryEducation: own.compulsoryEducation,
    periods: periods.map(({ startedOn, endedOn }) => ({ startedOn, endedOn })),
    wages: wages.map(({ agorot, from, setAt }) => ({ agorot, from, setAt })),
  };
}

/**
 * Who a month is worked out for: the staff (an owner, a manager, a worker),
 * and anyone with hours in the entries, such as someone who became the
 * business's accountant after working there.
 */
export function payrollPeopleOf(
  members: readonly { userId: string; role: Role; active: boolean }[],
  entries: readonly Pick<TimeEntry, "userId">[],
): string[] {
  const withHours = new Set(entries.map((entry) => entry.userId));
  return members
    .filter(
      (member) =>
        (member.active && isStaff(member.role)) || withHours.has(member.userId),
    )
    .map((member) => member.userId);
}

/** The instants a month's entries are read over: its weeks, and a week before for the holiday rule, and the history months before that. */
export function payrollReadRange(
  month: string,
  timeZone: string,
  historyFrom: string,
  readings: PayrollReadings = PAYROLL_READINGS,
): { from: Date; to: Date } {
  const range = payrollRange(month);
  const before = addDays(range.from, -readings.afterHolidayLookbackDays);
  const start = `${historyFrom}-01` < before ? `${historyFrom}-01` : before;
  return {
    from: instantIn(start, "00:00", timeZone),
    to: instantIn(addDays(range.to, 1), "00:00", timeZone),
  };
}
