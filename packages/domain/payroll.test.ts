import { describe, expect, it } from "vitest";
import { instantIn } from "./availability";
import { holidayPayLines } from "./holiday-pay";
import {
  addBuckets,
  apportion,
  BUCKETS,
  type Buckets,
  bucketAgorot,
  hoursText,
  NO_BUCKETS,
  ownEstimateShown,
  type PayrollDay,
  type PayrollHistory,
  type PayrollInput,
  type PayrollPerson,
  type PayrollSettings,
  type PersonPayroll,
  payrollMonth,
  payrollPeopleOf,
  payrollPersonOf,
  payrollRange,
  payrollReadRange,
  personPayroll,
  withoutAmounts,
} from "./payroll";
import { payrollCalendar } from "./payroll-calendar";
import { DEFAULT_DETAILS } from "./payroll-details";
import type { PayrollFlag } from "./payroll-flags";
import { PAYROLL_READINGS } from "./payroll-readings";
import { ISRAELI_CITIES } from "./shabbat";
import type { TimeEntry } from "./time-clock";

/*
 * The test vectors of payroll plan §13, in Tel Aviv (Asia/Jerusalem), at
 * 38.00 ₪ an hour and a six-day week resting on Saturday unless said. Each
 * case's input and expected minutes are the plan's; `payplan/ref.mjs` (a
 * scratch script beside the plan) worked out the Tel Aviv times they use:
 * candle lighting 20 minutes before sunset, havdalah at 8.5°.
 */

const TZ = "Asia/Jerusalem";
const TEL_AVIV = ISRAELI_CITIES.telAviv;
const ID = "11111111-1111-4111-a111-111111111111";

const SIX: PayrollSettings = {
  workWeek: "six",
  shortDay: 4,
  restStart: "candleLighting",
  restStartTime: "14:00",
  roundToMinutes: 0,
};

const at = (local: string): string => {
  const [date = "", time = ""] = local.split(" ");
  return instantIn(date, time, TZ).toISOString();
};

let next = 0;
type EntryOptions = {
  userId?: string;
  breaks?: { from: string; to: string; unpaid: boolean }[];
};

/** An entry from one local time to another (`YYYY-MM-DD HH:MM`), or open. */
function entry(
  from: string,
  to: string | null,
  { userId = ID, breaks = [] }: EntryOptions = {},
): TimeEntry {
  next += 1;
  const id = `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
  return {
    id,
    userId,
    clockIn: at(from),
    clockOut: to === null ? null : at(to),
    source: "punch",
    breaks: breaks.map((pause, index) => ({
      id: `${id.slice(0, -2)}${String(index).padStart(2, "0")}`,
      startedAt: at(pause.from),
      endedAt: at(pause.to),
      unpaid: pause.unpaid,
    })),
    inProof: null,
    outProof: null,
    confirmedAt: null,
    note: null,
    editedBy: null,
    editedAt: null,
    createdAt: null,
  };
}

/** The same hours on several days. */
const daily = (dates: string[], from: string, to: string) =>
  dates.map((date) => entry(`${date} ${from}`, `${date} ${to}`));

function person(overrides: Partial<PayrollPerson> = {}): PayrollPerson {
  return {
    userId: ID,
    payrollNumber: "101",
    restDay: 6,
    hoursLaw: "applies",
    youthUntil: null,
    compulsoryEducation: true,
    periods: [{ startedOn: "2026-01-01", endedOn: null }],
    wages: [
      { agorot: 3800, from: "2026-01-01", setAt: "2026-01-01T08:00:00Z" },
    ],
    ...overrides,
  };
}

const calendars = new Map<string, ReturnType<typeof payrollCalendar>>();
function calendarFor(month: string, settings: PayrollSettings) {
  const key = `${month} ${settings.restStart} ${settings.restStartTime}`;
  let found = calendars.get(key);
  if (!found) {
    const range = payrollRange(month);
    found = payrollCalendar(TEL_AVIV, range.from, range.to, settings);
    calendars.set(key, found);
  }
  return found;
}

type Run = {
  month: string;
  entries: TimeEntry[];
  person?: Partial<PayrollPerson>;
  settings?: Partial<PayrollSettings>;
  history?: PayrollHistory;
  now?: string;
} & Pick<PayrollInput, "readings" | "minimumWage">;

function input(run: Run): PayrollInput {
  const settings = { ...SIX, ...run.settings };
  return {
    month: run.month,
    timeZone: TZ,
    now: new Date(run.now ?? "2027-12-31T00:00:00Z"),
    entries: run.entries,
    people: [person(run.person)],
    settings,
    calendar: calendarFor(run.month, settings),
    history: run.history ? new Map([[ID, run.history]]) : undefined,
    readings: run.readings,
    minimumWage: run.minimumWage,
  };
}

function month(run: Run): PersonPayroll {
  const result = payrollMonth(input(run)).people[0];
  if (!result) throw new Error("no person");
  return result;
}

function day(result: PersonPayroll, date: string): PayrollDay {
  const found = result.days.find((one) => one.date === date);
  if (!found) throw new Error(`no day ${date}`);
  return found;
}

/** A day's buckets without the empty ones. */
const minutes = (buckets: Buckets): Partial<Buckets> =>
  Object.fromEntries(
    BUCKETS.filter((bucket) => buckets[bucket] !== 0).map((bucket) => [
      bucket,
      buckets[bucket],
    ]),
  );

const codes = (flags: readonly PayrollFlag[]) => flags.map((flag) => flag.code);

/** Minutes × percent, as plan §9.4 compares the ways of an unset week. */
const weight = (result: PersonPayroll) =>
  result.days.reduce(
    (sum, one) =>
      sum +
      one.buckets.regular * 100 +
      one.buckets.ot125 * 125 +
      one.buckets.ot150 * 150 +
      one.buckets.rest150 * 150 +
      one.buckets.rest175 * 175 +
      one.buckets.rest200 * 200,
    0,
  );

const C6_WEEK = () => [
  ...daily(
    ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"],
    "08:00",
    "16:00",
  ),
  entry("2026-10-16 08:00", "2026-10-16 15:00"),
];

/** C18's person: from 1.5.2026 at 40.00, 27,000 minutes over 60 days, Mondays in 10 of 13 weeks. */
const C18_PERSON: Partial<PayrollPerson> = {
  periods: [{ startedOn: "2026-05-01", endedOn: null }],
  wages: [{ agorot: 4000, from: "2026-05-01", setAt: "2026-05-01T08:00:00Z" }],
};
const history = (
  weekdays: Partial<PayrollHistory["weekdays"]>,
): PayrollHistory => ({
  minutes: 27_000,
  days: 60,
  weeks: 13,
  weekdays: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, ...weekdays },
});

describe("payroll plan §13", () => {
  it("C1: a 9-hour Sunday in a six-day week", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-04 09:00", "2026-10-04 18:00")],
    });
    const sunday = day(result, "2026-10-04");
    expect(sunday.norm).toBe(480);
    expect(minutes(sunday.buckets)).toEqual({ regular: 480, ot125: 60 });
  });

  it("C2: an 11-hour Sunday", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-04 08:00", "2026-10-04 19:00")],
    });
    expect(minutes(day(result, "2026-10-04").buckets)).toEqual({
      regular: 480,
      ot125: 120,
      ot150: 60,
    });
  });

  it("C3: Friday is an eve of 7 hours", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-09 08:00", "2026-10-09 15:30")],
    });
    const friday = day(result, "2026-10-09");
    expect(friday.norm).toBe(420);
    expect(friday.eve).toBe(true);
    expect(minutes(friday.buckets)).toEqual({ regular: 420, ot125: 30 });
  });

  it("C4: a five-day week with Thursday short", () => {
    const result = month({
      month: "2026-10",
      settings: { workWeek: "five", shortDay: 4 },
      entries: [
        entry("2026-10-05 08:00", "2026-10-05 17:00"),
        entry("2026-10-08 08:00", "2026-10-08 17:00"),
      ],
    });
    expect(day(result, "2026-10-05").norm).toBe(516);
    expect(minutes(day(result, "2026-10-05").buckets)).toEqual({
      regular: 516,
      ot125: 24,
    });
    expect(day(result, "2026-10-08").norm).toBe(456);
    expect(minutes(day(result, "2026-10-08").buckets)).toEqual({
      regular: 456,
      ot125: 84,
    });
  });

  it("C4u: an unset week takes the smaller norm, which pays most here", () => {
    const entries = () => [
      entry("2026-10-08 08:00", "2026-10-08 16:00"),
      entry("2026-10-05 08:00", "2026-10-05 17:00"),
    ];
    const run = (workWeek: PayrollSettings["workWeek"]) =>
      month({ month: "2026-10", settings: { workWeek }, entries: entries() });
    expect(weight(run("five"))).toBe(103_200);
    expect(weight(run("six"))).toBe(103_500);
    const unset = run("unset");
    expect(weight(unset)).toBe(104_100);
    expect(day(unset, "2026-10-08").norm).toBe(456);
    expect(minutes(day(unset, "2026-10-08").buckets)).toEqual({
      regular: 456,
      ot125: 24,
    });
    expect(day(unset, "2026-10-05").norm).toBe(480);
    expect(minutes(day(unset, "2026-10-05").buckets)).toEqual({
      regular: 480,
      ot125: 60,
    });
    const notes = payrollMonth(
      input({
        month: "2026-10",
        settings: { workWeek: "unset" },
        entries: entries(),
      }),
    ).notes;
    expect(notes).toContainEqual({
      code: "workWeekUnset",
      userId: ID,
      weekOf: "2026-10-04",
      used: "smaller",
    });
  });

  it("C4f: an unset full five-day week and a Friday takes five", () => {
    const entries = () => [
      ...daily(
        ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"],
        "08:00",
        "16:36",
      ),
      entry("2026-10-15 08:00", "2026-10-15 15:36"),
      entry("2026-10-16 08:00", "2026-10-16 12:00"),
    ];
    const six = month({
      month: "2026-10",
      settings: { workWeek: "six" },
      entries: entries(),
    });
    for (const date of [
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]) {
      expect(minutes(day(six, date).buckets)).toEqual({
        regular: 480,
        ot125: 36,
      });
    }
    expect(minutes(day(six, "2026-10-16").buckets)).toEqual({
      regular: 144,
      ot125: 96,
    });
    expect(weight(six)).toBe(282_000);

    const unset = payrollMonth(
      input({
        month: "2026-10",
        settings: { workWeek: "unset" },
        entries: entries(),
      }),
    );
    const chosen = unset.people[0];
    if (!chosen) throw new Error("no person");
    expect(weight(chosen)).toBe(285_000);
    for (const date of [
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
    ]) {
      expect(minutes(day(chosen, date).buckets)).toEqual({ regular: 516 });
    }
    expect(minutes(day(chosen, "2026-10-15").buckets)).toEqual({
      regular: 456,
    });
    expect(minutes(day(chosen, "2026-10-16").buckets)).toEqual({
      ot125: 120,
      ot150: 120,
    });
    expect(unset.notes).toContainEqual({
      code: "workWeekUnset",
      userId: ID,
      weekOf: "2026-10-11",
      used: "five",
    });
  });

  it("C5: a night shift is one workday with a 7-hour norm", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-05 22:00", "2026-10-06 06:00")],
    });
    const monday = day(result, "2026-10-05");
    expect(monday.night).toBe(true);
    expect(monday.norm).toBe(420);
    expect(minutes(monday.buckets)).toEqual({ regular: 420, ot125: 60 });
    expect(result.days.map((one) => one.date)).toEqual(["2026-10-05"]);
    expect(result.nightShifts).toBe(1);
  });

  it("C6: 47 hours with no day over its norm", () => {
    const result = month({ month: "2026-10", entries: C6_WEEK() });
    for (const date of [
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]) {
      expect(minutes(day(result, date).buckets)).toEqual({ regular: 480 });
    }
    expect(minutes(day(result, "2026-10-16").buckets)).toEqual({
      regular: 120,
      ot125: 120,
      ot150: 180,
    });
    expect(result.buckets.regular).toBe(2520);
  });

  it("C7: a Friday across candle lighting, 498.12 ₪", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-16 12:00", "2026-10-16 22:00")],
    });
    const friday = day(result, "2026-10-16");
    expect(friday.norm).toBe(420);
    expect(minutes(friday.buckets)).toEqual({
      regular: 347,
      rest150: 73,
      rest175: 120,
      rest200: 60,
    });
    expect(bucketAgorot(347, 3800, "regular")).toBe(21_977);
    expect(bucketAgorot(73, 3800, "rest150")).toBe(6_935);
    expect(bucketAgorot(120, 3800, "rest175")).toBe(13_300);
    expect(bucketAgorot(60, 3800, "rest200")).toBe(7_600);
    expect(result.byWage).toEqual([
      {
        agorot: 3800,
        from: "2026-10-01",
        to: "2026-10-31",
        buckets: {
          ...NO_BUCKETS,
          regular: 347,
          rest150: 73,
          rest175: 120,
          rest200: 60,
        },
        amountAgorot: 49_812,
      },
    ]);
    expect(result.estimateAgorot).toBe(49_812);
  });

  it("C7n: across midnight into Shabbat is one Friday", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-16 16:00", "2026-10-17 02:00")],
    });
    expect(result.days.map((one) => one.date)).toEqual(["2026-10-16"]);
    const friday = day(result, "2026-10-16");
    expect(friday.eve).toBe(true);
    expect(friday.night).toBe(true);
    expect(friday.norm).toBe(420);
    expect(minutes(friday.buckets)).toEqual({
      regular: 107,
      rest150: 313,
      rest175: 120,
      rest200: 60,
    });
  });

  it("C8: Saturday night inside the 36 hours from candle lighting", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-17 20:00", "2026-10-18 04:00")],
    });
    const saturday = day(result, "2026-10-17");
    expect(saturday.night).toBe(true);
    expect(saturday.norm).toBe(420);
    expect(minutes(saturday.buckets)).toEqual({ rest150: 420, rest175: 60 });
  });

  it("C8f: the same with the rest fixed from 14:00 on Friday", () => {
    const result = month({
      month: "2026-10",
      settings: { restStart: "fixed", restStartTime: "14:00" },
      entries: [entry("2026-10-17 20:00", "2026-10-18 04:00")],
    });
    expect(minutes(day(result, "2026-10-17").buckets)).toEqual({
      rest150: 360,
      regular: 60,
      ot125: 60,
    });
  });

  it("C9: a week across two months, reported in each", () => {
    const entries = () => [
      ...daily(
        ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
        "08:00",
        "17:00",
      ),
      entry("2026-10-02 08:00", "2026-10-02 15:00"),
    ];
    const october = month({ month: "2026-10", entries: entries() });
    expect(october.days.map((one) => one.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(minutes(day(october, "2026-10-01").buckets)).toEqual({
      regular: 480,
      ot125: 60,
    });
    expect(minutes(day(october, "2026-10-02").buckets)).toEqual({
      regular: 120,
      ot125: 120,
      ot150: 180,
    });
    const september = month({ month: "2026-09", entries: entries() });
    expect(september.days.map((one) => one.date)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]);
    for (const one of september.days) {
      expect(minutes(one.buckets)).toEqual({ regular: 480, ot125: 60 });
    }
  });

  it("C10: the clocks go back, 540 minutes from 22:00 to 06:00", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-24 22:00", "2026-10-25 06:00")],
    });
    const saturday = day(result, "2026-10-24");
    expect(saturday.minutes).toBe(540);
    expect(saturday.night).toBe(true);
    expect(saturday.norm).toBe(420);
    expect(minutes(saturday.buckets)).toEqual({
      rest150: 420,
      rest175: 39,
      ot125: 81,
    });
  });

  it("C10s: the clocks go forward, 420 night minutes on instants", () => {
    const result = month({
      month: "2027-03",
      entries: [entry("2027-03-25 22:00", "2027-03-26 06:00")],
    });
    const thursday = day(result, "2027-03-25");
    expect(thursday.minutes).toBe(420);
    expect(thursday.night).toBe(true);
    expect(thursday.norm).toBe(420);
    expect(minutes(thursday.buckets)).toEqual({ regular: 420 });
  });

  it("C11: a 17-year-old at school past 20:00, and under the minimum at 30.00", () => {
    const run = (agorot: number) =>
      month({
        month: "2026-10",
        person: {
          youthUntil: "2027-03-01",
          compulsoryEducation: true,
          wages: [
            { agorot, from: "2026-10-01", setAt: "2026-10-01T08:00:00Z" },
          ],
        },
        entries: [entry("2026-10-13 18:00", "2026-10-13 22:30")],
      });
    const low = run(3000);
    expect(minutes(day(low, "2026-10-13").buckets)).toEqual({ regular: 270 });
    expect(low.flags).toContainEqual({
      code: "minorNight",
      date: "2026-10-13",
      from: "20:00",
      to: "08:00",
      minutes: 150,
    });
    expect(low.flags).toContainEqual({
      code: "belowMinimumWage",
      from: "2026-10-01",
      to: "2026-10-31",
      agorot: 3000,
      minimum: 3092,
      band: "17",
    });
    expect(codes(run(3800).flags)).not.toContain("belowMinimumWage");
  });

  it("C12: election day is tagged, never moved to another rate", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-27 09:00", "2026-10-27 17:00")],
    });
    const tuesday = day(result, "2026-10-27");
    expect(minutes(tuesday.buckets)).toEqual({ regular: 480 });
    expect(tuesday.oneOffRestDay).toBe("knesset_2026");
    expect(result.flags).toContainEqual({
      code: "oneOffRestDay",
      date: "2026-10-27",
      key: "knesset_2026",
      minutes: 480,
    });
    expect(result.holidayPay).toEqual([]);
  });

  it("C13: a raise on 15.10 splits the month by wage", () => {
    const result = month({
      month: "2026-10",
      person: {
        wages: [
          { agorot: 3800, from: "2026-10-01", setAt: "2026-10-01T08:00:00Z" },
          { agorot: 4000, from: "2026-10-15", setAt: "2026-10-01T08:00:00Z" },
        ],
      },
      entries: daily(["2026-10-14", "2026-10-15"], "08:00", "16:00"),
    });
    expect(result.byWage).toEqual([
      {
        agorot: 3800,
        from: "2026-10-01",
        to: "2026-10-14",
        buckets: { ...NO_BUCKETS, regular: 480 },
        amountAgorot: 30_400,
      },
      {
        agorot: 4000,
        from: "2026-10-15",
        to: "2026-10-31",
        buckets: { ...NO_BUCKETS, regular: 480 },
        amountAgorot: 32_000,
      },
    ]);
    expect(result.estimateAgorot).toBe(62_400);
  });

  it("C14: an open entry counts for nothing", () => {
    const open = entry("2026-10-29 08:00", null);
    const result = month({
      month: "2026-10",
      now: at("2026-10-30 12:00"),
      entries: [open],
    });
    expect(result.minutes).toBe(0);
    expect(day(result, "2026-10-29").minutes).toBe(0);
    expect(result.openEntries).toBe(1);
    expect(result.flags).toContainEqual({
      code: "openEntry",
      entryId: open.id,
      date: "2026-10-29",
    });
  });

  it("C15: an unpaid break of 15 minutes comes off, and is flagged", () => {
    const result = month({
      month: "2026-10",
      entries: [
        entry("2026-10-19 09:00", "2026-10-19 17:00", {
          breaks: [
            { from: "2026-10-19 12:00", to: "2026-10-19 12:15", unpaid: true },
          ],
        }),
      ],
    });
    const monday = day(result, "2026-10-19");
    expect(minutes(monday.buckets)).toEqual({ regular: 465 });
    expect(monday.unpaidBreakMinutes).toBe(15);
    expect(result.flags).toContainEqual({
      code: "shortUnpaidBreak",
      date: "2026-10-19",
      minutes: 15,
    });
    expect(result.flags).toContainEqual({
      code: "breakMissing",
      days: 1,
      dates: ["2026-10-19"],
    });
  });

  it("C16: s.30(א)(6), hours that can't be supervised, all regular", () => {
    const result = month({
      month: "2026-10",
      person: { hoursLaw: "unsupervised" },
      entries: [entry("2026-10-04 08:00", "2026-10-04 19:00")],
    });
    expect(minutes(day(result, "2026-10-04").buckets)).toEqual({
      regular: 660,
    });
    expect(codes(result.flags)).toContain("hoursLawUnsupervised");
    expect(codes(result.flags)).not.toContain("dayOver12");
  });

  it("C16r: s.30 on Saturday is regular, flagged", () => {
    const result = month({
      month: "2026-10",
      person: { hoursLaw: "trust" },
      entries: [entry("2026-10-17 10:00", "2026-10-17 16:00")],
    });
    const saturday = day(result, "2026-10-17");
    expect(minutes(saturday.buckets)).toEqual({ regular: 360 });
    expect(saturday.restMinutes).toBe(360);
    expect(result.flags).toContainEqual({ code: "hoursLawTrust" });
    expect(result.flags).toContainEqual({
      code: "hoursLawRestDay",
      date: "2026-10-17",
      minutes: 360,
    });
    // The other reading, if the lawyer says s.17's premium still applies: 150%.
    const other = month({
      month: "2026-10",
      person: { hoursLaw: "trust" },
      entries: [entry("2026-10-17 10:00", "2026-10-17 16:00")],
      readings: { ...PAYROLL_READINGS, hoursLawRestRegular: false },
    });
    const premium = day(other, "2026-10-17");
    expect(minutes(premium.buckets)).toEqual({ rest150: 360 });
    expect(premium.restMinutes).toBe(360);
    expect(codes(other.flags)).not.toContain("hoursLawRestDay");
  });

  it("C17: work on the second day of Rosh Hashana", () => {
    const result = month({
      month: "2026-09",
      entries: [entry("2026-09-13 12:00", "2026-09-13 20:00")],
    });
    const sunday = day(result, "2026-09-13");
    expect(sunday.norm).toBe(480);
    expect(sunday.holiday).toBe("rosh_hashana_2");
    expect(minutes(sunday.buckets)).toEqual({ rest150: 446, regular: 34 });
    expect(result.flags).toContainEqual({
      code: "holidayWorked",
      date: "2026-09-13",
      holiday: "rosh_hashana_2",
      minutes: 446,
      paidAt: "rest",
    });
  });

  it("C17b: the eve of Yom Kippur is 7 hours", () => {
    const result = month({
      month: "2026-09",
      entries: [entry("2026-09-20 10:00", "2026-09-20 19:00")],
    });
    const sunday = day(result, "2026-09-20");
    expect(sunday.eve).toBe(true);
    expect(sunday.norm).toBe(420);
    expect(minutes(sunday.buckets)).toEqual({
      regular: 420,
      ot125: 80,
      rest175: 40,
    });
  });

  it("C17c (a): a shift within 36 hours of the last work before Yom Kippur is holiday work", () => {
    const after = entry("2026-09-21 20:00", "2026-09-22 02:00");
    const result = month({
      month: "2026-09",
      entries: [entry("2026-09-20 10:00", "2026-09-20 19:00"), after],
    });
    const monday = day(result, "2026-09-21");
    expect(monday.night).toBe(true);
    expect(minutes(monday.buckets)).toEqual({ rest150: 360 });
    expect(result.flags).toContainEqual({
      code: "holidayNight",
      date: "2026-09-21",
      holiday: "yom_kippur",
      entryId: after.id,
    });
  });

  it("C17c (b): 48 hours after the last work, it is not", () => {
    const result = month({
      month: "2026-09",
      entries: [
        entry("2026-09-19 12:00", "2026-09-19 20:00"),
        entry("2026-09-21 20:00", "2026-09-22 02:00"),
      ],
    });
    expect(minutes(day(result, "2026-09-21").buckets)).toEqual({
      regular: 360,
    });
    expect(codes(result.flags)).not.toContain("holidayNight");
  });

  it("C17c: with no work in the week before, the 36 hours run from the holiday's start, to Tue 22.9 06:20", () => {
    const early = month({
      month: "2026-09",
      entries: [entry("2026-09-22 06:00", "2026-09-22 08:00")],
    });
    expect(minutes(day(early, "2026-09-22").buckets)).toEqual({ rest150: 120 });
    expect(codes(early.flags)).toContain("holidayNight");
    const later = month({
      month: "2026-09",
      entries: [entry("2026-09-22 06:30", "2026-09-22 08:30")],
    });
    expect(minutes(day(later, "2026-09-22").buckets)).toEqual({ regular: 120 });
  });

  it("C17d: no 7-hour eve before a holiday the person works", () => {
    const result = month({
      month: "2026-09",
      entries: [
        entry("2026-09-20 10:00", "2026-09-20 19:00"),
        entry("2026-09-21 10:00", "2026-09-21 14:00"),
      ],
    });
    const sunday = day(result, "2026-09-20");
    expect(sunday.eve).toBe(false);
    expect(sunday.norm).toBe(480);
    expect(minutes(sunday.buckets)).toEqual({
      regular: 480,
      ot125: 20,
      rest175: 40,
    });
    expect(minutes(day(result, "2026-09-21").buckets)).toEqual({
      rest150: 240,
    });
    expect(result.flags).toContainEqual({
      code: "holidayWorked",
      date: "2026-09-21",
      holiday: "yom_kippur",
      minutes: 240,
      paidAt: "rest",
    });
  });

  it("C18: holiday pay, Kol Zchut's example", () => {
    const result = month({
      month: "2026-09",
      person: C18_PERSON,
      history: history({ 0: 10, 1: 10, 2: 10, 3: 10, 4: 10, 5: 5 }),
      entries: [],
    });
    expect(result.holidayPay).toContainEqual({
      date: "2026-09-21",
      holiday: "yom_kippur",
      oneOffRestDay: null,
      averageMinutes: 450,
      agorot: 30_000,
      check: ["adjacentDays", "averagePeriod"],
    });
    // Rosh Hashana I and Sukkot are on Saturdays, the person's rest.
    const dates = result.holidayPay.map((line) => line.date);
    expect(dates).not.toContain("2026-09-12");
    expect(dates).not.toContain("2026-09-26");

    const seldom = month({
      month: "2026-09",
      person: C18_PERSON,
      history: history({ 1: 3 }),
      entries: [],
    });
    expect(
      seldom.holidayPay.find((line) => line.holiday === "yom_kippur"),
    ).toEqual({
      date: "2026-09-21",
      holiday: "yom_kippur",
      oneOffRestDay: null,
      averageMinutes: 450,
      agorot: 30_000,
      check: ["adjacentDays", "averagePeriod", "wasScheduled"],
    });

    const newcomer = month({
      month: "2026-09",
      person: {
        ...C18_PERSON,
        periods: [{ startedOn: "2026-07-01", endedOn: null }],
      },
      history: history({ 1: 10 }),
      entries: [],
    });
    expect(newcomer.holidayPay).toEqual([]);
  });

  it("C19: resting on Friday", () => {
    const result = month({
      month: "2026-10",
      person: { restDay: 5 },
      entries: [
        entry("2026-10-08 08:00", "2026-10-08 16:00"),
        entry("2026-10-09 10:00", "2026-10-09 14:00"),
      ],
    });
    const thursday = day(result, "2026-10-08");
    expect(thursday.norm).toBe(420);
    expect(minutes(thursday.buckets)).toEqual({ regular: 420, ot125: 60 });
    expect(minutes(day(result, "2026-10-09").buckets)).toEqual({
      rest150: 240,
    });
  });

  it("C19s: resting on Sunday, across the week's edge", () => {
    const result = month({
      month: "2026-10",
      person: { restDay: 0 },
      entries: [
        entry("2026-10-17 19:00", "2026-10-17 23:00"),
        entry("2026-10-18 10:00", "2026-10-18 14:00"),
      ],
    });
    const saturday = day(result, "2026-10-17");
    expect(saturday.norm).toBe(420);
    expect(minutes(saturday.buckets)).toEqual({ rest150: 240 });
    expect(minutes(day(result, "2026-10-18").buckets)).toEqual({
      rest150: 240,
    });
    expect(codes(result.flags)).not.toContain("weeklyRestUnder36");
  });

  it("C20: a 13.5-hour day", () => {
    const result = month({
      month: "2026-10",
      entries: [entry("2026-10-04 07:00", "2026-10-04 20:30")],
    });
    expect(minutes(day(result, "2026-10-04").buckets)).toEqual({
      regular: 480,
      ot125: 120,
      ot150: 210,
    });
    expect(result.flags).toContainEqual({
      code: "dayOver12",
      date: "2026-10-04",
      minutes: 810,
    });
  });

  it("C21: the minimum wage table is stale from April 2027", () => {
    expect(
      payrollMonth(input({ month: "2027-04", entries: [] })).notes,
    ).toContainEqual({ code: "minimumWageTableStale" });
    expect(
      payrollMonth(input({ month: "2027-03", entries: [] })).notes,
    ).not.toContainEqual({ code: "minimumWageTableStale" });
  });

  it("C22: under 8 hours between two days", () => {
    const result = month({
      month: "2026-10",
      entries: [
        entry("2026-10-18 14:00", "2026-10-18 23:30"),
        entry("2026-10-19 06:00", "2026-10-19 14:00"),
      ],
    });
    expect(result.flags).toContainEqual({
      code: "restBetweenUnder8",
      date: "2026-10-19",
      minutes: 390,
    });
  });

  it("C23: over 16 overtime hours in a week", () => {
    const long = () =>
      daily(
        ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"],
        "07:00",
        "18:00",
      );
    const five = month({ month: "2026-10", entries: long() });
    for (const one of five.days) {
      expect(minutes(one.buckets)).toEqual({
        regular: 480,
        ot125: 120,
        ot150: 60,
      });
    }
    expect(codes(five.flags)).not.toContain("weekOvertimeOver16");

    const six = month({
      month: "2026-10",
      entries: [...long(), entry("2026-10-16 08:00", "2026-10-16 12:00")],
    });
    expect(minutes(day(six, "2026-10-16").buckets)).toEqual({
      regular: 120,
      ot125: 120,
    });
    expect(six.flags).toContainEqual({
      code: "weekOvertimeOver16",
      weekOf: "2026-10-11",
      minutes: 1020,
    });
  });

  it("C24: turning 18 mid-month", () => {
    const result = month({
      month: "2026-10",
      person: {
        youthUntil: "2026-10-20",
        wages: [
          { agorot: 3200, from: "2026-10-01", setAt: "2026-10-01T08:00:00Z" },
        ],
      },
      entries: [
        entry("2026-10-13 09:00", "2026-10-13 13:00"),
        entry("2026-10-21 09:00", "2026-10-21 13:00"),
      ],
    });
    expect(
      result.flags.filter((flag) => flag.code === "belowMinimumWage"),
    ).toEqual([
      {
        code: "belowMinimumWage",
        from: "2026-10-20",
        to: "2026-10-31",
        agorot: 3200,
        minimum: 3540,
        band: "adult",
      },
    ]);
  });

  it("C25: a seventh day, rest counted toward the 42 (the plan's reading)", () => {
    const entries = () => [
      ...C6_WEEK(),
      entry("2026-10-17 10:00", "2026-10-17 16:00"),
    ];
    const plan = month({ month: "2026-10", entries: entries() });
    expect(minutes(day(plan, "2026-10-17").buckets)).toEqual({ rest200: 360 });
    expect(plan.flags).toContainEqual({
      code: "restWeekOvertime",
      date: "2026-10-17",
      minutes: 360,
    });
    // The other reading, if the accountant says rest isn't counted: 150%.
    const other = month({
      month: "2026-10",
      entries: entries(),
      readings: { ...PAYROLL_READINGS, restCountsTowardWeek: false },
    });
    expect(minutes(day(other, "2026-10-17").buckets)).toEqual({ rest150: 360 });
    expect(codes(other.flags)).not.toContain("restWeekOvertime");
  });

  it("C26: two entries on one date are one workday", () => {
    const result = month({
      month: "2026-10",
      entries: [
        entry("2026-10-05 08:00", "2026-10-05 12:00"),
        entry("2026-10-05 13:00", "2026-10-05 18:00"),
      ],
    });
    const monday = day(result, "2026-10-05");
    expect(monday.minutes).toBe(540);
    expect(monday.entryIds).toHaveLength(2);
    expect(minutes(monday.buckets)).toEqual({ regular: 480, ot125: 60 });
  });

  it("C26b: a double, 10 hours apart, is still one workday", () => {
    const result = month({
      month: "2026-10",
      entries: [
        entry("2026-10-05 06:00", "2026-10-05 12:00"),
        entry("2026-10-05 22:00", "2026-10-06 06:00"),
      ],
    });
    const monday = day(result, "2026-10-05");
    expect(monday.minutes).toBe(840);
    expect(monday.night).toBe(true);
    expect(monday.norm).toBe(420);
    expect(minutes(monday.buckets)).toEqual({
      regular: 420,
      ot125: 120,
      ot150: 300,
    });
    expect(result.flags).toContainEqual({
      code: "doubleShift",
      date: "2026-10-05",
      gap: 600,
    });
    expect(result.flags).toContainEqual({
      code: "dayOver12",
      date: "2026-10-05",
      minutes: 840,
    });
  });

  it("C27: rounding is ignored", () => {
    const result = payrollMonth(
      input({
        month: "2026-10",
        settings: { roundToMinutes: 15 },
        entries: [entry("2026-10-04 09:07", "2026-10-04 18:00")],
      }),
    );
    const sunday = result.people[0]?.days[0];
    expect(sunday?.minutes).toBe(533);
    expect(sunday && minutes(sunday.buckets)).toEqual({
      regular: 480,
      ot125: 53,
    });
    expect(result.notes).toContainEqual({ code: "roundingIgnored", step: 15 });
  });

  it("C28: a paid holiday counts toward the weekly 42", () => {
    const entries = () => [
      entry("2026-09-20 08:00", "2026-09-20 15:00"),
      ...daily(["2026-09-22", "2026-09-23", "2026-09-24"], "08:00", "16:00"),
      entry("2026-09-25 08:00", "2026-09-25 15:00"),
    ];
    const result = month({
      month: "2026-09",
      person: C18_PERSON,
      history: history({ 0: 10, 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 }),
      entries: entries(),
    });
    expect(
      result.holidayPay.find((line) => line.holiday === "yom_kippur")?.agorot,
    ).toBe(30_000);
    expect(minutes(day(result, "2026-09-20").buckets)).toEqual({
      regular: 420,
    });
    expect(minutes(day(result, "2026-09-25").buckets)).toEqual({
      regular: 210,
      ot125: 120,
      ot150: 90,
    });
    // Without the holiday counted (no history, no average), no overtime at all.
    const without = month({
      month: "2026-09",
      person: C18_PERSON,
      entries: entries(),
    });
    expect(minutes(day(without, "2026-09-25").buckets)).toEqual({
      regular: 420,
    });
    // The other reading, the holiday at its norm (480, not 450): Friday
    // crosses 2,520 after 180.
    const atNorm = month({
      month: "2026-09",
      person: C18_PERSON,
      history: history({ 0: 10, 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 }),
      entries: entries(),
      readings: { ...PAYROLL_READINGS, paidAbsenceCountsAt: "norm" },
    });
    expect(minutes(day(atNorm, "2026-09-25").buckets)).toEqual({
      regular: 180,
      ot125: 120,
      ot150: 120,
    });
  });

  it("C29: election day not worked is paid, and counts toward the 42", () => {
    const entries = () => [
      ...daily(
        ["2026-10-25", "2026-10-26", "2026-10-28", "2026-10-29"],
        "08:00",
        "17:00",
      ),
      entry("2026-10-30 08:00", "2026-10-30 15:00"),
    ];
    const result = month({
      month: "2026-10",
      person: {
        periods: [{ startedOn: "2026-05-01", endedOn: null }],
      },
      history: history({ 0: 12, 1: 12, 2: 12, 3: 12, 4: 12 }),
      entries: entries(),
    });
    expect(result.holidayPay).toEqual([
      {
        date: "2026-10-27",
        holiday: null,
        oneOffRestDay: "knesset_2026",
        averageMinutes: 450,
        agorot: 28_500,
        check: ["averagePeriod", "fourteenDays", "sectorExclusion"],
      },
    ]);
    expect(minutes(day(result, "2026-10-30").buckets)).toEqual({
      regular: 150,
      ot125: 120,
      ot150: 150,
    });
    const without = month({
      month: "2026-10",
      person: { periods: [{ startedOn: "2026-05-01", endedOn: null }] },
      entries: entries(),
    });
    expect(minutes(day(without, "2026-10-30").buckets)).toEqual({
      regular: 420,
    });
  });

  it("C30: under 15", () => {
    const result = month({
      month: "2026-10",
      person: { youthUntil: "2029-11-01" },
      entries: [entry("2026-10-13 16:00", "2026-10-13 18:00")],
    });
    expect(result.flags).toContainEqual({
      code: "minorUnderAge",
      date: "2026-10-13",
    });
  });
});

describe("the engine", () => {
  it("reports what it checks on each entry", () => {
    const corrected = {
      ...entry("2026-10-04 09:00", "2026-10-04 23:30"),
      editedBy: "22222222-2222-4222-a222-222222222222",
      note: "Forgot to clock out",
    };
    const waiting = {
      ...entry("2026-10-05 09:00", "2026-10-05 12:00"),
      inProof: "self" as const,
    };
    const result = month({
      month: "2026-10",
      person: { payrollNumber: null },
      entries: [corrected, waiting],
    });
    expect(result.flags).toContainEqual({
      code: "longEntry",
      entryId: corrected.id,
      date: "2026-10-04",
      minutes: 870,
    });
    expect(result.flags).toContainEqual({
      code: "edited",
      entryId: corrected.id,
      date: "2026-10-04",
      by: corrected.editedBy,
      note: "Forgot to clock out",
    });
    expect(result.flags).toContainEqual({
      code: "unconfirmed",
      entryId: waiting.id,
      date: "2026-10-05",
      ownerOnly: true,
    });
    expect(result.flags).toContainEqual({ code: "noPayrollNumber" });
    expect(result.editedEntries).toBe(1);
    expect(result.unconfirmedEntries).toBe(1);
    // The day's own flags are on the day too.
    expect(codes(day(result, "2026-10-04").flags)).toContain("edited");
  });

  it("has no estimate while a worked day has no wage", () => {
    const result = month({
      month: "2026-10",
      person: {
        wages: [
          { agorot: 3800, from: "2026-10-10", setAt: "2026-10-01T08:00:00Z" },
        ],
      },
      entries: daily(["2026-10-05", "2026-10-12"], "09:00", "17:00"),
    });
    expect(result.estimateAgorot).toBeNull();
    expect(result.flags).toContainEqual({ code: "noWage", from: "2026-10-05" });
    expect(result.byWage.map((segment) => segment.agorot)).toEqual([
      null,
      3800,
    ]);
    expect(result.byWage[0]?.amountAgorot).toBeNull();
  });

  it("finds a week without its 36 hours of rest", () => {
    const result = month({
      month: "2026-10",
      entries: daily(
        [
          "2026-10-11",
          "2026-10-12",
          "2026-10-13",
          "2026-10-14",
          "2026-10-15",
          "2026-10-16",
          "2026-10-17",
          "2026-10-18",
        ],
        "09:00",
        "13:00",
      ),
    });
    expect(result.flags).toContainEqual({
      code: "weeklyRestUnder36",
      weekOf: "2026-10-11",
      longest: 1200,
    });
  });

  it("keeps a minor's limits apart from an adult's", () => {
    const result = month({
      month: "2026-10",
      person: { youthUntil: "2027-03-01", compulsoryEducation: false },
      entries: [entry("2026-10-16 08:00", "2026-10-16 23:30")],
    });
    const found = codes(result.flags);
    expect(found).toEqual(
      expect.arrayContaining([
        "minorDayOver",
        "minorEveOver7",
        "minorOvertime",
        "minorRestDay",
        "minorNight",
        "minorBreak",
        "minorAfter23",
      ]),
    );
    expect(found).not.toContain("dayOver12");
    expect(result.flags).toContainEqual({
      code: "minorNight",
      date: "2026-10-16",
      from: "22:00",
      to: "06:00",
      minutes: 90,
    });
  });

  it("says a person resting on Friday worked a Jewish holiday", () => {
    const result = month({
      month: "2026-09",
      person: { restDay: 5 },
      entries: [entry("2026-09-21 10:00", "2026-09-21 14:00")],
    });
    expect(result.flags).toContainEqual({
      code: "restDayHolidays",
      date: "2026-09-21",
      holiday: "yom_kippur",
    });
    expect(minutes(day(result, "2026-09-21").buckets)).toEqual({
      rest150: 240,
    });
    // The other reading: no Jewish holiday is theirs.
    const own = month({
      month: "2026-09",
      person: { restDay: 5 },
      entries: [entry("2026-09-21 10:00", "2026-09-21 14:00")],
      readings: { ...PAYROLL_READINGS, holidaysForOtherRestDays: false },
    });
    expect(minutes(day(own, "2026-09-21").buckets)).toEqual({ regular: 240 });
    expect(codes(own.flags)).not.toContain("restDayHolidays");
    expect(codes(own.flags)).not.toContain("holidayWorked");
    expect(own.holidayPay).toEqual([]);
  });

  it("works a holiday by a shift wholly in its evening", () => {
    const run = (from: string, to: string) =>
      month({
        month: "2026-09",
        person: C18_PERSON,
        history: history({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 }),
        entries: [entry(from, to)],
      });
    const lineFor = (result: PersonPayroll, holiday: string) =>
      result.holidayPay.find((line) => line.holiday === holiday);

    // Yom Kippur's evening, from candle lighting at 18:20 on Sunday: holiday
    // work, so no holiday pay on top and no 7-hour eve.
    const evening = run("2026-09-20 19:00", "2026-09-20 23:30");
    expect(lineFor(evening, "yom_kippur")).toBeUndefined();
    expect(evening.flags).toContainEqual({
      code: "holidayWorked",
      date: "2026-09-21",
      holiday: "yom_kippur",
      minutes: 270,
      paidAt: "rest",
    });
    const sunday = day(evening, "2026-09-20");
    expect(sunday.eve).toBe(false);
    expect(sunday.norm).toBe(480);
    expect(minutes(sunday.buckets)).toEqual({ rest150: 270 });
    const earlier = run("2026-09-20 18:30", "2026-09-20 23:30");
    expect(lineFor(earlier, "yom_kippur")).toBeUndefined();
    expect(codes(earlier.flags)).toContain("holidayWorked");
    expect(day(earlier, "2026-09-20").eve).toBe(false);

    // Rosh Hashana's second day starts at havdalah on Saturday, 19:28.
    for (const [from, worked] of [
      ["2026-09-12 20:00", 210],
      ["2026-09-12 20:30", 180],
    ] as const) {
      const night = run(from, "2026-09-12 23:30");
      expect(lineFor(night, "rosh_hashana_2")).toBeUndefined();
      expect(night.flags).toContainEqual({
        code: "holidayWorked",
        date: "2026-09-13",
        holiday: "rosh_hashana_2",
        minutes: worked,
        paidAt: "rest",
      });
    }
  });

  it("keeps the eve and the holiday pay for an eve's shift past candle lighting (C17b)", () => {
    const run = (readings?: PayrollInput["readings"]) =>
      month({
        month: "2026-09",
        person: C18_PERSON,
        history: history({ 0: 10, 1: 10, 2: 10, 3: 10, 4: 10, 5: 10 }),
        entries: [entry("2026-09-20 10:00", "2026-09-20 19:00")],
        readings,
      });
    const plan = run();
    expect(day(plan, "2026-09-20").norm).toBe(420);
    expect(plan.holidayPay.map((line) => line.holiday)).toContain("yom_kippur");
    expect(codes(plan.flags)).not.toContain("holidayWorked");
    // The other reading: every minute in the window works the holiday.
    const other = run({ ...PAYROLL_READINGS, eveShiftFromHolidayDate: false });
    const sunday = day(other, "2026-09-20");
    expect(sunday.eve).toBe(false);
    expect(minutes(sunday.buckets)).toEqual({
      regular: 480,
      ot125: 20,
      rest175: 40,
    });
    expect(other.holidayPay.map((line) => line.holiday)).not.toContain(
      "yom_kippur",
    );
    expect(other.flags).toContainEqual({
      code: "holidayWorked",
      date: "2026-09-21",
      holiday: "yom_kippur",
      minutes: 40,
      paidAt: "rest",
    });
  });

  it("says s.30 hours on a holiday were paid as regular", () => {
    const result = month({
      month: "2026-09",
      person: { hoursLaw: "trust" },
      entries: [entry("2026-09-21 10:00", "2026-09-21 14:00")],
    });
    expect(minutes(day(result, "2026-09-21").buckets)).toEqual({
      regular: 240,
    });
    expect(result.flags).toContainEqual({
      code: "holidayWorked",
      date: "2026-09-21",
      holiday: "yom_kippur",
      minutes: 240,
      paidAt: "regular",
    });
    expect(result.flags).toContainEqual({
      code: "hoursLawRestDay",
      date: "2026-09-21",
      minutes: 240,
    });
  });

  it("counts a shift through a holiday's end as holiday work, as a whole", () => {
    // Yom Kippur ends at 19:15 on Monday; no work in the week before, so the
    // 36 hours run from its start, to Tuesday 06:20. Coming in before
    // havdalah pays no less than after it: 240 minutes at 150%, 228.00.
    for (const [from, to] of [
      ["2026-09-21 19:10", "2026-09-21 23:10"],
      ["2026-09-21 19:20", "2026-09-21 23:20"],
    ] as const) {
      const shift = entry(from, to);
      const result = month({ month: "2026-09", entries: [shift] });
      expect(minutes(day(result, "2026-09-21").buckets), from).toEqual({
        rest150: 240,
      });
      expect(result.flags).toContainEqual({
        code: "holidayNight",
        date: "2026-09-21",
        holiday: "yom_kippur",
        entryId: shift.id,
      });
      expect(result.estimateAgorot, from).toBe(22_800);
    }
  });

  it("checks the week someone turns 18 by their age on each day", () => {
    // 18 on Wednesday 14.10: Sun–Tue a minor's 2,250 minutes, under 40
    // hours; Wed–Fri an adult's, with 1,110 minutes of overtime.
    const result = month({
      month: "2026-10",
      person: { youthUntil: "2026-10-14" },
      entries: [
        ...daily(
          [
            "2026-10-11",
            "2026-10-12",
            "2026-10-13",
            "2026-10-14",
            "2026-10-15",
          ],
          "07:00",
          "19:30",
        ),
        entry("2026-10-16 06:00", "2026-10-16 17:30"),
      ],
    });
    expect(codes(result.flags)).not.toContain("minorWeekOver40");
    expect(result.flags).toContainEqual({
      code: "weekOvertimeOver16",
      weekOf: "2026-10-11",
      minutes: 1110,
    });
    expect(codes(day(result, "2026-10-13").flags)).toContain("minorDayOver");
    expect(codes(day(result, "2026-10-14").flags)).toContain("dayOver12");
  });

  it("always notes the paid absences the app doesn't know", () => {
    expect(
      payrollMonth(input({ month: "2026-10", entries: [] })).notes,
    ).toContainEqual({ code: "paidAbsencesMissing" });
  });

  it("works out one person's own month", () => {
    const other = entry("2026-10-04 09:00", "2026-10-04 18:00", {
      userId: "33333333-3333-4333-a333-333333333333",
    });
    const own = personPayroll(
      input({
        month: "2026-10",
        entries: [entry("2026-10-05 09:00", "2026-10-05 17:00"), other],
      }),
      ID,
    );
    expect(own?.days.map((one) => one.date)).toEqual(["2026-10-05"]);
    expect(
      personPayroll(input({ month: "2026-10", entries: [] }), "nobody"),
    ).toBeNull();
  });
});

describe("the month's helpers", () => {
  it("covers whole weeks", () => {
    expect(payrollRange("2026-10")).toEqual({
      from: "2026-09-27",
      to: "2026-10-31",
    });
    expect(payrollRange("2026-09")).toEqual({
      from: "2026-08-30",
      to: "2026-10-03",
    });
    expect(payrollRange("2027-02")).toEqual({
      from: "2027-01-31",
      to: "2027-03-06",
    });
  });

  it("reads entries from the history's first month to the range's end", () => {
    const range = payrollReadRange("2026-10", TZ, "2026-07");
    expect(range.from.toISOString()).toBe(at("2026-07-01 00:00"));
    expect(range.to.toISOString()).toBe(at("2026-11-01 00:00"));
    // Without a history, still a week before the range for the holiday rule.
    expect(payrollReadRange("2026-10", TZ, "2026-10").from.toISOString()).toBe(
      at("2026-09-20 00:00"),
    );
  });

  it("rounds per bucket and writes decimal hours from minutes", () => {
    expect(bucketAgorot(516, 3800, "regular")).toBe(32_680);
    expect(bucketAgorot(1, 3333, "ot125")).toBe(69);
    expect(hoursText(516)).toBe("8.60");
    expect(hoursText(533)).toBe("8.88");
  });

  it("apportions milliseconds to the clock's minutes by largest remainder", () => {
    expect(apportion([30_000, 30_000, 60_000], 2)).toEqual([1, 0, 1]);
    expect(apportion([90_000, 30_000], 2)).toEqual([2, 0]);
    expect(apportion([0, 0], 0)).toEqual([0, 0]);
    expect(
      addBuckets(
        { ...NO_BUCKETS, regular: 1 },
        { ...NO_BUCKETS, regular: 2, ot125: 3 },
      ),
    ).toEqual({
      ...NO_BUCKETS,
      regular: 3,
      ot125: 3,
    });
  });

  it("drops every amount while the estimate is off", () => {
    const result = payrollMonth(
      input({
        month: "2026-10",
        person: { periods: [{ startedOn: "2026-05-01", endedOn: null }] },
        history: history({ 2: 12 }),
        entries: [entry("2026-10-16 12:00", "2026-10-16 22:00")],
      }),
    );
    const hidden = withoutAmounts(result).people[0];
    expect(hidden?.estimateAgorot).toBeNull();
    expect(
      hidden?.byWage.every((segment) => segment.amountAgorot === null),
    ).toBe(true);
    expect(hidden?.holidayPay.every((line) => line.agorot === null)).toBe(true);
    expect(hidden?.buckets).toEqual(result.people[0]?.buckets);
  });

  it("shows a worker their own estimate only when both switches and a wage allow", () => {
    const on = { payEstimate: true, workersSeeEstimate: true };
    expect(ownEstimateShown(on, [{}])).toBe(true);
    expect(ownEstimateShown(on, [])).toBe(false);
    expect(ownEstimateShown({ ...on, payEstimate: false }, [{}])).toBe(false);
    expect(ownEstimateShown({ ...on, workersSeeEstimate: false }, [{}])).toBe(
      false,
    );
  });

  it("reads a person from payroll's rows, the defaults filling in", () => {
    expect(
      payrollPersonOf(
        ID,
        undefined,
        [{ startedOn: "2026-03-01", endedOn: null }],
        [{ agorot: 3800, from: "2026-03-01", setAt: "2026-03-01T08:00:00Z" }],
      ),
    ).toEqual({
      userId: ID,
      payrollNumber: DEFAULT_DETAILS.payrollNumber,
      restDay: 6,
      hoursLaw: "applies",
      youthUntil: null,
      compulsoryEducation: true,
      periods: [{ startedOn: "2026-03-01", endedOn: null }],
      wages: [
        { agorot: 3800, from: "2026-03-01", setAt: "2026-03-01T08:00:00Z" },
      ],
    });
  });

  it("works a month out for the staff and anyone with hours", () => {
    expect(
      payrollPeopleOf(
        [
          { userId: "owner", role: "owner", active: true },
          { userId: "left", role: "worker", active: false },
          { userId: "galit", role: "accountant", active: true },
          { userId: "was-staff", role: "accountant", active: true },
        ],
        [{ userId: "was-staff" }],
      ),
    ).toEqual(["owner", "was-staff"]);
  });

  it("lets holiday pay be asked directly too", () => {
    const range = payrollRange("2026-09");
    const calendar = payrollCalendar(TEL_AVIV, range.from, range.to, SIX);
    expect(
      holidayPayLines({
        holidays: calendar.holidays,
        oneOffRestDays: [],
        person: person(C18_PERSON),
        workedDates: new Set(["2026-09-21"]),
        history: history({ 1: 10 }),
      }).map((line) => line.date),
    ).not.toContain("2026-09-21");
  });
});
