import { HOLIDAY_PAY_CHECKS } from "@domain/holiday-pay";
import type { PaySource } from "@domain/pay-month";
import { type FlagFormat, flagValues, OWN_LIMITS } from "@domain/pay-rates";
import { BUCKETS } from "@domain/payroll";
import { ONE_OFF_REST_DAYS, PAID_HOLIDAYS } from "@domain/payroll-calendar";
import { HOURS_LAW } from "@domain/payroll-details";
import {
  ABOUT_COLUMNS,
  ABOUT_LINES,
  CHECK_COLUMNS,
  DAILY_COLUMNS,
  DIFF_COLUMNS,
  EXPORT_SHEETS,
  SUMMARY_COLUMNS,
} from "@domain/payroll-export";
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

/** Every way a shift is recorded, for the file's source column: one missing here fails to compile. */
const PAY_SOURCES = {
  added: true,
  self: true,
  none: true,
  manager: true,
  punch: true,
  off: true,
  owner: true,
  typed: true,
  scan: true,
} as const satisfies Record<PaySource, true>;

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

    it(`name every sheet, column, rule and source of the file for payroll, in ${language}`, () => {
      // The file (payroll P8): each flag's rule, each sheet and column, how
      // a shift was recorded, the Hours law, and the lines about the file.
      const file = appWords(messages, "pay.file");
      const keys = (tree: unknown) => Object.keys(tree as Tree).sort();
      expect(keys(file.rules)).toEqual([...PAYROLL_FLAG_CODES].sort());
      expect(keys(file.sheets)).toEqual([...EXPORT_SHEETS].sort());
      const columns = file.columns as Tree;
      expect(keys(columns.summary)).toEqual(
        SUMMARY_COLUMNS.filter((key) => key !== "rates").sort(),
      );
      expect(keys(columns.daily)).toEqual(
        DAILY_COLUMNS.filter((key) => key !== "rates").sort(),
      );
      expect(keys(columns.check)).toEqual([...CHECK_COLUMNS].sort());
      // The sheet of differences of a month closed before (payroll P9).
      expect(keys(columns.differences)).toEqual(
        DIFF_COLUMNS.filter((key) => key !== "rates").sort(),
      );
      expect(keys(columns.about)).toEqual([...ABOUT_COLUMNS].sort());
      expect(keys((file.about as Tree).lines)).toEqual([...ABOUT_LINES].sort());
      expect(keys(file.source)).toEqual(Object.keys(PAY_SOURCES).sort());
      expect(keys(file.hoursLaw)).toEqual([...HOURS_LAW].sort());
      expect(keys(file.weekdays)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    });

    it(`give the file's own sentences only the values its words pass, in ${language}`, () => {
      // What app/(app)/clock/pay/export/export-words.ts passes each: a day
      // not worked, what to check about it and its rule, the team's view,
      // and the file's name. (file.test.ts there fills them for real.)
      const file = appWords(messages, "pay.file");
      const about = file.about as Tree;
      const passed: [string, string | Tree | undefined, string[]][] = [
        [
          "dayNotWorked",
          file.dayNotWorked,
          ["kind", "name", "date", "average"],
        ],
        [
          "dayNotWorkedCheck",
          file.dayNotWorkedCheck,
          ["kind", "name", "date", "average"],
        ],
        ["dayNotWorkedRule", file.dayNotWorkedRule, ["kind"]],
        ["about.madeByTeam", about.madeByTeam, ["name"]],
        ["about.madeByTeamNoName", about.madeByTeamNoName, []],
        ["name", file.name, ["business", "month"]],
        // The month before, closed for payroll (payroll P9).
        ["differenceRate", file.differenceRate, ["rate"]],
        ["about.closed", about.closed, ["month", "date"]],
        ["about.closedUnchanged", about.closedUnchanged, ["month", "date"]],
        ["about.closedEngine", about.closedEngine, []],
      ];
      for (const [key, message, values] of passed) {
        expect(typeof message, key).toBe("string");
        for (const name of argumentsOf(message as string)) {
          expect(values, `${key}: {${name}}`).toContain(name);
        }
      }
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
