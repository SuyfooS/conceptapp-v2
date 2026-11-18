import type { AgeBand } from "./minimum-wage";
import type { HolidayKey } from "./payroll-calendar";

/*
 * What the payroll engine asks someone to look at (payroll P6, plan §9.5): the
 * flags on a person's month, the notes on the whole month, and the checks of
 * the limits the Hours of Work and Rest Law and the Youth Labor Law set, kept
 * apart from the engine so it stays readable. A flag never changes a rate or a
 * punch: it says what to check. Each carries its values; the words are under
 * `modules.time_clock.payroll.flags.<code>` and `….notes.<code>`.
 */

/** The statute's limits the flags check (payroll plan §2, §9.5). Minutes. */
export const LIMITS = {
  /** An entry this long is worth a look (over 14 hours). */
  entry: 14 * 60,
  /** A day's paid time, overtime included: 12 hours. */
  day: 12 * 60,
  /** Overtime in a week: 16 hours, under the general permit. */
  weekOvertime: 16 * 60,
  /** A week with a night shift: 58 hours, overtime included. */
  nightWeek: 58 * 60,
  /** Between one workday and the next: 8 hours, under the general permit. */
  restBetween: 8 * 60,
  /** The weekly rest: 36 hours in a row (s.7). */
  weeklyRest: 36 * 60,
  /** From this long a day, a break is due (s.20). */
  breakAfter: 6 * 60,
  /** That break: 45 minutes, of which 30 in a row; 30 on an eve. */
  break: 45,
  breakInARow: 30,
  eveBreak: 30,
  /** A break longer than this splits the day: 3 hours. */
  longBreak: 3 * 60,
  /** An unpaid break shorter than this is working time (s.1, s.20(ג)). */
  shortUnpaidBreak: 30,
  /** Minors (Youth Labor Law s.20): 8 hours a day, 9 for 16–18 in a five-day week, 7 on an eve, 40 a week. */
  minorDay: 8 * 60,
  minorDayInFive: 9 * 60,
  minorEve: 7 * 60,
  minorWeek: 40 * 60,
} as const;

export type PayrollFlag =
  // The record.
  | { code: "openEntry"; entryId: string; date: string }
  | { code: "longEntry"; entryId: string; date: string; minutes: number }
  | {
      code: "edited";
      entryId: string;
      date: string;
      /** Who corrected or added it; null when their account is gone. */
      by: string | null;
      note: string | null;
    }
  | { code: "unconfirmed"; entryId: string; date: string; ownerOnly: boolean }
  | { code: "shortUnpaidBreak"; date: string; minutes: number }
  /** Worked days with no hourly wage, the first of them `from`. */
  | { code: "noWage"; from: string }
  | { code: "noPayrollNumber" }
  // The limits for adults.
  | { code: "dayOver12"; date: string; minutes: number }
  | { code: "weekOvertimeOver16"; weekOf: string; minutes: number }
  | { code: "nightWeekOver58"; weekOf: string; minutes: number }
  | { code: "restBetweenUnder8"; date: string; minutes: number }
  | { code: "weeklyRestUnder36"; weekOf: string; longest: number }
  /** One line for the month: the days of 6 hours or more without the break. */
  | { code: "breakMissing"; days: number; dates: string[] }
  | { code: "eveBreakUnder30"; date: string; minutes: number }
  | { code: "breakOver3h"; date: string; minutes: number }
  // Pay.
  | {
      code: "belowMinimumWage";
      from: string;
      to: string;
      agorot: number;
      minimum: number;
      band: AgeBand;
    }
  | { code: "oneOffRestDay"; date: string; key: string; minutes: number }
  | {
      code: "holidayWorked";
      date: string;
      holiday: HolidayKey;
      /** The minutes that made it a holiday worked (the engine's `workedOn`). */
      minutes: number;
      /**
       * How they were paid: `rest` at the rest rates, `regular` for someone the
       * Hours law doesn't apply to (`hoursLawRestDay`), whose holiday pay is
       * still the extension order's.
       */
      paidAt: "regular" | "rest";
    }
  /** A whole shift after a holiday counted as holiday work (the 36 hours, per person). */
  | { code: "holidayNight"; date: string; holiday: HolidayKey; entryId: string }
  /** Someone resting on Friday or Sunday worked in a Jewish holiday's window. */
  | { code: "restDayHolidays"; date: string; holiday: HolidayKey }
  /** Two entries on one date this far apart (minutes), counted as one workday. */
  | { code: "doubleShift"; date: string; gap: number }
  | { code: "hoursLawTrust" }
  | { code: "hoursLawUnsupervised" }
  /** Minutes in a rest window paid as regular, the Hours law not applying. */
  | { code: "hoursLawRestDay"; date: string; minutes: number }
  /**
   * Minutes in a rest window past the week's 42 hours, paid 175% or 200%: to
   * check until an accountant confirms the reading (Orel, 9 November 2026).
   */
  | { code: "restWeekOvertime"; date: string; minutes: number }
  // Minors, by their age on the day.
  | { code: "minorUnderAge"; date: string }
  | { code: "minorDayOver"; date: string; minutes: number; limit: number }
  | { code: "minorEveOver7"; date: string; minutes: number }
  | { code: "minorWeekOver40"; weekOf: string; minutes: number }
  | { code: "minorOvertime"; date: string; minutes: number }
  | { code: "minorRestDay"; date: string; minutes: number }
  | {
      code: "minorNight";
      date: string;
      /** Where the minor's night starts: "20:00" or "22:00". */
      from: string;
      to: string;
      minutes: number;
    }
  | { code: "minorBreak"; date: string; minutes: number }
  | { code: "minorAfter23"; date: string };

export type PayrollFlagCode = PayrollFlag["code"];

/** Who a flag is about, for the screens' grouping. */
export type FlagGroup = "record" | "adults" | "pay" | "minors";

/** Every flag code, by its group: a code missing here fails to compile. */
export const PAYROLL_FLAGS = {
  openEntry: "record",
  longEntry: "record",
  edited: "record",
  unconfirmed: "record",
  shortUnpaidBreak: "record",
  noWage: "record",
  noPayrollNumber: "record",
  dayOver12: "adults",
  weekOvertimeOver16: "adults",
  nightWeekOver58: "adults",
  restBetweenUnder8: "adults",
  weeklyRestUnder36: "adults",
  breakMissing: "adults",
  eveBreakUnder30: "adults",
  breakOver3h: "adults",
  belowMinimumWage: "pay",
  oneOffRestDay: "pay",
  holidayWorked: "pay",
  holidayNight: "pay",
  restDayHolidays: "pay",
  doubleShift: "pay",
  hoursLawTrust: "pay",
  hoursLawUnsupervised: "pay",
  hoursLawRestDay: "pay",
  restWeekOvertime: "pay",
  minorUnderAge: "minors",
  minorDayOver: "minors",
  minorEveOver7: "minors",
  minorWeekOver40: "minors",
  minorOvertime: "minors",
  minorRestDay: "minors",
  minorNight: "minors",
  minorBreak: "minors",
  minorAfter23: "minors",
} as const satisfies Record<PayrollFlagCode, FlagGroup>;

export const PAYROLL_FLAG_CODES = Object.keys(
  PAYROLL_FLAGS,
) as PayrollFlagCode[];

/** Notes on the whole month, not on one person's day. */
export type PayrollNote =
  /** The month is past the April after the minimum wage table's last row. */
  | { code: "minimumWageTableStale" }
  /** Always: vacation, sick days and reserve duty aren't in the app, and they count toward the 42. */
  | { code: "paidAbsencesMissing" }
  /** The business rounds the clock's hours; payroll counts exact minutes. */
  | { code: "roundingIgnored"; step: 5 | 15 }
  /** The business's week isn't set: which way this person's week was worked out. */
  | {
      code: "workWeekUnset";
      userId: string;
      weekOf: string;
      used: "five" | "six" | "smaller";
    };

export type PayrollNoteCode = PayrollNote["code"];

/** Every note code: a code missing here fails to compile. */
export const PAYROLL_NOTES = {
  minimumWageTableStale: true,
  paidAbsencesMissing: true,
  roundingIgnored: true,
  workWeekUnset: true,
} as const satisfies Record<PayrollNoteCode, true>;

export const PAYROLL_NOTE_CODES = Object.keys(
  PAYROLL_NOTES,
) as PayrollNoteCode[];

/** What a day's limits are checked from. Minutes. */
export type DayFacts = {
  date: string;
  /** Paid. */
  minutes: number;
  /** At 125%, 150%, 175% or 200%. */
  overtimeMinutes: number;
  /** In a rest window, at any rate. */
  restMinutes: number;
  /** A 7-hour eve for this person: the day before their rest day, or a holiday's they don't work. */
  eve: boolean;
  /** From each entry's start to its end, breaks included. */
  atWorkMinutes: number;
  /** Every break, paid or not, and the gaps between the day's entries. */
  breakMinutes: number;
  longestBreak: number;
  /** Each break or gap longer than `LIMITS.longBreak`. */
  longBreaks: readonly number[];
};

/** Whether a day of 6 hours or more lacks its break: 45 minutes with 30 in a row, or 30 on an eve. */
function breakShort(day: DayFacts): boolean {
  if (day.atWorkMinutes < LIMITS.breakAfter) return false;
  if (day.eve) return day.breakMinutes < LIMITS.eveBreak;
  return (
    day.breakMinutes < LIMITS.break || day.longestBreak < LIMITS.breakInARow
  );
}

/**
 * An adult's limits on one day. `breakMissing` is said once for the month
 * (`breakMissingFlag`), so the day only says whether it counts.
 */
export function adultDayFlags(day: DayFacts): {
  flags: PayrollFlag[];
  breakMissing: boolean;
} {
  const flags: PayrollFlag[] = [];
  if (day.minutes > LIMITS.day) {
    flags.push({ code: "dayOver12", date: day.date, minutes: day.minutes });
  }
  for (const minutes of day.longBreaks) {
    flags.push({ code: "breakOver3h", date: day.date, minutes });
  }
  const short = breakShort(day);
  if (short && day.eve) {
    flags.push({
      code: "eveBreakUnder30",
      date: day.date,
      minutes: day.breakMinutes,
    });
  }
  return { flags, breakMissing: short && !day.eve };
}

/** The month's one line about days without their break, or none. */
export function breakMissingFlag(dates: readonly string[]): PayrollFlag[] {
  return dates.length === 0
    ? []
    : [{ code: "breakMissing", days: dates.length, dates: [...dates] }];
}

/** What a week's limits are checked from. Minutes. */
export type WeekFacts = {
  /** Its Sunday. */
  weekOf: string;
  minutes: number;
  overtimeMinutes: number;
  /** It has a night shift. */
  night: boolean;
  /** The longest stretch without work in it (for someone resting on Sunday, from Saturday 18:00 before it). */
  longestRest: number;
};

/** An adult's limits on one week. */
export function adultWeekFlags(week: WeekFacts): PayrollFlag[] {
  const flags: PayrollFlag[] = [];
  if (week.overtimeMinutes > LIMITS.weekOvertime) {
    flags.push({
      code: "weekOvertimeOver16",
      weekOf: week.weekOf,
      minutes: week.overtimeMinutes,
    });
  }
  if (week.night && week.minutes > LIMITS.nightWeek) {
    flags.push({
      code: "nightWeekOver58",
      weekOf: week.weekOf,
      minutes: week.minutes,
    });
  }
  if (week.longestRest < LIMITS.weeklyRest) {
    flags.push({
      code: "weeklyRestUnder36",
      weekOf: week.weekOf,
      longest: week.longestRest,
    });
  }
  return flags;
}

/** What a minor's day is checked from, beyond an adult's. */
export type MinorDayFacts = DayFacts & {
  band: AgeBand;
  /** Under 15 on the day (Youth Labor Law s.2). */
  underAge: boolean;
  /** The business's week is five days: 9 hours a day from 16. */
  fiveDayWeek: boolean;
  /** Their night, by age and school: where it starts and ends, and the paid minutes in it. */
  night: { from: string; to: string; minutes: number };
  /** Paid time after `PAYROLL_READINGS.minorNight.takeHomeAfter`. */
  after23: boolean;
};

/** A minor's limits on one day, by their age on it. */
export function minorDayFlags(day: MinorDayFacts): PayrollFlag[] {
  const flags: PayrollFlag[] = [];
  const { date } = day;
  if (day.underAge) flags.push({ code: "minorUnderAge", date });
  const limit =
    day.fiveDayWeek && day.band !== "under16"
      ? LIMITS.minorDayInFive
      : LIMITS.minorDay;
  if (day.minutes > limit) {
    flags.push({ code: "minorDayOver", date, minutes: day.minutes, limit });
  }
  if (day.eve && day.minutes > LIMITS.minorEve) {
    flags.push({ code: "minorEveOver7", date, minutes: day.minutes });
  }
  if (day.overtimeMinutes > 0) {
    flags.push({ code: "minorOvertime", date, minutes: day.overtimeMinutes });
  }
  if (day.restMinutes > 0) {
    flags.push({ code: "minorRestDay", date, minutes: day.restMinutes });
  }
  if (day.night.minutes > 0) {
    flags.push({ code: "minorNight", date, ...day.night });
  }
  if (breakShort(day)) {
    flags.push({ code: "minorBreak", date, minutes: day.breakMinutes });
  }
  if (day.after23) flags.push({ code: "minorAfter23", date });
  return flags;
}

/** A minor's limit on one week. */
export function minorWeekFlags(week: WeekFacts): PayrollFlag[] {
  return week.minutes > LIMITS.minorWeek
    ? [{ code: "minorWeekOver40", weekOf: week.weekOf, minutes: week.minutes }]
    : [];
}

/** The day a flag is about, if it is about one. */
export function flagDate(flag: PayrollFlag): string | null {
  return "date" in flag ? flag.date : null;
}
