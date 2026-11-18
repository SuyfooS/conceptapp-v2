import { addDays, weekdayOf, weekStartOf } from "./availability";
import { minutesAgorot } from "./money";
import type { PayrollHistory, PayrollPerson } from "./payroll";
import type { Holiday, HolidayKey, OneOffRestDay } from "./payroll-calendar";
import { PAYROLL_READINGS, type PayrollReadings } from "./payroll-readings";
import { entryDate, entryMinutes, monthOf, type TimeEntry } from "./time-clock";
import { addMonths } from "./time-clock-format";
import { wageOn } from "./wages";

/*
 * Pay for a day not worked (payroll P6, plan §9.4 step 7): holiday pay (דמי
 * חג) for an hourly worker, and the day's pay for a one-off rest day such as
 * Knesset election day. Each is a line of the estimate with what to check
 * beside it, since the app can't know all the conditions: whether the person
 * worked the day before and after, how the average is taken, and so on.
 */

/** What to check on a line, in this order. */
export const HOLIDAY_PAY_CHECKS = [
  /** Holiday pay: they worked the day before and the day after, or were away with consent. */
  "adjacentDays",
  /** The average is of the 3 months before; 12 is the other reading. */
  "averagePeriod",
  /** Their history doesn't show that weekday as one of theirs. */
  "wasScheduled",
  /** No hours in the months before: no average to pay by. */
  "noHistory",
  /** They rest on Friday or Sunday, and may keep holidays of their own. */
  "ownHolidays",
  /** Election day: 14 days with the employer (worked or employed: two readings). */
  "fourteenDays",
  /** Election day: foreign workers in some sectors are not entitled. */
  "sectorExclusion",
] as const;
export type HolidayPayCheck = (typeof HOLIDAY_PAY_CHECKS)[number];

export type HolidayPayLine = {
  date: string;
  /** Exactly one of these two is set. */
  holiday: HolidayKey | null;
  oneOffRestDay: string | null;
  /** The person's average paid minutes a day in the months before; null with no history. */
  averageMinutes: number | null;
  /** That average at their wage on the day, 100%; null with no average or no wage. */
  agorot: number | null;
  check: HolidayPayCheck[];
};

const inOrder = (checks: Iterable<HolidayPayCheck>): HolidayPayCheck[] => {
  const wanted = new Set(checks);
  return HOLIDAY_PAY_CHECKS.filter((check) => wanted.has(check));
};

/** A day (`YYYY-MM-DD`) plus whole months: the same day, or the month's last when it has none. */
export function addMonthsToDay(date: string, months: number): string {
  const month = addMonths(date.slice(0, 7), months);
  const [year = 0, index = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  const day = Math.min(Number(date.slice(8, 10)), last);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * The paid holidays that are the person's: every one for someone resting on
 * Saturday, and for someone resting on Friday or Sunday too while
 * `PAYROLL_READINGS.holidaysForOtherRestDays` holds (plan §14, lawyer 1);
 * none for them under the other reading. The engine and the pay lines both
 * read it, so the reading is one change.
 */
export function holidaysFor<T>(
  person: Pick<PayrollPerson, "restDay">,
  holidays: readonly T[],
  readings: PayrollReadings = PAYROLL_READINGS,
): readonly T[] {
  return person.restDay === 6 || readings.holidaysForOtherRestDays
    ? holidays
    : [];
}

/** Whether a day falls in one of the person's periods of work. */
function employedOn(person: PayrollPerson, date: string): boolean {
  return person.periods.some(
    (period) =>
      period.startedOn <= date &&
      (period.endedOn === null || date <= period.endedOn),
  );
}

/** The first day the person started, over all their periods; null with none. */
function firstStart(person: PayrollPerson): string | null {
  return person.periods.reduce<string | null>(
    (first, period) =>
      first === null || period.startedOn < first ? period.startedOn : first,
    null,
  );
}

/**
 * Whether the person's history shows `weekday` as one of their days: worked
 * in at least the reading's share of the weeks they worked (payroll plan §14,
 * accountant 7). Null with no history to tell by.
 */
export function wouldHaveWorked(
  history: PayrollHistory | undefined,
  weekday: number,
  readings: PayrollReadings = PAYROLL_READINGS,
): boolean | null {
  if (!history || history.weeks === 0) return null;
  const worked =
    history.weekdays[weekday as keyof PayrollHistory["weekdays"]] ?? 0;
  return worked >= history.weeks * readings.wouldHaveWorkedShare;
}

/** The average and its amount for a day not worked, at the person's wage on it. */
function averageOf(
  person: PayrollPerson,
  history: PayrollHistory | undefined,
  date: string,
): { averageMinutes: number | null; agorot: number | null } {
  const averageMinutes =
    history && history.days > 0
      ? Math.round(history.minutes / history.days)
      : null;
  const wage = wageOn(person.wages, date);
  return {
    averageMinutes,
    agorot:
      averageMinutes === null || wage === null
        ? null
        : minutesAgorot(averageMinutes, wage.agorot, 100),
  };
}

/**
 * The lines of pay for days not worked, for one person: each paid holiday of
 * theirs (`holidaysFor`) and one-off rest day they didn't work (`workedDates`
 * holds the days they did, as the engine's `workedOn` says), that isn't their
 * rest day, on which they were employed. Holiday pay also needs 3 months with
 * the employer by then. A line is kept, with `wasScheduled`, when their
 * history doesn't show the weekday as one of theirs, Fridays too and in every
 * work week.
 */
export function holidayPayLines(
  args: {
    holidays: readonly Holiday[];
    oneOffRestDays: readonly OneOffRestDay[];
    person: PayrollPerson;
    workedDates: ReadonlySet<string>;
    history: PayrollHistory | undefined;
  },
  readings: PayrollReadings = PAYROLL_READINGS,
): HolidayPayLine[] {
  const { person, workedDates, history } = args;
  const start = firstStart(person);
  const lines: HolidayPayLine[] = [];
  const owed = (date: string) =>
    !workedDates.has(date) &&
    weekdayOf(date) !== person.restDay &&
    employedOn(person, date);
  const scheduled = (date: string): HolidayPayCheck[] => {
    const usual = wouldHaveWorked(history, weekdayOf(date), readings);
    return [
      ...(usual === true ? [] : (["wasScheduled"] as const)),
      ...(history && history.days > 0 ? [] : (["noHistory"] as const)),
    ];
  };

  for (const holiday of holidaysFor(person, args.holidays, readings)) {
    if (!owed(holiday.date) || start === null) continue;
    if (addMonthsToDay(start, readings.holidayPayAfterMonths) > holiday.date) {
      continue;
    }
    lines.push({
      date: holiday.date,
      holiday: holiday.key,
      oneOffRestDay: null,
      ...averageOf(person, history, holiday.date),
      check: inOrder([
        "adjacentDays",
        "averagePeriod",
        ...scheduled(holiday.date),
        ...(person.restDay === 6 ? [] : (["ownHolidays"] as const)),
      ]),
    });
  }
  for (const day of args.oneOffRestDays) {
    if (!owed(day.date)) continue;
    lines.push({
      date: day.date,
      holiday: null,
      oneOffRestDay: day.key,
      ...averageOf(person, history, day.date),
      check: inOrder([
        "averagePeriod",
        ...scheduled(day.date),
        "fourteenDays",
        "sectorExclusion",
      ]),
    });
  }
  return lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The months (`YYYY-MM`) a month's history is read from: the reading's count before it. */
export function historyMonths(
  month: string,
  readings: PayrollReadings = PAYROLL_READINGS,
): { from: string; to: string } {
  return {
    from: addMonths(month, -readings.averageMonths),
    to: addMonths(month, -1),
  };
}

/**
 * Each person's history for holiday pay, from the entries of the months
 * before `month` (`historyMonths`): paid minutes and days worked (closed
 * entries only, by their workday), the weeks they worked in (Sunday to
 * Saturday), and in how many of those weeks each weekday was worked. Entries
 * of other months are left out.
 */
export function payrollHistory(
  entries: readonly TimeEntry[],
  month: string,
  timeZone: string,
  now: Date,
  readings: PayrollReadings = PAYROLL_READINGS,
): Map<string, PayrollHistory> {
  const { from, to } = historyMonths(month, readings);
  const people = new Map<
    string,
    { minutes: number; days: Set<string>; weeks: Set<string> }
  >();
  for (const entry of entries) {
    if (entry.clockOut === null) continue;
    const date = entryDate(entry, timeZone);
    const entryMonth = monthOf(date);
    if (entryMonth < from || entryMonth > to) continue;
    const own = people.get(entry.userId) ?? {
      minutes: 0,
      days: new Set<string>(),
      weeks: new Set<string>(),
    };
    own.minutes += entryMinutes(entry, now);
    own.days.add(date);
    own.weeks.add(weekStartOf(date, readings.weekStartsOn));
    people.set(entry.userId, own);
  }
  return new Map(
    [...people].map(([userId, own]) => {
      const weekdays: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, number> = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
      };
      // Each day is one weekday of one week, however many entries it has.
      for (const date of own.days) {
        weekdays[weekdayOf(date) as keyof typeof weekdays] += 1;
      }
      return [
        userId,
        {
          minutes: own.minutes,
          days: own.days.size,
          weeks: own.weeks.size,
          weekdays,
        },
      ];
    }),
  );
}

/** Whether a line's day sits in the week starting on `weekOf`. */
export function lineInWeek(line: HolidayPayLine, weekOf: string): boolean {
  return line.date >= weekOf && line.date <= addDays(weekOf, 6);
}
