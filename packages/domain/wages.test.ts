import { describe, expect, it } from "vitest";
import {
  dayMonthYear,
  firstOfMonth,
  firstOpenDay,
  isDay,
  lastDayOf,
  monthWage,
  parseWageForm,
  type WageRow,
  wageFailureOf,
  wageFromBounds,
  wageHistory,
  wageMissing,
  wageNow,
  wageOn,
  wageStart,
  wagesBetween,
  wageWarning,
  wageWarningFor,
} from "./wages";

const row = (
  id: string,
  agorot: number,
  from: string,
  setAt: string,
  more: Partial<WageRow> = {},
): WageRow => ({
  id,
  agorot,
  from,
  setAt,
  setBy: null,
  note: null,
  ...more,
});

// Noa: 36.00 from 1 October, a raise to 38.00 from 15 October, and a typo
// for 1 November fixed by a second row for the same day.
const NOA = [
  row("a", 3600, "2026-10-01", "2026-09-28T09:00:00.000Z"),
  row("b", 3800, "2026-10-15", "2026-10-14T09:00:00.000Z"),
  row("c", 4800, "2026-11-01", "2026-10-30T09:00:00.000Z"),
  row("d", 4000, "2026-11-01", "2026-10-30T09:05:00.000Z", {
    note: "תיקון",
  }),
];

describe("wageOn", () => {
  it("takes the latest day on or before the date", () => {
    expect(wageOn(NOA, "2026-09-30")).toBeNull();
    expect(wageOn(NOA, "2026-10-01")?.id).toBe("a");
    expect(wageOn(NOA, "2026-10-14")?.id).toBe("a");
    expect(wageOn(NOA, "2026-10-15")?.id).toBe("b");
    expect(wageOn(NOA, "2027-01-01")?.id).toBe("d");
  });

  it("takes the one set last of two for the same day, whatever their order", () => {
    expect(wageOn([...NOA].reverse(), "2026-11-01")?.agorot).toBe(4000);
    expect(wageOn([], "2026-11-01")).toBeNull();
  });
});

describe("wageHistory", () => {
  it("lists every wage newest first, marking the one a later row replaced", () => {
    expect(
      wageHistory(NOA).map((one) => [one.id, one.superseded] as const),
    ).toEqual([
      ["d", false],
      ["c", true],
      ["b", false],
      ["a", false],
    ]);
  });
});

describe("wagesBetween", () => {
  it("gives the month's stretches: the wage it began with, then each change", () => {
    expect(wagesBetween(NOA, "2026-10-01", "2026-10-31")).toEqual([
      { agorot: 3600, since: "2026-10-01" },
      { agorot: 3800, since: "2026-10-15" },
    ]);
    expect(wagesBetween(NOA, "2026-11-01", "2026-11-30")).toEqual([
      { agorot: 4000, since: "2026-11-01" },
    ]);
  });

  it("starts where the first wage does, and skips a change to the same amount", () => {
    const rows = [
      row("a", 3800, "2026-10-10", "2026-10-01T00:00:00.000Z"),
      row("b", 3800, "2026-10-20", "2026-10-01T00:00:00.000Z"),
    ];
    expect(wagesBetween(rows, "2026-10-01", "2026-10-31")).toEqual([
      { agorot: 3800, since: "2026-10-10" },
    ]);
    expect(wagesBetween([], "2026-10-01", "2026-10-31")).toEqual([]);
  });
});

describe("monthWage", () => {
  it("gives a month's stretches, and whether its shifts all have a wage", () => {
    expect(monthWage(NOA, "2026-10", ["2026-10-02", "2026-10-20"])).toEqual({
      spans: [
        { agorot: 3600, since: "2026-10-01" },
        { agorot: 3800, since: "2026-10-15" },
      ],
      missing: null,
    });
    const late = [row("a", 3800, "2026-10-10", "2026-10-01T00:00:00.000Z")];
    expect(monthWage(late, "2026-10", ["2026-10-02"]).missing).toEqual({
      since: "2026-10-10",
    });
    expect(monthWage([], "2026-10", ["2026-10-02"])).toEqual({
      spans: [],
      missing: { since: null },
    });
    expect(monthWage([], "2026-10", []).missing).toBeNull();
  });

  it("knows each month's last day", () => {
    expect(lastDayOf("2026-02")).toBe("2026-02-28");
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
    expect(lastDayOf("2026-10")).toBe("2026-10-31");
    expect(lastDayOf("2026-11")).toBe("2026-11-30");
  });
});

describe("wageNow", () => {
  it("gives the wage today and the next one set to start", () => {
    expect(wageNow(NOA, "2026-10-20")).toEqual({
      current: { agorot: 3800, from: "2026-10-15" },
      next: { agorot: 4000, from: "2026-11-01" },
    });
    expect(wageNow(NOA, "2026-11-10")).toEqual({
      current: { agorot: 4000, from: "2026-11-01" },
      next: null,
    });
    expect(wageNow(NOA, "2026-09-01")).toEqual({
      current: null,
      next: { agorot: 3600, from: "2026-10-01" },
    });
    expect(wageNow([], "2026-09-01")).toEqual({ current: null, next: null });
  });

  it("skips a later day whose wage is the same: a raise taken back is no next", () => {
    // 38.00 from October, a raise to 40.00 set for December, taken back by a
    // later row for the same day with 38.00, and 42.00 from January.
    const rows = [
      row("a", 3800, "2026-10-01", "2026-09-28T09:00:00.000Z"),
      row("b", 4000, "2026-12-01", "2026-11-01T09:00:00.000Z"),
      row("c", 3800, "2026-12-01", "2026-11-02T09:00:00.000Z"),
      row("d", 4200, "2027-01-01", "2026-11-03T09:00:00.000Z"),
    ];
    expect(wageNow(rows, "2026-11-10")).toEqual({
      current: { agorot: 3800, from: "2026-10-01" },
      next: { agorot: 4200, from: "2027-01-01" },
    });
    expect(wageNow(rows.slice(0, 3), "2026-11-10")).toEqual({
      current: { agorot: 3800, from: "2026-10-01" },
      next: null,
    });
    // With no wage today, the first one set to start is the next.
    expect(wageNow(rows.slice(1, 3), "2026-11-10")).toEqual({
      current: null,
      next: { agorot: 3800, from: "2026-12-01" },
    });
  });
});

describe("wageStart and wageMissing", () => {
  it("knows the days with no wage to pay by", () => {
    expect(wageStart(NOA)).toBe("2026-10-01");
    expect(wageStart([])).toBeNull();
    expect(wageMissing(NOA, ["2026-10-02", "2026-10-20"])).toBe(false);
    expect(wageMissing(NOA, ["2026-09-30"])).toBe(true);
    expect(wageMissing([], ["2026-10-02"])).toBe(true);
    expect(wageMissing([], [])).toBe(false);
  });
});

describe("wageFromBounds", () => {
  it("runs from the first of last month to the same day next year", () => {
    expect(wageFromBounds("2026-11-10")).toEqual({
      earliest: "2026-10-01",
      latest: "2027-11-10",
    });
    expect(wageFromBounds("2027-01-31")).toEqual({
      earliest: "2026-12-01",
      latest: "2028-01-31",
    });
  });

  it("ends on the month's last day when next year has no such day", () => {
    expect(wageFromBounds("2028-02-29").latest).toBe("2029-02-28");
  });

  it("starts a new wage on the first of the month unless said", () => {
    expect(firstOfMonth("2026-11-10")).toBe("2026-11-01");
  });
});

describe("parseWageForm", () => {
  const today = "2026-11-10";

  it("reads the amount, the day and the note", () => {
    expect(
      parseWageForm({ amount: "38,50", from: "2026-11-01", note: "  " }, today),
    ).toEqual({ ok: true, agorot: 3850, from: "2026-11-01", note: null });
    expect(
      parseWageForm(
        { amount: "40", from: "2026-10-01", note: " העלאה " },
        today,
      ),
    ).toEqual({ ok: true, agorot: 4000, from: "2026-10-01", note: "העלאה" });
  });

  it("refuses a day before the start a holder set, and only then", () => {
    expect(
      parseWageForm(
        { amount: "38", from: "2026-11-01", note: "" },
        today,
        "2026-11-05",
      ),
    ).toEqual({ ok: false, errors: { from: "beforeStart" } });
    expect(
      parseWageForm(
        { amount: "38", from: "2026-11-05", note: "" },
        today,
        "2026-11-05",
      ).ok,
    ).toBe(true);
  });

  it("refuses a day of a closed month (payroll P9), and only then", () => {
    expect(
      parseWageForm(
        { amount: "38", from: "2026-10-15", note: "" },
        today,
        null,
        ["2026-10"],
      ),
    ).toEqual({ ok: false, errors: { from: "closed" } });
    expect(
      parseWageForm(
        { amount: "38", from: "2026-11-01", note: "" },
        today,
        null,
        ["2026-10"],
      ).ok,
    ).toBe(true);
  });

  it("says what is wrong with each field at once", () => {
    expect(
      parseWageForm({ amount: "38.505", from: "2026-09-30", note: "" }, today),
    ).toEqual({ ok: false, errors: { amount: "invalid", from: "tooEarly" } });
    expect(
      parseWageForm({ amount: "0", from: "2027-11-11", note: "" }, today),
    ).toEqual({ ok: false, errors: { amount: "zero", from: "tooLate" } });
    expect(
      parseWageForm(
        { amount: "1000.01", from: "2026-02-30", note: "x".repeat(201) },
        today,
      ),
    ).toEqual({
      ok: false,
      errors: { amount: "tooHigh", from: "invalid", note: "tooLong" },
    });
  });

  it("starts a wage at the earliest after the closed months", () => {
    expect(firstOpenDay("2026-10-01", [])).toBe("2026-10-01");
    expect(firstOpenDay("2026-10-01", ["2026-10"])).toBe("2026-11-01");
    expect(firstOpenDay("2026-12-01", ["2026-12", "2027-01"])).toBe(
      "2027-02-01",
    );
    expect(firstOpenDay("2026-10-01", ["2026-11"])).toBe("2026-10-01");
  });

  it("takes the bounds themselves", () => {
    expect(
      parseWageForm({ amount: "1000", from: "2026-10-01", note: "" }, today).ok,
    ).toBe(true);
    expect(
      parseWageForm({ amount: "0.01", from: "2027-11-10", note: "" }, today).ok,
    ).toBe(true);
  });
});

describe("wageWarning", () => {
  it("warns under the adult minimum of the day", () => {
    expect(wageWarning(3000, "2026-11-01")).toEqual({
      minimum: 3540,
      tableFrom: "2026-04-01",
      band: "adult",
    });
    expect(wageWarning(3540, "2026-11-01")).toBeNull();
  });

  it("warns when a later minimum overtakes a wage that still stands", () => {
    // 35.00 was above 34.32 in March 2026, and is under 35.40 from April.
    expect(wageWarning(3500, "2026-03-01")).toEqual({
      minimum: 3540,
      tableFrom: "2026-04-01",
      band: "adult",
    });
    expect(wageWarning(3400, "2026-03-01")?.tableFrom).toBe("2025-04-01");
  });

  it("reads a minor's minimum for their band", () => {
    expect(wageWarning(3000, "2026-11-01", "17")).toEqual({
      minimum: 3092,
      tableFrom: "2026-04-01",
      band: "17",
    });
    expect(wageWarning(3000, "2026-11-01", "16")).toBeNull();
  });

  it("has nothing to say before the table starts, until a row does", () => {
    expect(wageWarning(100, "2020-01-01")?.tableFrom).toBe("2025-04-01");
    expect(wageWarning(100, "2020-01-01", "adult", [])).toBeNull();
  });
});

describe("wageWarningFor", () => {
  it("is the adult warning without an age", () => {
    expect(wageWarningFor(3000, "2026-11-01", null)).toEqual(
      wageWarning(3000, "2026-11-01"),
    );
  });

  it("reads the band on the day the wage starts", () => {
    // 18 on 1 May 2027: 17 from 1 May 2026.
    expect(wageWarningFor(3000, "2026-11-01", "2027-05-01")).toEqual({
      minimum: 3092,
      tableFrom: "2026-04-01",
      band: "17",
    });
    expect(wageWarningFor(3100, "2026-11-01", "2027-05-01")?.band).toBe(
      "adult",
    );
  });

  it("warns from the birthday that moves them up past the wage", () => {
    // Above 17's 30.92 now, under the adult 35.40 from their 18th birthday.
    expect(wageWarningFor(3100, "2026-11-01", "2027-05-01")).toEqual({
      minimum: 3540,
      tableFrom: "2027-05-01",
      band: "adult",
    });
    expect(wageWarningFor(3540, "2026-11-01", "2027-05-01")).toBeNull();
  });

  it("warns under 16 from before the 16th birthday", () => {
    expect(wageWarningFor(2600, "2026-11-01", "2029-01-01")).toEqual({
      minimum: 2607,
      tableFrom: "2026-04-01",
      band: "under16",
    });
  });
});

describe("wageFailureOf", () => {
  it("reads the database's refusals", () => {
    expect(wageFailureOf("42501", "Someone else sets your own wage")).toBe(
      "ownWage",
    );
    expect(wageFailureOf("42501", "Only an owner sets an owner's wage")).toBe(
      "ownerOnly",
    );
    expect(wageFailureOf("42501", "Pay holders only")).toBe("noAccess");
    expect(wageFailureOf("P0002", "Not in the team")).toBe("notInTeam");
    expect(wageFailureOf("22023", "An accountant has no hours here")).toBe(
      "notStaff",
    );
    expect(
      wageFailureOf("22023", "From the start of last month at the earliest"),
    ).toBe("tooEarly");
    expect(wageFailureOf("22023", "At most a year ahead")).toBe("tooLate");
    expect(wageFailureOf("22023", "Before they started")).toBe("beforeStart");
    expect(wageFailureOf("55000", "The month is closed")).toBe("monthClosed");
    expect(wageFailureOf("55000", "Something else")).toBe("failed");
    expect(wageFailureOf("22023", "A wage is 0.01 to 1,000.00")).toBe(
      "invalid",
    );
    expect(wageFailureOf("XX000")).toBe("failed");
  });
});

describe("dates", () => {
  it("knows a real day", () => {
    expect(isDay("2026-11-01")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("1.11.2026")).toBe(false);
    expect(isDay(null)).toBe(false);
  });

  it("writes a day in full", () => {
    expect(dayMonthYear("2026-11-01")).toBe("1.11.2026");
  });
});
