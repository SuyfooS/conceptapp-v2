import type { HolidayPayLine } from "./holiday-pay";
import {
  BUCKETS,
  type Bucket,
  type Buckets,
  type PayrollDay,
  type PersonPayroll,
  type WageSegment,
} from "./payroll";
import type { HolidayKey } from "./payroll-calendar";
import type { RestDay } from "./payroll-details";
import {
  type FlagGroup,
  PAYROLL_FLAGS,
  type PayrollFlag,
  type PayrollFlagCode,
  type PayrollNote,
} from "./payroll-flags";

/*
 * What the pay screens draw from the hours engine (payroll P7, plan §10): a
 * person's month by rate, by wage and by day, what a pay holder looks at in
 * it, the values each flag's words take, and what a worker sees of their own.
 * Pure: the words and the formatting are the screens'.
 */

/** How the rest rates are named: by the person's rest day, or for anyone. */
export type RestName = "saturday" | "friday" | "sunday" | "other";

export function restNameOf(restDay: RestDay): RestName {
  return restDay === 5 ? "friday" : restDay === 0 ? "sunday" : "saturday";
}

/** A table's headers: the rest day everyone shares, or words for any rest day. */
export function restNameOfAll(restDays: readonly RestDay[]): RestName {
  const names = [...new Set(restDays.map(restNameOf))];
  if (names.length === 0) return "saturday";
  return names.length === 1 ? (names[0] ?? "saturday") : "other";
}

/** The rates with minutes, in payroll's order. */
export function ratesShown(buckets: Buckets): Bucket[] {
  return BUCKETS.filter((bucket) => buckets[bucket] > 0);
}

/** A day's minutes past its regular ones, by rate: "of which 0.60 at 125%". */
export function daySplit(
  buckets: Buckets,
): { bucket: Exclude<Bucket, "regular">; minutes: number }[] {
  return BUCKETS.flatMap((bucket) =>
    bucket !== "regular" && buckets[bucket] > 0
      ? [{ bucket, minutes: buckets[bucket] }]
      : [],
  );
}

/** What kind of day a workday was, in the order a day's line names them. */
export const DAY_TAGS = ["holiday", "oneOff", "rest", "eve", "night"] as const;
export type DayTag = (typeof DAY_TAGS)[number];

export function dayTags(
  day: Pick<
    PayrollDay,
    "holiday" | "oneOffRestDay" | "restMinutes" | "eve" | "night"
  >,
): DayTag[] {
  const tags: Record<DayTag, boolean> = {
    holiday: day.holiday !== null,
    oneOff: day.oneOffRestDay !== null,
    // A holiday's minutes are in a rest window too: its name says it.
    rest: day.restMinutes > 0 && day.holiday === null,
    eve: day.eve,
    night: day.night,
  };
  return DAY_TAGS.filter((tag) => tags[tag]);
}

/**
 * Flags the pay screens already say in words of their own (payroll P3 to P5):
 * a shift open, corrected or waiting, days with no wage, no payroll number.
 */
export const FLAGS_SAID_ELSEWHERE = [
  "openEntry",
  "edited",
  "unconfirmed",
  "noWage",
  "noPayrollNumber",
] as const satisfies readonly PayrollFlagCode[];

/** Flags that say how someone is paid, with nothing in the month to fix: the Hours law doesn't apply to them. */
export const FLAGS_ABOUT_PAY = [
  "hoursLawTrust",
  "hoursLawUnsupervised",
] as const satisfies readonly PayrollFlagCode[];

const SAID: ReadonlySet<PayrollFlagCode> = new Set(FLAGS_SAID_ELSEWHERE);
const ABOUT: ReadonlySet<PayrollFlagCode> = new Set(FLAGS_ABOUT_PAY);

/** Minors first: what the law allows them least of. */
const GROUP_ORDER: Record<FlagGroup, number> = {
  minors: 0,
  adults: 1,
  pay: 2,
  record: 3,
};

/** The day, week or start a flag is about, to put flags in order; "" for the whole month. */
export function flagWhen(flag: PayrollFlag): string {
  if ("date" in flag) return flag.date;
  if ("weekOf" in flag) return flag.weekOf;
  if ("dates" in flag) return flag.dates[0] ?? "";
  if ("from" in flag) return flag.from;
  return "";
}

/** In order: by group (minors first), then by day, then as they came. */
function inOrder<T>(
  items: readonly T[],
  flagOf: (item: T) => PayrollFlag,
): T[] {
  return items
    .map((item, index) => ({ item, index, flag: flagOf(item) }))
    .sort(
      (a, b) =>
        GROUP_ORDER[PAYROLL_FLAGS[a.flag.code]] -
          GROUP_ORDER[PAYROLL_FLAGS[b.flag.code]] ||
        flagWhen(a.flag).localeCompare(flagWhen(b.flag)) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

/** What a pay holder looks at in a month's or a day's flags: minors first, then by day. */
export function remarksOf(flags: readonly PayrollFlag[]): PayrollFlag[] {
  return inOrder(
    flags.filter((flag) => !SAID.has(flag.code) && !ABOUT.has(flag.code)),
    (flag) => flag,
  );
}

/**
 * Each flag with a key that stays its own while the list changes: what it
 * says, and how many times the same was said before it (a day can hold two
 * of the same break).
 */
export function keyedFlags(
  flags: readonly PayrollFlag[],
): { key: string; flag: PayrollFlag }[] {
  const seen = new Map<string, number>();
  return flags.map((flag) => {
    const said = JSON.stringify(flag);
    const times = seen.get(said) ?? 0;
    seen.set(said, times + 1);
    return { key: times === 0 ? said : `${said}#${times}`, flag };
  });
}

/** The flags that say how someone is paid (`FLAGS_ABOUT_PAY`). */
export function aboutPayOf(flags: readonly PayrollFlag[]): PayrollFlag[] {
  return flags.filter((flag) => ABOUT.has(flag.code));
}

/**
 * How many things a pay holder checks in a person's month: its remarks, and
 * each line of pay for a day not worked, which always says what to check.
 * The lists that show them (the month's card, a person's remarks) list both.
 */
export function toCheckOf(
  person: Pick<PersonPayroll, "flags" | "holidayPay">,
): number {
  return remarksOf(person.flags).length + person.holidayPay.length;
}

/**
 * Whether a month has anything to estimate: minutes at a rate, or pay for a
 * day not worked. Without either, the screens show no estimate (not 0.00 ₪).
 */
export function hasEstimate(
  month: Pick<PersonRates, "minutes" | "holidayPay">,
): boolean {
  return month.minutes > 0 || month.holidayPay.length > 0;
}

/**
 * One line of the month's card, and how many more of the same its person has:
 * a remark of one kind (`flag`), or their pay for days not worked
 * (`holidayPay`, the first line of it), which `toCheckOf` counts too.
 */
export type RemarkLine = { userId: string; more: number } & (
  | { flag: PayrollFlag }
  | { holidayPay: HolidayPayLine }
);

type FlagLine = { userId: string; more: number; flag: PayrollFlag };

/** A line's group: a flag's own, and the pay group for pay for days not worked. */
const lineGroup = (line: RemarkLine): number =>
  GROUP_ORDER["flag" in line ? PAYROLL_FLAGS[line.flag.code] : "pay"];

/**
 * The month's card: each person's remarks by kind, the first in words and how
 * many more of it, and one line for their pay for days not worked, minors
 * first, then in the people's order. At most `limit` lines; `rest` is how
 * many things to check the lines left out hold, so the lines and `rest` add
 * up to everyone's `toCheckOf`. Pass each person's remarks in `remarksOf`'s
 * order.
 */
export function remarkLines(
  people: readonly {
    userId: string;
    remarks: readonly PayrollFlag[];
    holidayPay?: readonly HolidayPayLine[];
  }[],
  limit: number,
): { lines: RemarkLine[]; rest: number } {
  const all: RemarkLine[] = [];
  for (const person of people) {
    const byCode = new Map<PayrollFlagCode, FlagLine>();
    for (const flag of person.remarks) {
      const known = byCode.get(flag.code);
      if (known) known.more += 1;
      else byCode.set(flag.code, { userId: person.userId, flag, more: 0 });
    }
    all.push(...byCode.values());
    const [first, ...others] = person.holidayPay ?? [];
    if (first) {
      all.push({
        userId: person.userId,
        holidayPay: first,
        more: others.length,
      });
    }
  }
  // A stable sort by group alone keeps the people's order, and each person's
  // remarks in theirs.
  const sorted = [...all].sort((a, b) => lineGroup(a) - lineGroup(b));
  const lines = sorted.slice(0, Math.max(0, limit));
  const rest = sorted
    .slice(lines.length)
    .reduce((sum, line) => sum + 1 + line.more, 0);
  return { lines, rest };
}

/** How a screen writes what a flag's words take. */
export type FlagFormat = {
  /** A day, `YYYY-MM-DD`, as "13.10". */
  date: (day: string) => string;
  /** Minutes as decimal hours, "2.50". */
  hours: (minutes: number) => string;
  /** Agorot as "35.40 ₪". */
  shekels: (agorot: number) => string;
  /** A paid holiday's name. */
  holiday: (key: HolidayKey) => string;
  /** A one-off rest day's name. */
  oneOff: (key: string) => string;
};

export type FlagValues = Record<string, string | number>;

/**
 * The values of a flag's words (`modules.time_clock.payroll.flags.<code>`):
 * days as the screen writes them, minutes as hours where the words say hours,
 * amounts in shekels, and holidays by name. A code missing here fails to
 * compile; `tooling/payroll-words.test.ts` holds the words to these names.
 */
export function flagValues(flag: PayrollFlag, f: FlagFormat): FlagValues {
  switch (flag.code) {
    case "openEntry":
    case "edited":
    case "unconfirmed":
    case "minorUnderAge":
    case "minorAfter23":
      return { date: f.date(flag.date) };
    case "longEntry":
    case "dayOver12":
    case "breakOver3h":
    case "restBetweenUnder8":
    case "hoursLawRestDay":
    case "restWeekOvertime":
    case "minorEveOver7":
    case "minorOvertime":
    case "minorRestDay":
      return { date: f.date(flag.date), hours: f.hours(flag.minutes) };
    case "shortUnpaidBreak":
    case "eveBreakUnder30":
    case "minorBreak":
      return { date: f.date(flag.date), minutes: flag.minutes };
    case "noWage":
      return { from: f.date(flag.from) };
    case "noPayrollNumber":
    case "hoursLawTrust":
    case "hoursLawUnsupervised":
      return {};
    case "weekOvertimeOver16":
    case "nightWeekOver58":
    case "minorWeekOver40":
      return { weekOf: f.date(flag.weekOf), hours: f.hours(flag.minutes) };
    case "weeklyRestUnder36":
      return { weekOf: f.date(flag.weekOf), hours: f.hours(flag.longest) };
    case "breakMissing":
      return { days: flag.days };
    case "belowMinimumWage":
      return {
        amount: f.shekels(flag.agorot),
        minimum: f.shekels(flag.minimum),
        band: flag.band,
        from: f.date(flag.from),
        to: f.date(flag.to),
      };
    case "oneOffRestDay":
      return {
        date: f.date(flag.date),
        day: f.oneOff(flag.key),
        hours: f.hours(flag.minutes),
      };
    case "holidayWorked":
      return {
        date: f.date(flag.date),
        holiday: f.holiday(flag.holiday),
        hours: f.hours(flag.minutes),
        paidAt: flag.paidAt,
      };
    case "holidayNight":
    case "restDayHolidays":
      return { date: f.date(flag.date), holiday: f.holiday(flag.holiday) };
    case "doubleShift":
      return { date: f.date(flag.date), hours: f.hours(flag.gap) };
    case "minorDayOver":
      return {
        date: f.date(flag.date),
        hours: f.hours(flag.minutes),
        // Whole hours, as the law says them: "8", "9".
        limit: String(flag.limit / 60),
      };
    case "minorNight":
      return {
        date: f.date(flag.date),
        hours: f.hours(flag.minutes),
        from: flag.from,
        to: flag.to,
      };
    default:
      return flag satisfies never;
  }
}

/** A stretch of the month at one wage, with its workdays, minutes, night shifts and unpaid breaks. */
export type RateSegment = WageSegment & {
  days: number;
  minutes: number;
  nightShifts: number;
  unpaidBreakMinutes: number;
};

/** Each wage stretch of a person's month, with what its workdays hold. */
export function segmentsOf(
  person: Pick<PersonPayroll, "byWage" | "days">,
): RateSegment[] {
  return person.byWage.map((segment) => {
    const inSpan = person.days.filter(
      (day) =>
        day.minutes > 0 && day.date >= segment.from && day.date <= segment.to,
    );
    return {
      ...segment,
      days: inSpan.length,
      minutes: inSpan.reduce((sum, day) => sum + day.minutes, 0),
      nightShifts: inSpan.filter((day) => day.night).length,
      unpaidBreakMinutes: inSpan.reduce(
        (sum, day) => sum + day.unpaidBreakMinutes,
        0,
      ),
    };
  });
}

/** A workday as the pay screens draw it: its rates, what kind of day it was, and what to check on it. */
export type RatesDay = Pick<
  PayrollDay,
  | "date"
  | "minutes"
  | "buckets"
  | "night"
  | "eve"
  | "restMinutes"
  | "holiday"
  | "oneOffRestDay"
> & {
  /** Its shifts: with more than one, the split is the whole day's. */
  shifts: number;
  remarks: PayrollFlag[];
};

/** A person's month by rate, as the pay screens draw it (payroll P7). */
export type PersonRates = {
  restDay: RestDay;
  minutes: number;
  buckets: Buckets;
  nightShifts: number;
  segments: RateSegment[];
  /** Holiday pay and pay for one-off rest days not worked. */
  holidayPay: HolidayPayLine[];
  /** Null while the business shows no amounts, or while a worked day has no wage. */
  estimateAgorot: number | null;
  /** A worked day has no wage, so there is no estimate. */
  missingWage: boolean;
  /** What to check, minors first (`remarksOf`). */
  remarks: PayrollFlag[];
  /** How they are paid, the Hours law not applying (`FLAGS_ABOUT_PAY`). */
  aboutPay: PayrollFlag[];
  /** The remarks and the lines of pay for days not worked. */
  toCheck: number;
  /**
   * Entries still open: the engine counts none of their minutes until they
   * end, while the month's hours count them up to now. The screens say so.
   */
  open: number;
  days: RatesDay[];
};

/** A person's month from the engine, as the pay screens draw it. */
export function personRates(
  person: PersonPayroll,
  restDay: RestDay,
): PersonRates {
  return {
    restDay,
    minutes: person.minutes,
    buckets: person.buckets,
    nightShifts: person.nightShifts,
    segments: segmentsOf(person),
    holidayPay: person.holidayPay,
    estimateAgorot: person.estimateAgorot,
    missingWage: person.flags.some((flag) => flag.code === "noWage"),
    remarks: remarksOf(person.flags),
    aboutPay: aboutPayOf(person.flags),
    toCheck: toCheckOf(person),
    open: person.openEntries,
    days: person.days.map((day) => ({
      date: day.date,
      minutes: day.minutes,
      buckets: day.buckets,
      night: day.night,
      eve: day.eve,
      restMinutes: day.restMinutes,
      holiday: day.holiday,
      oneOffRestDay: day.oneOffRestDay,
      shifts: day.entryIds.length,
      remarks: remarksOf(day.flags),
    })),
  };
}

/**
 * The month's estimate across people: the known ones added, and how many are
 * left out for want of a wage (`missing`: the screens say so beside the sum).
 */
export function monthEstimate(
  people: readonly { estimateAgorot: number | null; missing: boolean }[],
): { agorot: number; missing: number } {
  return {
    agorot: people.reduce((sum, one) => sum + (one.estimateAgorot ?? 0), 0),
    missing: people.filter((one) => one.missing).length,
  };
}

/** How each week of a business whose week isn't set was worked out, for one person. */
export function weeksWorkedOut(
  notes: readonly PayrollNote[],
  userId: string,
): { weekOf: string; used: "five" | "six" | "smaller" }[] {
  return notes.flatMap((note) =>
    note.code === "workWeekUnset" && note.userId === userId
      ? [{ weekOf: note.weekOf, used: note.used }]
      : [],
  );
}

/**
 * The adults' limits a worker sees about themselves, in neutral words (plan
 * §10.2): days and weeks past the hours the law allows, and rest too short.
 */
export const OWN_LIMITS = [
  "dayOver12",
  "weekOvertimeOver16",
  "nightWeekOver58",
  "restBetweenUnder8",
  "weeklyRestUnder36",
] as const satisfies readonly PayrollFlagCode[];
export type OwnLimitCode = (typeof OWN_LIMITS)[number];
export type OwnLimit = Extract<PayrollFlag, { code: OwnLimitCode }>;

const OWN: ReadonlySet<PayrollFlagCode> = new Set(OWN_LIMITS);

const isOwnLimit = (flag: PayrollFlag): flag is OwnLimit => OWN.has(flag.code);

/** A worker's own month, as their clock shows it: never anyone else's, and none of the flags a pay holder reads. */
export type OwnMonth = {
  minutes: number;
  buckets: Buckets;
  /** The wages the month was worked out by, oldest first. */
  wages: { agorot: number; from: string; to: string }[];
  holidayPay: HolidayPayLine[];
  estimateAgorot: number | null;
  /** A worked day has no wage, so there is no estimate. */
  missingWage: boolean;
  /** Their adult limits, in the month's order. */
  limits: OwnLimit[];
  /** A rule for minors was crossed: the clock says to talk to the business, and no more. */
  minor: boolean;
  /**
   * Their entries still open: the estimate counts a shift once it ends, while
   * the clock's hours count it up to now. The card says so.
   */
  open: number;
};

export function ownMonthOf(person: PersonPayroll): OwnMonth {
  return {
    minutes: person.minutes,
    buckets: person.buckets,
    wages: person.byWage.flatMap((segment) =>
      segment.agorot === null
        ? []
        : [{ agorot: segment.agorot, from: segment.from, to: segment.to }],
    ),
    holidayPay: person.holidayPay,
    estimateAgorot: person.estimateAgorot,
    missingWage: person.flags.some((flag) => flag.code === "noWage"),
    limits: inOrder(person.flags.filter(isOwnLimit), (flag) => flag),
    minor: person.flags.some((flag) => PAYROLL_FLAGS[flag.code] === "minors"),
    open: person.openEntries,
  };
}
