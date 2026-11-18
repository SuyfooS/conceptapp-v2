import { describe, expect, it } from "vitest";
import type { HolidayPayLine } from "./holiday-pay";
import {
  daySplit,
  dayTags,
  type FlagFormat,
  flagValues,
  flagWhen,
  hasEstimate,
  keyedFlags,
  monthEstimate,
  ownMonthOf,
  personRates,
  type RemarkLine,
  ratesShown,
  remarkLines,
  remarksOf,
  restNameOf,
  restNameOfAll,
  segmentsOf,
  toCheckOf,
  weeksWorkedOut,
} from "./pay-rates";
import {
  type Buckets,
  NO_BUCKETS,
  type PayrollDay,
  type PersonPayroll,
} from "./payroll";
import type { PayrollFlag } from "./payroll-flags";

const buckets = (more: Partial<Buckets>): Buckets => ({
  ...NO_BUCKETS,
  ...more,
});

function day(date: string, more: Partial<PayrollDay> = {}): PayrollDay {
  return {
    date,
    entryIds: [`e-${date}`],
    minutes: 480,
    buckets: buckets({ regular: 480 }),
    norm: 480,
    night: false,
    eve: false,
    restMinutes: 0,
    holiday: null,
    oneOffRestDay: null,
    paidBreakMinutes: 0,
    unpaidBreakMinutes: 30,
    flags: [],
    ...more,
  };
}

function month(more: Partial<PersonPayroll> = {}): PersonPayroll {
  return {
    userId: "noa",
    daysWorked: 0,
    minutes: 0,
    buckets: NO_BUCKETS,
    nightShifts: 0,
    paidBreakMinutes: 0,
    unpaidBreakMinutes: 0,
    editedEntries: 0,
    openEntries: 0,
    unconfirmedEntries: 0,
    byWage: [],
    holidayPay: [],
    estimateAgorot: null,
    days: [],
    flags: [],
    ...more,
  };
}

const holidayLine: HolidayPayLine = {
  date: "2026-09-21",
  holiday: "yom_kippur",
  oneOffRestDay: null,
  averageMinutes: 450,
  agorot: 28500,
  check: ["adjacentDays", "averagePeriod"],
};

const format: FlagFormat = {
  date: (date) => `${Number(date.slice(8))}.${Number(date.slice(5, 7))}`,
  hours: (minutes) => (minutes / 60).toFixed(2),
  shekels: (agorot) => `${(agorot / 100).toFixed(2)} ₪`,
  holiday: (key) => `holiday:${key}`,
  oneOff: (key) => `day:${key}`,
};

describe("rates and days", () => {
  it("shows only the rates with minutes, in payroll's order", () => {
    expect(
      ratesShown(buckets({ rest175: 30, regular: 400, ot125: 60 })),
    ).toEqual(["regular", "ot125", "rest175"]);
    expect(ratesShown(NO_BUCKETS)).toEqual([]);
  });

  it("splits a day past its regular minutes", () => {
    expect(
      daySplit(buckets({ regular: 420, ot125: 36, rest150: 120 })),
    ).toEqual([
      { bucket: "ot125", minutes: 36 },
      { bucket: "rest150", minutes: 120 },
    ]);
    expect(daySplit(buckets({ regular: 480 }))).toEqual([]);
  });

  it("names the rest rates by the person's rest day", () => {
    expect(restNameOf(6)).toBe("saturday");
    expect(restNameOf(5)).toBe("friday");
    expect(restNameOf(0)).toBe("sunday");
    expect(restNameOfAll([6, 6])).toBe("saturday");
    expect(restNameOfAll([5])).toBe("friday");
    expect(restNameOfAll([6, 5])).toBe("other");
    expect(restNameOfAll([])).toBe("saturday");
  });

  it("tags a day: a holiday's name stands for its rest", () => {
    expect(
      dayTags({
        holiday: null,
        oneOffRestDay: null,
        restMinutes: 120,
        eve: true,
        night: false,
      }),
    ).toEqual(["rest", "eve"]);
    expect(
      dayTags({
        holiday: "yom_kippur",
        oneOffRestDay: null,
        restMinutes: 300,
        eve: false,
        night: true,
      }),
    ).toEqual(["holiday", "night"]);
    expect(
      dayTags({
        holiday: null,
        oneOffRestDay: "knesset_2026",
        restMinutes: 0,
        eve: false,
        night: false,
      }),
    ).toEqual(["oneOff"]);
  });

  it("adds each wage stretch's workdays, minutes, nights and breaks", () => {
    const days = [
      day("2026-10-01"),
      day("2026-10-14", { night: true, unpaidBreakMinutes: 0, minutes: 510 }),
      day("2026-10-15"),
      // A day with no paid minute (only an open shift) is no workday.
      day("2026-10-20", { minutes: 0, unpaidBreakMinutes: 0 }),
    ];
    const [first, second] = segmentsOf({
      days,
      byWage: [
        {
          agorot: 3600,
          from: "2026-10-01",
          to: "2026-10-14",
          buckets: NO_BUCKETS,
          amountAgorot: null,
        },
        {
          agorot: 3800,
          from: "2026-10-15",
          to: "2026-10-31",
          buckets: NO_BUCKETS,
          amountAgorot: null,
        },
      ],
    });
    expect(first).toMatchObject({
      days: 2,
      minutes: 990,
      nightShifts: 1,
      unpaidBreakMinutes: 30,
    });
    expect(second).toMatchObject({
      days: 1,
      minutes: 480,
      nightShifts: 0,
      unpaidBreakMinutes: 30,
    });
  });
});

describe("what a pay holder checks", () => {
  const flags: PayrollFlag[] = [
    { code: "edited", entryId: "e", date: "2026-10-05", by: null, note: null },
    { code: "breakMissing", days: 2, dates: ["2026-10-02", "2026-10-03"] },
    { code: "dayOver12", date: "2026-10-04", minutes: 800 },
    { code: "hoursLawTrust" },
    {
      code: "minorNight",
      date: "2026-10-20",
      from: "20:00",
      to: "08:00",
      minutes: 150,
    },
    { code: "noWage", from: "2026-10-01" },
    { code: "minorBreak", date: "2026-10-06", minutes: 30 },
  ];

  it("leaves out what the screens say in their own words, and how someone is paid", () => {
    expect(remarksOf(flags).map((flag) => flag.code)).toEqual([
      // Minors first, by day.
      "minorBreak",
      "minorNight",
      // Then the adults' limits, by day.
      "breakMissing",
      "dayOver12",
    ]);
  });

  it("counts the remarks and every line of pay for a day not worked", () => {
    expect(toCheckOf({ flags, holidayPay: [holidayLine] })).toBe(5);
    expect(toCheckOf({ flags: [], holidayPay: [] })).toBe(0);
  });

  it("keys each flag by what it says, the same one twice apart", () => {
    const short = {
      code: "minorBreak",
      date: "2026-10-06",
      minutes: 20,
    } as const;
    const keys = keyedFlags([
      short,
      { ...short },
      { code: "minorBreak", date: "2026-10-07", minutes: 20 },
    ]).map((one) => one.key);
    expect(new Set(keys).size).toBe(3);
    expect(keys[1]).toBe(`${keys[0]}#1`);
  });

  it("dates a flag by its day, week, first date or start", () => {
    expect(
      flagWhen({ code: "dayOver12", date: "2026-10-04", minutes: 1 }),
    ).toBe("2026-10-04");
    expect(
      flagWhen({ code: "weeklyRestUnder36", weekOf: "2026-10-04", longest: 1 }),
    ).toBe("2026-10-04");
    expect(
      flagWhen({ code: "breakMissing", days: 1, dates: ["2026-10-07"] }),
    ).toBe("2026-10-07");
    expect(flagWhen({ code: "noWage", from: "2026-10-09" })).toBe("2026-10-09");
    expect(flagWhen({ code: "hoursLawTrust" })).toBe("");
  });

  it("gives the month's card one line per person and kind, minors first", () => {
    const liya = remarksOf([
      { code: "minorBreak", date: "2026-10-06", minutes: 30 },
      { code: "minorBreak", date: "2026-10-07", minutes: 30 },
      { code: "minorBreak", date: "2026-10-08", minutes: 30 },
      { code: "breakMissing", days: 1, dates: ["2026-10-01"] },
    ]);
    const tamar = remarksOf([
      { code: "breakMissing", days: 4, dates: ["2026-10-01"] },
      { code: "restWeekOvertime", date: "2026-10-30", minutes: 60 },
    ]);
    const all = remarkLines(
      [
        { userId: "tamar", remarks: tamar },
        { userId: "liya", remarks: liya },
      ],
      10,
    );
    const kindOf = (line: RemarkLine) =>
      "flag" in line ? line.flag.code : "holidayPay";
    expect(
      all.lines.map((line) => [line.userId, kindOf(line), line.more]),
    ).toEqual([
      ["liya", "minorBreak", 2],
      ["tamar", "breakMissing", 0],
      ["liya", "breakMissing", 0],
      ["tamar", "restWeekOvertime", 0],
    ]);
    expect(all.rest).toBe(0);

    const two = remarkLines(
      [
        { userId: "tamar", remarks: tamar },
        { userId: "liya", remarks: liya },
      ],
      2,
    );
    expect(two.lines).toHaveLength(2);
    // The two lines left out: one remark each.
    expect(two.rest).toBe(2);
    expect(remarkLines([], 5)).toEqual({ lines: [], rest: 0 });
  });

  it("gives a person's pay for days not worked one line, so the card adds up to what is counted", () => {
    const tamar: PayrollFlag[] = [
      { code: "breakMissing", days: 4, dates: ["2026-10-01"] },
    ];
    const knesset: HolidayPayLine = {
      ...holidayLine,
      date: "2026-10-27",
      holiday: null,
      oneOffRestDay: "knesset_2026",
      check: ["wasScheduled"],
    };
    const people = [
      {
        userId: "tamar",
        remarks: remarksOf(tamar),
        holidayPay: [holidayLine, knesset],
      },
      {
        userId: "liya",
        remarks: remarksOf([
          { code: "minorBreak", date: "2026-10-06", minutes: 30 },
        ]),
      },
    ];
    const all = remarkLines(people, 10);
    expect(
      all.lines.map((line) => [
        line.userId,
        "flag" in line ? line.flag.code : line.holidayPay.date,
        line.more,
      ]),
    ).toEqual([
      ["liya", "minorBreak", 0],
      ["tamar", "breakMissing", 0],
      // The pay group, after the adults' limits: the first line, and one more.
      ["tamar", "2026-09-21", 1],
    ]);
    const counted =
      toCheckOf({ flags: tamar, holidayPay: [holidayLine, knesset] }) +
      toCheckOf({
        flags: [{ code: "minorBreak", date: "2026-10-06", minutes: 30 }],
        holidayPay: [],
      });
    const shown = (limit: number) => {
      const { lines, rest } = remarkLines(people, limit);
      return lines.reduce((sum, line) => sum + 1 + line.more, rest);
    };
    expect(counted).toBe(4);
    expect(shown(10)).toBe(counted);
    expect(shown(2)).toBe(counted);
    expect(remarkLines(people, 2).rest).toBe(2);
  });

  it("estimates a month only with minutes or pay for a day not worked", () => {
    expect(hasEstimate({ minutes: 0, holidayPay: [] })).toBe(false);
    expect(hasEstimate({ minutes: 30, holidayPay: [] })).toBe(true);
    expect(hasEstimate({ minutes: 0, holidayPay: [holidayLine] })).toBe(true);
  });
});

describe("the values of a flag's words", () => {
  it("writes days, hours and amounts as the screen does", () => {
    expect(
      flagValues(
        {
          code: "minorNight",
          date: "2026-10-27",
          from: "20:00",
          to: "08:00",
          minutes: 150,
        },
        format,
      ),
    ).toEqual({ date: "27.10", hours: "2.50", from: "20:00", to: "08:00" });
    expect(
      flagValues(
        {
          code: "belowMinimumWage",
          from: "2026-10-01",
          to: "2026-10-31",
          agorot: 3000,
          minimum: 3540,
          band: "adult",
        },
        format,
      ),
    ).toEqual({
      amount: "30.00 ₪",
      minimum: "35.40 ₪",
      band: "adult",
      from: "1.10",
      to: "31.10",
    });
    expect(
      flagValues(
        {
          code: "holidayWorked",
          date: "2026-09-21",
          holiday: "yom_kippur",
          minutes: 90,
          paidAt: "rest",
        },
        format,
      ),
    ).toEqual({
      date: "21.9",
      holiday: "holiday:yom_kippur",
      hours: "1.50",
      paidAt: "rest",
    });
    expect(
      flagValues(
        {
          code: "minorDayOver",
          date: "2026-10-13",
          minutes: 560,
          limit: 540,
        },
        format,
      ),
    ).toMatchObject({ limit: "9", hours: "9.33" });
    expect(
      flagValues(
        { code: "weeklyRestUnder36", weekOf: "2026-10-04", longest: 1500 },
        format,
      ),
    ).toEqual({ weekOf: "4.10", hours: "25.00" });
  });
});

describe("a person's month on the pay screens", () => {
  it("keeps the engine's figures and adds what the screens draw", () => {
    const rates = personRates(
      month({
        minutes: 990,
        buckets: buckets({ regular: 900, ot125: 90 }),
        nightShifts: 1,
        // One shift still running: none of its minutes in the rates yet.
        openEntries: 1,
        estimateAgorot: null,
        holidayPay: [holidayLine],
        days: [
          day("2026-10-01"),
          day("2026-10-29", {
            entryIds: ["a", "b"],
            minutes: 510,
            night: true,
            flags: [
              {
                code: "unconfirmed",
                entryId: "a",
                date: "2026-10-29",
                ownerOnly: false,
              },
              { code: "dayOver12", date: "2026-10-29", minutes: 800 },
            ],
          }),
        ],
        flags: [
          { code: "noWage", from: "2026-10-01" },
          { code: "hoursLawUnsupervised" },
          { code: "dayOver12", date: "2026-10-29", minutes: 800 },
        ],
      }),
      5,
    );
    expect(rates.restDay).toBe(5);
    expect(rates.missingWage).toBe(true);
    expect(rates.remarks.map((flag) => flag.code)).toEqual(["dayOver12"]);
    expect(rates.aboutPay.map((flag) => flag.code)).toEqual([
      "hoursLawUnsupervised",
    ]);
    expect(rates.toCheck).toBe(2);
    expect(rates.open).toBe(1);
    expect(rates.days[1]).toMatchObject({ shifts: 2, night: true });
    expect(rates.days[1]?.remarks.map((flag) => flag.code)).toEqual([
      "dayOver12",
    ]);
  });

  it("adds the month's known estimates and counts who has none for want of a wage", () => {
    expect(
      monthEstimate([
        { estimateAgorot: 100_000, missing: false },
        { estimateAgorot: null, missing: true },
        // An owner with no wage: not in the sum, and not said to be missing one.
        { estimateAgorot: null, missing: false },
        { estimateAgorot: 2550, missing: false },
      ]),
    ).toEqual({ agorot: 102_550, missing: 1 });
  });

  it("reads one person's weeks of a business whose week isn't set", () => {
    expect(
      weeksWorkedOut(
        [
          { code: "paidAbsencesMissing" },
          {
            code: "workWeekUnset",
            userId: "noa",
            weekOf: "2026-10-04",
            used: "five",
          },
          {
            code: "workWeekUnset",
            userId: "yoav",
            weekOf: "2026-10-04",
            used: "six",
          },
          {
            code: "workWeekUnset",
            userId: "noa",
            weekOf: "2026-10-11",
            used: "smaller",
          },
        ],
        "noa",
      ),
    ).toEqual([
      { weekOf: "2026-10-04", used: "five" },
      { weekOf: "2026-10-11", used: "smaller" },
    ]);
  });
});

describe("a worker's own month", () => {
  it("shows their wages, their adult limits and whether a minor's rule was crossed", () => {
    const own = ownMonthOf(
      month({
        minutes: 600,
        buckets: buckets({ regular: 600 }),
        estimateAgorot: 38_000,
        byWage: [
          {
            agorot: null,
            from: "2026-10-01",
            to: "2026-10-04",
            buckets: NO_BUCKETS,
            amountAgorot: null,
          },
          {
            agorot: 3800,
            from: "2026-10-05",
            to: "2026-10-31",
            buckets: NO_BUCKETS,
            amountAgorot: 38_000,
          },
        ],
        flags: [
          { code: "weeklyRestUnder36", weekOf: "2026-10-11", longest: 1500 },
          { code: "breakMissing", days: 3, dates: ["2026-10-05"] },
          { code: "dayOver12", date: "2026-10-06", minutes: 780 },
          { code: "noWage", from: "2026-10-01" },
        ],
      }),
    );
    expect(own.wages).toEqual([
      { agorot: 3800, from: "2026-10-05", to: "2026-10-31" },
    ]);
    expect(own.missingWage).toBe(true);
    // Only the adults' limits, by day; nothing for a pay holder to check.
    expect(own.limits.map((flag) => flag.code)).toEqual([
      "dayOver12",
      "weeklyRestUnder36",
    ]);
    expect(own.minor).toBe(false);
    expect(own.open).toBe(0);
    expect(
      ownMonthOf(
        month({ flags: [{ code: "minorAfter23", date: "2026-10-06" }] }),
      ).minor,
    ).toBe(true);
  });

  it("says how many of their shifts are still open, which the estimate counts once they end", () => {
    const own = ownMonthOf(
      month({
        minutes: 0,
        openEntries: 1,
        flags: [
          {
            code: "openEntry",
            entryId: "e",
            date: "2026-11-10",
          },
        ],
      }),
    );
    expect(own.open).toBe(1);
    expect(own.minutes).toBe(0);
    // Nothing to estimate yet: the card says the open shift comes later.
    expect(hasEstimate(own)).toBe(false);
    expect(own.limits).toEqual([]);
  });
});
