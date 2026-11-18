import { describe, expect, it } from "vitest";
import {
  adultDayFlags,
  adultWeekFlags,
  breakMissingFlag,
  type DayFacts,
  flagDate,
  LIMITS,
  type MinorDayFacts,
  minorDayFlags,
  minorWeekFlags,
  PAYROLL_FLAG_CODES,
  PAYROLL_FLAGS,
  PAYROLL_NOTE_CODES,
  type WeekFacts,
} from "./payroll-flags";

const DAY: DayFacts = {
  date: "2026-10-13",
  minutes: 480,
  overtimeMinutes: 0,
  restMinutes: 0,
  eve: false,
  atWorkMinutes: 525,
  breakMinutes: 45,
  longestBreak: 30,
  longBreaks: [],
};

const WEEK: WeekFacts = {
  weekOf: "2026-10-11",
  minutes: 2400,
  overtimeMinutes: 0,
  night: false,
  longestRest: Number.POSITIVE_INFINITY,
};

const MINOR: MinorDayFacts = {
  ...DAY,
  band: "17",
  underAge: false,
  fiveDayWeek: false,
  night: { from: "22:00", to: "06:00", minutes: 0 },
  after23: false,
};

const codesOf = (flags: { code: string }[]) => flags.map((flag) => flag.code);

describe("an adult's day", () => {
  it("may be 12 hours, not a minute more", () => {
    expect(adultDayFlags({ ...DAY, minutes: LIMITS.day }).flags).toEqual([]);
    expect(adultDayFlags({ ...DAY, minutes: LIMITS.day + 1 }).flags).toEqual([
      { code: "dayOver12", date: DAY.date, minutes: 721 },
    ]);
  });

  it("needs 45 minutes of break, 30 in a row, from 6 hours", () => {
    expect(adultDayFlags(DAY).breakMissing).toBe(false);
    expect(
      adultDayFlags({ ...DAY, breakMinutes: 45, longestBreak: 15 })
        .breakMissing,
    ).toBe(true);
    expect(
      adultDayFlags({ ...DAY, breakMinutes: 40, longestBreak: 40 })
        .breakMissing,
    ).toBe(true);
    expect(
      adultDayFlags({
        ...DAY,
        atWorkMinutes: 359,
        breakMinutes: 0,
        longestBreak: 0,
      }).breakMissing,
    ).toBe(false);
  });

  it("needs 30 minutes on an eve, said on the day", () => {
    const eve = { ...DAY, eve: true, breakMinutes: 30, longestBreak: 30 };
    expect(adultDayFlags(eve)).toEqual({ flags: [], breakMissing: false });
    expect(
      adultDayFlags({ ...eve, breakMinutes: 20, longestBreak: 20 }),
    ).toEqual({
      flags: [{ code: "eveBreakUnder30", date: DAY.date, minutes: 20 }],
      breakMissing: false,
    });
  });

  it("says each break over 3 hours", () => {
    expect(adultDayFlags({ ...DAY, longBreaks: [200, 190] }).flags).toEqual([
      { code: "breakOver3h", date: DAY.date, minutes: 200 },
      { code: "breakOver3h", date: DAY.date, minutes: 190 },
    ]);
  });

  it("says the month's days without a break in one line", () => {
    expect(breakMissingFlag([])).toEqual([]);
    expect(breakMissingFlag(["2026-10-04", "2026-10-05"])).toEqual([
      { code: "breakMissing", days: 2, dates: ["2026-10-04", "2026-10-05"] },
    ]);
  });
});

describe("an adult's week", () => {
  it("may have 16 hours of overtime", () => {
    expect(adultWeekFlags({ ...WEEK, overtimeMinutes: 960 })).toEqual([]);
    expect(adultWeekFlags({ ...WEEK, overtimeMinutes: 961 })).toEqual([
      { code: "weekOvertimeOver16", weekOf: WEEK.weekOf, minutes: 961 },
    ]);
  });

  it("may be 58 hours with a night shift", () => {
    expect(adultWeekFlags({ ...WEEK, minutes: 3481 })).toEqual([]);
    expect(adultWeekFlags({ ...WEEK, minutes: 3481, night: true })).toEqual([
      { code: "nightWeekOver58", weekOf: WEEK.weekOf, minutes: 3481 },
    ]);
  });

  it("needs 36 hours of rest in a row", () => {
    expect(adultWeekFlags({ ...WEEK, longestRest: 2160 })).toEqual([]);
    expect(adultWeekFlags({ ...WEEK, longestRest: 2159 })).toEqual([
      { code: "weeklyRestUnder36", weekOf: WEEK.weekOf, longest: 2159 },
    ]);
  });
});

describe("a minor's day", () => {
  it("is 8 hours, 9 from 16 in a five-day week", () => {
    expect(minorDayFlags({ ...MINOR, minutes: 480 })).toEqual([]);
    expect(codesOf(minorDayFlags({ ...MINOR, minutes: 481 }))).toEqual([
      "minorDayOver",
    ]);
    expect(
      minorDayFlags({ ...MINOR, minutes: 540, fiveDayWeek: true }),
    ).toEqual([]);
    expect(
      minorDayFlags({ ...MINOR, minutes: 541, fiveDayWeek: true }),
    ).toEqual([
      { code: "minorDayOver", date: DAY.date, minutes: 541, limit: 540 },
    ]);
    expect(
      minorDayFlags({
        ...MINOR,
        band: "under16",
        minutes: 500,
        fiveDayWeek: true,
      }),
    ).toEqual([
      { code: "minorDayOver", date: DAY.date, minutes: 500, limit: 480 },
    ]);
  });

  it("is 7 hours on an eve", () => {
    expect(
      minorDayFlags({
        ...MINOR,
        eve: true,
        minutes: 421,
        breakMinutes: 30,
        longestBreak: 30,
      }),
    ).toEqual([{ code: "minorEveOver7", date: DAY.date, minutes: 421 }]);
  });

  it("says overtime, rest, night, the break, after 23:00 and under 15", () => {
    expect(
      codesOf(
        minorDayFlags({
          ...MINOR,
          underAge: true,
          overtimeMinutes: 30,
          restMinutes: 60,
          night: { from: "20:00", to: "08:00", minutes: 90 },
          breakMinutes: 0,
          longestBreak: 0,
          after23: true,
        }),
      ),
    ).toEqual([
      "minorUnderAge",
      "minorOvertime",
      "minorRestDay",
      "minorNight",
      "minorBreak",
      "minorAfter23",
    ]);
  });

  it("has a week of 40 hours", () => {
    expect(minorWeekFlags({ ...WEEK, minutes: 2400 })).toEqual([]);
    expect(minorWeekFlags({ ...WEEK, minutes: 2401 })).toEqual([
      { code: "minorWeekOver40", weekOf: WEEK.weekOf, minutes: 2401 },
    ]);
  });
});

describe("the codes", () => {
  it("are all listed once, each in a group", () => {
    expect(PAYROLL_FLAG_CODES).toHaveLength(34);
    expect(new Set(PAYROLL_FLAG_CODES).size).toBe(PAYROLL_FLAG_CODES.length);
    expect(Object.values(PAYROLL_FLAGS).every(Boolean)).toBe(true);
    expect(PAYROLL_NOTE_CODES).toEqual([
      "minimumWageTableStale",
      "paidAbsencesMissing",
      "roundingIgnored",
      "workWeekUnset",
    ]);
  });

  it("know which day a flag is about", () => {
    expect(
      flagDate({ code: "dayOver12", date: "2026-10-04", minutes: 810 }),
    ).toBe("2026-10-04");
    expect(flagDate({ code: "noPayrollNumber" })).toBeNull();
  });
});
