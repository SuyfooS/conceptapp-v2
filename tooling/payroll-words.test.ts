import { HOLIDAY_PAY_CHECKS } from "@domain/holiday-pay";
import { type FlagFormat, flagValues, OWN_LIMITS } from "@domain/pay-rates";
import { BUCKETS } from "@domain/payroll";
import { ONE_OFF_REST_DAYS, PAID_HOLIDAYS } from "@domain/payroll-calendar";
import {
  PAYROLL_FLAG_CODES,
  PAYROLL_NOTE_CODES,
  type PayrollFlag,
  type PayrollFlagCode,
} from "@domain/payroll-flags";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

type Tree = { [key: string]: string | Tree };

const words = (messages: typeof he, group: string): Tree =>
  ((messages.modules.time_clock as unknown as Tree)[group] ?? {}) as Tree;

/** A group of words under `app`, by its dotted path. */
const appWords = (messages: typeof he, path: string): Tree =>
  path
    .split(".")
    .reduce<Tree>(
      (tree, key) => (tree[key] ?? {}) as Tree,
      messages.app as unknown as Tree,
    );

/** The ICU arguments a message reads, `{name}` and `{name, select, …}` alike. */
const argumentsOf = (message: string): string[] => [
  ...new Set(
    [...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1] ?? ""),
  ),
];

const DAY = "2026-10-13";

/** One flag of each code, with every value it carries: a code missing here fails to compile. */
const SAMPLES: { [C in PayrollFlagCode]: Extract<PayrollFlag, { code: C }> } = {
  openEntry: { code: "openEntry", entryId: "e", date: DAY },
  longEntry: { code: "longEntry", entryId: "e", date: DAY, minutes: 900 },
  edited: { code: "edited", entryId: "e", date: DAY, by: null, note: null },
  unconfirmed: {
    code: "unconfirmed",
    entryId: "e",
    date: DAY,
    ownerOnly: false,
  },
  shortUnpaidBreak: { code: "shortUnpaidBreak", date: DAY, minutes: 20 },
  noWage: { code: "noWage", from: DAY },
  noPayrollNumber: { code: "noPayrollNumber" },
  dayOver12: { code: "dayOver12", date: DAY, minutes: 800 },
  weekOvertimeOver16: {
    code: "weekOvertimeOver16",
    weekOf: DAY,
    minutes: 1000,
  },
  nightWeekOver58: { code: "nightWeekOver58", weekOf: DAY, minutes: 3600 },
  restBetweenUnder8: { code: "restBetweenUnder8", date: DAY, minutes: 400 },
  weeklyRestUnder36: { code: "weeklyRestUnder36", weekOf: DAY, longest: 2000 },
  breakMissing: { code: "breakMissing", days: 3, dates: [DAY] },
  eveBreakUnder30: { code: "eveBreakUnder30", date: DAY, minutes: 10 },
  breakOver3h: { code: "breakOver3h", date: DAY, minutes: 200 },
  belowMinimumWage: {
    code: "belowMinimumWage",
    from: DAY,
    to: DAY,
    agorot: 3000,
    minimum: 3540,
    band: "17",
  },
  oneOffRestDay: {
    code: "oneOffRestDay",
    date: DAY,
    key: "knesset_2026",
    minutes: 60,
  },
  holidayWorked: {
    code: "holidayWorked",
    date: DAY,
    holiday: "yom_kippur",
    minutes: 60,
    paidAt: "rest",
  },
  holidayNight: {
    code: "holidayNight",
    date: DAY,
    holiday: "yom_kippur",
    entryId: "e",
  },
  restDayHolidays: {
    code: "restDayHolidays",
    date: DAY,
    holiday: "yom_kippur",
  },
  doubleShift: { code: "doubleShift", date: DAY, gap: 500 },
  hoursLawTrust: { code: "hoursLawTrust" },
  hoursLawUnsupervised: { code: "hoursLawUnsupervised" },
  hoursLawRestDay: { code: "hoursLawRestDay", date: DAY, minutes: 60 },
  restWeekOvertime: { code: "restWeekOvertime", date: DAY, minutes: 60 },
  minorUnderAge: { code: "minorUnderAge", date: DAY },
  minorDayOver: { code: "minorDayOver", date: DAY, minutes: 600, limit: 480 },
  minorEveOver7: { code: "minorEveOver7", date: DAY, minutes: 500 },
  minorWeekOver40: { code: "minorWeekOver40", weekOf: DAY, minutes: 2500 },
  minorOvertime: { code: "minorOvertime", date: DAY, minutes: 30 },
  minorRestDay: { code: "minorRestDay", date: DAY, minutes: 30 },
  minorNight: {
    code: "minorNight",
    date: DAY,
    from: "20:00",
    to: "08:00",
    minutes: 30,
  },
  minorBreak: { code: "minorBreak", date: DAY, minutes: 20 },
  minorAfter23: { code: "minorAfter23", date: DAY },
};

const format: FlagFormat = {
  date: (date) => date,
  hours: (minutes) => String(minutes / 60),
  shekels: (agorot) => String(agorot / 100),
  holiday: (key) => key,
  oneOff: (key) => key,
};

// The payroll engine names its flags, notes, holidays and one-off rest days
// by code (@domain/payroll-flags, @domain/payroll-calendar), so nothing else
// makes sure each has its words. messages.test.ts keeps the English in step.
describe("payroll's words", () => {
  for (const [language, messages] of [
    ["he", he],
    ["en", en],
  ] as const) {
    it(`name every flag and note in ${language}`, () => {
      const payroll = words(messages, "payroll");
      const flags = payroll.flags as Tree;
      const notes = payroll.notes as Tree;
      for (const code of PAYROLL_FLAG_CODES) {
        expect(typeof flags[code], code).toBe("string");
      }
      for (const code of PAYROLL_NOTE_CODES) {
        expect(typeof notes[code], code).toBe("string");
      }
      // And none for a code the engine doesn't have.
      expect(Object.keys(flags).sort()).toEqual([...PAYROLL_FLAG_CODES].sort());
      expect(Object.keys(notes).sort()).toEqual([...PAYROLL_NOTE_CODES].sort());
    });

    it(`give every flag's words the values the screens pass, in ${language}`, () => {
      const flags = words(messages, "payroll").flags as Tree;
      for (const code of PAYROLL_FLAG_CODES) {
        const values = Object.keys(flagValues(SAMPLES[code], format));
        for (const name of argumentsOf(flags[code] as string)) {
          expect(values, `${code}: {${name}}`).toContain(name);
        }
      }
    });

    it(`name every paid holiday and one-off rest day in ${language}`, () => {
      expect(Object.keys(words(messages, "holidays")).sort()).toEqual(
        [...PAID_HOLIDAYS].sort(),
      );
      expect(Object.keys(words(messages, "oneOffRestDays")).sort()).toEqual(
        ONE_OFF_REST_DAYS.map((day) => day.key).sort(),
      );
    });

    it(`name every rate, check and limit the pay screens draw, in ${language}`, () => {
      // Each rate as a line and as a column (payroll P7).
      expect(Object.keys(appWords(messages, "pay.rates")).sort()).toEqual(
        [...BUCKETS].sort(),
      );
      expect(Object.keys(appWords(messages, "pay.rateColumns")).sort()).toEqual(
        [...BUCKETS].sort(),
      );
      // What a line of pay for a day not worked says to check.
      expect(
        Object.keys(appWords(messages, "pay.holidayPay.checks")).sort(),
      ).toEqual([...HOLIDAY_PAY_CHECKS].sort());
      // The limits a worker reads about themselves, in their own words, with
      // the values the flag carries.
      const limits = appWords(messages, "clock.ownPay.limits");
      expect(Object.keys(limits).sort()).toEqual([...OWN_LIMITS].sort());
      for (const code of OWN_LIMITS) {
        const values = Object.keys(flagValues(SAMPLES[code], format));
        for (const name of argumentsOf(limits[code] as string)) {
          expect(values, `${code}: {${name}}`).toContain(name);
        }
      }
    });
  }

  it("have no exclamation marks in Hebrew", () => {
    const all = JSON.stringify([
      words(he, "payroll"),
      words(he, "holidays"),
      words(he, "oneOffRestDays"),
      appWords(he, "pay"),
      appWords(he, "clock.ownPay"),
    ]);
    expect(all).not.toContain("!");
  });
});
