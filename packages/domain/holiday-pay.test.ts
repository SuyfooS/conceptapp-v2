import { describe, expect, it } from "vitest";
import { instantIn } from "./availability";
import {
  addMonthsToDay,
  historyMonths,
  holidayPayLines,
  lineInWeek,
  payrollHistory,
  wouldHaveWorked,
} from "./holiday-pay";
import type { PayrollHistory, PayrollPerson } from "./payroll";
import type { Holiday, OneOffRestDay } from "./payroll-calendar";
import { PAYROLL_READINGS } from "./payroll-readings";
import type { TimeEntry } from "./time-clock";

const TZ = "Asia/Jerusalem";
const ID = "11111111-1111-4111-a111-111111111111";

/** A holiday or one-off day; its window doesn't matter to its pay. */
const holiday = (key: Holiday["key"], date: string): Holiday => ({
  key,
  date,
  eve: date,
  window: { from: 0, to: 0 },
});
const election: OneOffRestDay = {
  key: "knesset_2026",
  date: "2026-10-27",
  window: { from: 0, to: 0 },
};

function person(overrides: Partial<PayrollPerson> = {}): PayrollPerson {
  return {
    userId: ID,
    payrollNumber: "101",
    restDay: 6,
    hoursLaw: "applies",
    youthUntil: null,
    compulsoryEducation: true,
    periods: [{ startedOn: "2026-05-01", endedOn: null }],
    wages: [
      { agorot: 4000, from: "2026-05-01", setAt: "2026-05-01T08:00:00Z" },
    ],
    ...overrides,
  };
}

const history = (
  weekdays: Partial<PayrollHistory["weekdays"]>,
): PayrollHistory => ({
  minutes: 27_000,
  days: 60,
  weeks: 13,
  weekdays: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, ...weekdays },
});

const lines = (args: Partial<Parameters<typeof holidayPayLines>[0]>) =>
  holidayPayLines({
    holidays: [],
    oneOffRestDays: [],
    person: person(),
    workedDates: new Set(),
    history: history({ 1: 10, 2: 10, 5: 10, 6: 10 }),
    ...args,
  });

describe("holiday pay (plan §13 C18)", () => {
  it("pays Yom Kippur at the average day, Kol Zchut's example", () => {
    expect(lines({ holidays: [holiday("yom_kippur", "2026-09-21")] })).toEqual([
      {
        date: "2026-09-21",
        holiday: "yom_kippur",
        oneOffRestDay: null,
        averageMinutes: 450,
        agorot: 30_000,
        check: ["adjacentDays", "averagePeriod"],
      },
    ]);
  });

  it("says to check when the weekday isn't one of theirs", () => {
    const [line] = lines({
      holidays: [holiday("yom_kippur", "2026-09-21")],
      history: history({ 1: 3 }),
    });
    expect(line?.check).toEqual([
      "adjacentDays",
      "averagePeriod",
      "wasScheduled",
    ]);
    expect(line?.agorot).toBe(30_000);
  });

  it("is never on the person's rest day: Saturday for most", () => {
    expect(
      lines({
        holidays: [
          holiday("rosh_hashana_1", "2026-09-12"),
          holiday("sukkot", "2026-09-26"),
        ],
      }),
    ).toEqual([]);
  });

  it("is on a Saturday for someone resting on Friday, who may keep their own holidays", () => {
    const [line] = lines({
      person: person({ restDay: 5 }),
      holidays: [holiday("rosh_hashana_1", "2026-09-12")],
    });
    expect(line?.check).toEqual([
      "adjacentDays",
      "averagePeriod",
      "ownHolidays",
    ]);
    // And never on their own rest day.
    expect(
      lines({
        person: person({ restDay: 5 }),
        holidays: [holiday("shavuot", "2027-06-11")],
      }),
    ).toEqual([]);
    // Under the other reading of §14 (lawyer 1), no Jewish holiday is theirs.
    expect(
      holidayPayLines(
        {
          holidays: [holiday("rosh_hashana_1", "2026-09-12")],
          oneOffRestDays: [],
          person: person({ restDay: 5 }),
          workedDates: new Set(),
          history: history({ 6: 10 }),
        },
        { ...PAYROLL_READINGS, holidaysForOtherRestDays: false },
      ),
    ).toEqual([]);
  });

  it("is on a Friday for someone who works Fridays (Shavuot 5787)", () => {
    const [line] = lines({ holidays: [holiday("shavuot", "2027-06-11")] });
    expect(line?.holiday).toBe("shavuot");
    expect(line?.check).toEqual(["adjacentDays", "averagePeriod"]);
  });

  it("needs 3 months with the employer by then", () => {
    expect(
      lines({
        person: person({
          periods: [{ startedOn: "2026-07-01", endedOn: null }],
        }),
        holidays: [holiday("yom_kippur", "2026-09-21")],
      }),
    ).toEqual([]);
    expect(
      lines({
        person: person({
          periods: [{ startedOn: "2026-06-21", endedOn: null }],
        }),
        holidays: [holiday("yom_kippur", "2026-09-21")],
      }),
    ).toHaveLength(1);
  });

  it("counts from the first period, and not after they left", () => {
    const rehired = person({
      periods: [
        { startedOn: "2025-01-01", endedOn: "2025-12-31" },
        { startedOn: "2026-09-01", endedOn: null },
      ],
    });
    expect(
      lines({
        person: rehired,
        holidays: [holiday("yom_kippur", "2026-09-21")],
      }),
    ).toHaveLength(1);
    expect(
      lines({
        person: person({
          periods: [{ startedOn: "2026-01-01", endedOn: "2026-09-15" }],
        }),
        holidays: [holiday("yom_kippur", "2026-09-21")],
      }),
    ).toEqual([]);
  });

  it("isn't owed for a holiday they worked", () => {
    expect(
      lines({
        holidays: [holiday("yom_kippur", "2026-09-21")],
        workedDates: new Set(["2026-09-21"]),
      }),
    ).toEqual([]);
  });

  it("has no amount without a history or a wage", () => {
    const [line] = lines({
      holidays: [holiday("yom_kippur", "2026-09-21")],
      history: undefined,
    });
    expect(line).toMatchObject({ averageMinutes: null, agorot: null });
    expect(line?.check).toEqual([
      "adjacentDays",
      "averagePeriod",
      "wasScheduled",
      "noHistory",
    ]);
    const [unpaid] = lines({
      person: person({
        wages: [
          { agorot: 4000, from: "2026-10-01", setAt: "2026-10-01T08:00:00Z" },
        ],
      }),
      holidays: [holiday("yom_kippur", "2026-09-21")],
    });
    expect(unpaid).toMatchObject({ averageMinutes: 450, agorot: null });
  });
});

describe("one-off rest-day pay (plan §13 C29)", () => {
  it("pays election day to someone who would have worked it", () => {
    expect(
      lines({
        person: person({
          wages: [
            { agorot: 3800, from: "2026-05-01", setAt: "2026-05-01T08:00:00Z" },
          ],
        }),
        oneOffRestDays: [election],
      }),
    ).toEqual([
      {
        date: "2026-10-27",
        holiday: null,
        oneOffRestDay: "knesset_2026",
        averageMinutes: 450,
        agorot: 28_500,
        check: ["averagePeriod", "fourteenDays", "sectorExclusion"],
      },
    ]);
  });

  it("needs no 3 months, only to be employed that day", () => {
    expect(
      lines({
        person: person({
          periods: [{ startedOn: "2026-10-01", endedOn: null }],
        }),
        oneOffRestDays: [election],
      }),
    ).toHaveLength(1);
    expect(
      lines({
        person: person({
          periods: [{ startedOn: "2026-10-28", endedOn: null }],
        }),
        oneOffRestDays: [election],
      }),
    ).toEqual([]);
  });
});

describe("would have worked", () => {
  it("is at least half the weeks they worked", () => {
    expect(wouldHaveWorked(history({ 1: 7 }), 1)).toBe(true);
    expect(wouldHaveWorked(history({ 1: 6 }), 1)).toBe(false);
    expect(wouldHaveWorked({ ...history({ 1: 1 }), weeks: 2 }, 1)).toBe(true);
    expect(wouldHaveWorked(undefined, 1)).toBeNull();
  });
});

let next = 0;
function entry(from: string, to: string | null, userId = ID): TimeEntry {
  next += 1;
  const [fromDate = "", fromTime = ""] = from.split(" ");
  const [toDate = "", toTime = ""] = (to ?? "").split(" ");
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    userId,
    clockIn: instantIn(fromDate, fromTime, TZ).toISOString(),
    clockOut: to === null ? null : instantIn(toDate, toTime, TZ).toISOString(),
    source: "punch",
    breaks: [],
    inProof: null,
    outProof: null,
    confirmedAt: null,
    note: null,
    editedBy: null,
    editedAt: null,
    createdAt: null,
  };
}

describe("a person's history", () => {
  it("is the 3 months before, by workday and week", () => {
    const entries = [
      entry("2026-07-06 09:00", "2026-07-06 17:00"), // Monday
      entry("2026-07-07 09:00", "2026-07-07 13:00"), // Tuesday, same week
      entry("2026-07-07 18:00", "2026-07-07 20:00"), // the same Tuesday again
      entry("2026-08-03 09:00", "2026-08-03 17:00"), // a Monday in another week
      entry("2026-09-30 22:00", "2026-10-01 02:00"), // Wednesday night, September's
      entry("2026-06-29 09:00", "2026-06-29 17:00"), // June: before the history
      entry("2026-10-05 09:00", "2026-10-05 17:00"), // October: the month itself
      entry("2026-09-14 09:00", null), // open: nothing to count
      entry("2026-07-08 09:00", "2026-07-08 10:00", "someone-else"),
    ];
    const found = payrollHistory(
      entries,
      "2026-10",
      TZ,
      new Date("2026-11-01T00:00:00Z"),
    );
    expect(found.get(ID)).toEqual({
      minutes: 480 + 240 + 120 + 480 + 240,
      days: 4,
      weeks: 3,
      weekdays: { 0: 0, 1: 2, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0 },
    });
    expect(found.get("someone-else")?.days).toBe(1);
  });

  it("reads the months before the month", () => {
    expect(historyMonths("2026-10")).toEqual({
      from: "2026-07",
      to: "2026-09",
    });
    expect(historyMonths("2027-01")).toEqual({
      from: "2026-10",
      to: "2026-12",
    });
  });
});

describe("days and months", () => {
  it("add months as a calendar does, to the month's last day when needed", () => {
    expect(addMonthsToDay("2026-05-01", 3)).toBe("2026-08-01");
    expect(addMonthsToDay("2026-05-31", 3)).toBe("2026-08-31");
    expect(addMonthsToDay("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsToDay("2027-11-30", 3)).toBe("2028-02-29");
  });

  it("place a line in its week", () => {
    const [line] = lines({ holidays: [holiday("yom_kippur", "2026-09-21")] });
    if (!line) throw new Error("no line");
    expect(lineInWeek(line, "2026-09-20")).toBe(true);
    expect(lineInWeek(line, "2026-09-13")).toBe(false);
  });
});
