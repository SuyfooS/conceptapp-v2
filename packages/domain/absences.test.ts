import { describe, expect, it } from "vitest";
import {
  absenceDates,
  absenceDays,
  absenceDaysByKind,
  absenceFailureOf,
  absenceStartFor,
  awayByDay,
  awayOn,
  awayToday,
  canRecordAbsence,
  daysApart,
  liveAbsences,
  parseAbsence,
  shiftsOnAbsence,
} from "./absences";

const TODAY = "2026-11-24";
const values = (over: Partial<Parameters<typeof parseAbsence>[0]> = {}) => ({
  kind: "vacation",
  from: "2026-12-03",
  to: "2026-12-05",
  note: "",
  ...over,
});

describe("a record from the form", () => {
  it("keeps the kind, the days and the note trimmed, an empty note as none", () => {
    expect(parseAbsence(values({ note: "  certificate  " }), TODAY)).toEqual({
      ok: true,
      value: {
        kind: "vacation",
        from: "2026-12-03",
        to: "2026-12-05",
        note: "certificate",
      },
    });
    expect(parseAbsence(values({ note: "   " }), TODAY)).toMatchObject({
      ok: true,
      value: { note: null },
    });
  });

  it("takes only the four kinds", () => {
    for (const kind of ["vacation", "sick", "reserve", "other"]) {
      expect(parseAbsence(values({ kind }), TODAY).ok).toBe(true);
    }
    expect(parseAbsence(values({ kind: "holiday" }), TODAY)).toEqual({
      ok: false,
      problem: "kind",
    });
  });

  it("needs both days, real ones, the last on or after the first", () => {
    expect(parseAbsence(values({ to: "" }), TODAY)).toEqual({
      ok: false,
      problem: "dates",
    });
    expect(parseAbsence(values({ from: "2026-02-30" }), TODAY)).toEqual({
      ok: false,
      problem: "dates",
    });
    expect(
      parseAbsence(values({ from: "2026-12-05", to: "2026-12-04" }), TODAY),
    ).toEqual({ ok: false, problem: "order" });
    expect(
      parseAbsence(values({ from: "2026-12-05", to: "2026-12-05" }), TODAY).ok,
    ).toBe(true);
  });

  it("takes at most 366 days at a time, as the database does", () => {
    // 25.11.2026 to 25.11.2027 is 365 days apart, 366 days in all.
    expect(
      parseAbsence(values({ from: "2026-11-25", to: "2027-11-25" }), TODAY).ok,
    ).toBe(true);
    expect(
      parseAbsence(values({ from: "2026-11-24", to: "2027-11-25" }), TODAY),
    ).toEqual({ ok: false, problem: "tooLong" });
  });

  it("reaches a year back and a year ahead of today, to the day", () => {
    expect(
      parseAbsence(values({ from: "2025-11-23", to: "2025-11-23" }), TODAY).ok,
    ).toBe(true);
    expect(
      parseAbsence(values({ from: "2025-11-22", to: "2025-11-23" }), TODAY),
    ).toEqual({ ok: false, problem: "tooFar" });
    expect(
      parseAbsence(values({ from: "2027-11-25", to: "2027-11-25" }), TODAY).ok,
    ).toBe(true);
    expect(
      parseAbsence(values({ from: "2027-11-25", to: "2027-11-26" }), TODAY),
    ).toEqual({ ok: false, problem: "tooFar" });
  });

  it("takes a note of 200 characters, counted as Postgres counts them", () => {
    expect(parseAbsence(values({ note: "x".repeat(200) }), TODAY).ok).toBe(
      true,
    );
    expect(parseAbsence(values({ note: "x".repeat(201) }), TODAY)).toEqual({
      ok: false,
      problem: "note",
    });
    // 200 emoji are 400 UTF-16 units and 200 characters.
    expect(parseAbsence(values({ note: "🙂".repeat(200) }), TODAY).ok).toBe(
      true,
    );
  });
});

describe("days away", () => {
  const vacation = {
    kind: "vacation" as const,
    from: "2026-11-29",
    to: "2026-12-02",
  };
  const sick = { kind: "sick" as const, from: "2026-12-10", to: "2026-12-10" };

  it("are counted by the calendar, clipped to a month", () => {
    expect(daysApart("2026-11-29", "2026-12-02")).toBe(3);
    expect(absenceDays(vacation)).toBe(4);
    expect(
      absenceDays(vacation, { from: "2026-12-01", to: "2026-12-31" }),
    ).toBe(2);
    expect(
      absenceDays(vacation, { from: "2027-01-01", to: "2027-01-31" }),
    ).toBe(0);
    // A leap year's February holds 29.
    expect(
      absenceDays(
        { from: "2028-02-01", to: "2028-03-01" },
        { from: "2028-02-01", to: "2028-02-29" },
      ),
    ).toBe(29);
  });

  it("are summed by kind in a month, every kind there", () => {
    expect(absenceDaysByKind([vacation, sick], "2026-12")).toEqual({
      vacation: 2,
      sick: 1,
      reserve: 0,
      other: 0,
    });
    expect(absenceDaysByKind([vacation, sick], "2026-11")).toEqual({
      vacation: 2,
      sick: 0,
      reserve: 0,
      other: 0,
    });
  });

  it("are listed date by date, with their kind, inside the days asked", () => {
    expect(absenceDates([sick, vacation], "2026-12-01", "2026-12-31")).toEqual([
      { date: "2026-12-01", kind: "vacation" },
      { date: "2026-12-02", kind: "vacation" },
      { date: "2026-12-10", kind: "sick" },
    ]);
  });

  it("leave out removed records", () => {
    expect(
      liveAbsences([
        { id: "a", removedAt: null },
        { id: "b", removedAt: "2026-11-24T10:00:00Z" },
      ]).map((row) => row.id),
    ).toEqual(["a"]);
  });
});

describe("who is away", () => {
  const spans = [
    { userId: "noa", from: "2026-11-23", to: "2026-11-25" },
    { userId: "noa", from: "2026-11-26", to: "2026-11-27" },
    { userId: "yoav", from: "2026-11-24", to: "2026-11-24" },
    { userId: "dana", from: "2026-11-28", to: "2026-11-30" },
  ];

  it("on a day, and day by day", () => {
    expect(awayOn(spans, "noa", "2026-11-26")).toBe(true);
    expect(awayOn(spans, "yoav", "2026-11-25")).toBe(false);
    const byDay = awayByDay(spans, ["2026-11-24", "2026-11-28", "2026-12-01"]);
    expect(byDay.get("2026-11-24")).toEqual(["noa", "yoav"]);
    expect(byDay.get("2026-11-28")).toEqual(["dana"]);
    expect(byDay.get("2026-12-01")).toEqual([]);
  });

  it("today, each until the last day of records that run on", () => {
    expect(awayToday(spans, "2026-11-24")).toEqual([
      { userId: "noa", until: "2026-11-27" },
      { userId: "yoav", until: "2026-11-24" },
    ]);
    expect(awayToday(spans, "2026-12-01")).toEqual([]);
  });
});

describe("who records days away", () => {
  const manager = { role: "manager" as const, perms: ["clock.edit"] };
  const owner = { role: "owner" as const, perms: [] };
  const worker = { role: "worker" as const, perms: [] };

  it("is whoever edits the clock, for someone else, or an owner for themselves too", () => {
    expect(canRecordAbsence(manager, "shiran", "noa")).toBe(true);
    expect(canRecordAbsence(manager, "shiran", "shiran")).toBe(false);
    expect(canRecordAbsence(owner, "orel", "orel")).toBe(true);
    expect(canRecordAbsence(worker, "noa", "yoav")).toBe(false);
  });
});

describe("the shifts still on a record's days", () => {
  it("are counted from today on, with the first one's day for the builder's week", () => {
    const days = ["2026-11-29", "2026-11-23", "2026-11-24", "2026-12-02"];
    // Today's shift tonight leads: the builder opens this week, not the next.
    expect(
      shiftsOnAbsence(days, { from: "2026-11-23", to: "2026-11-30" }, TODAY),
    ).toEqual({ count: 2, first: "2026-11-24" });
    expect(
      shiftsOnAbsence(days, { from: "2026-11-25", to: "2026-11-28" }, TODAY),
    ).toEqual({ count: 0, first: null });
  });
});

describe("the form's first day", () => {
  it("is today in today's month, else the month's first", () => {
    expect(absenceStartFor("2026-11", TODAY)).toBe(TODAY);
    expect(absenceStartFor("2026-12", TODAY)).toBe("2026-12-01");
  });
});

describe("a refusal", () => {
  it("is said by its code and hint", () => {
    expect(absenceFailureOf("23P01")).toBe("overlap");
    expect(absenceFailureOf("42501", "own")).toBe("ownAbsence");
    expect(absenceFailureOf("42501")).toBe("noAccess");
    expect(absenceFailureOf("55000", "month_closed")).toBe("monthClosed");
    expect(absenceFailureOf("55000", "not_on_staff")).toBe("notOnStaff");
    expect(absenceFailureOf("55000", "removed")).toBe("removed");
    expect(absenceFailureOf("55000", "not_removed")).toBe("notRemoved");
    expect(absenceFailureOf("55000", "too_late")).toBe("tooLate");
    expect(absenceFailureOf("22023", "too_long")).toBe("tooLong");
    expect(absenceFailureOf("22023", "too_far")).toBe("tooFar");
    expect(absenceFailureOf("22023", "note")).toBe("note");
    expect(absenceFailureOf("22023", "toString")).toBe("failed");
    expect(absenceFailureOf("55000")).toBe("failed");
    // A business a demo reset replaced while the record waited: sent again.
    expect(absenceFailureOf("P0002")).toBe("failed");
    expect(absenceFailureOf(undefined)).toBe("failed");
  });
});
