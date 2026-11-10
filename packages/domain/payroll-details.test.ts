import { describe, expect, it } from "vitest";
import {
  currentPeriod,
  DEFAULT_DETAILS,
  type DetailsForm,
  detailsFailureOf,
  detailsOf,
  type EmploymentPeriod,
  overlapsAny,
  type PeriodForm,
  parseBirth,
  parseDetailsForm,
  parsePeriodForm,
  periodsOf,
  REST_DAYS,
  spansOverlap,
  wageFloorOf,
} from "./payroll-details";
import { EMPTY_DATE } from "./typed-date";

const TODAY = "2026-11-10";

const form = (over: Partial<DetailsForm> = {}): DetailsForm => ({
  payrollNumber: "102",
  restDay: "6",
  hoursLaw: "applies",
  compulsoryEducation: true,
  birth: EMPTY_DATE,
  ...over,
});

const period = (
  id: string,
  startedOn: string,
  endedOn: string | null,
  source: "set" | "joined" = "set",
): EmploymentPeriod => ({ id, startedOn, endedOn, lastPaidOn: null, source });

describe("detailsOf", () => {
  it("reads a row", () => {
    expect(
      detailsOf({
        payroll_number: "102",
        rest_day: 5,
        hours_law: "unsupervised",
        youth_until: "2027-04-15",
        compulsory_education: false,
      }),
    ).toEqual({
      payrollNumber: "102",
      restDay: 5,
      hoursLaw: "unsupervised",
      youthUntil: "2027-04-15",
      compulsoryEducation: false,
    });
  });

  it("is the defaults without a row, and for what doesn't read", () => {
    expect(detailsOf(null)).toEqual(DEFAULT_DETAILS);
    expect(detailsOf({ rest_day: 3, hours_law: "boss" })).toEqual(
      DEFAULT_DETAILS,
    );
    expect(REST_DAYS).toEqual([6, 5, 0]);
  });
});

describe("parseDetailsForm", () => {
  it("sends every field, a cleared number as null", () => {
    expect(parseDetailsForm(form(), TODAY, { birth: false })).toEqual({
      ok: true,
      patch: {
        payroll_number: "102",
        rest_day: 6,
        hours_law: "applies",
        compulsory_education: true,
      },
      youthUntil: undefined,
    });
    const cleared = parseDetailsForm(form({ payrollNumber: "  " }), TODAY, {
      birth: false,
    });
    expect(cleared.ok && cleared.patch.payroll_number).toBeNull();
  });

  it("reads a number from any keyboard: a maqaf or an en dash is a dash", () => {
    const dashed = parseDetailsForm(form({ payrollNumber: " 102–7 " }), TODAY, {
      birth: false,
    });
    expect(dashed.ok && dashed.patch.payroll_number).toBe("102-7");
    const maqaf = parseDetailsForm(form({ payrollNumber: "١٠٢־7" }), TODAY, {
      birth: false,
    });
    expect(maqaf.ok && maqaf.patch.payroll_number).toBe("102-7");
    const hebrew = parseDetailsForm(form({ payrollNumber: "א102" }), TODAY, {
      birth: false,
    });
    expect(hebrew).toEqual({ ok: false, errors: { payrollNumber: "invalid" } });
  });

  it("sends a birth date only when allowed and typed, with the age it makes", () => {
    const birth = { day: "15", month: "4", year: "2009" };
    expect(parseDetailsForm(form({ birth }), TODAY, { birth: true })).toEqual({
      ok: true,
      patch: {
        payroll_number: "102",
        rest_day: 6,
        hours_law: "applies",
        compulsory_education: true,
        birth_date: "2009-04-15",
      },
      youthUntil: "2027-04-15",
    });
    const adult = parseDetailsForm(
      form({ birth: { day: "1", month: "1", year: "2000" } }),
      TODAY,
      { birth: true },
    );
    expect(adult.ok && adult.youthUntil).toBeNull();
    const notAllowed = parseDetailsForm(form({ birth }), TODAY, {
      birth: false,
    });
    expect(notAllowed.ok && "birth_date" in notAllowed.patch).toBe(false);
  });

  it("says everything wrong at once", () => {
    expect(
      parseDetailsForm(
        form({
          payrollNumber: "a b",
          restDay: "3",
          hoursLaw: "boss",
          birth: { day: "30", month: "2", year: "2009" },
        }),
        TODAY,
        { birth: true },
      ),
    ).toEqual({
      ok: false,
      errors: {
        payrollNumber: "invalid",
        restDay: "invalid",
        hoursLaw: "invalid",
        birth: "invalid",
      },
    });
  });

  it("refuses a birth date ahead, or more than 100 years back", () => {
    const ahead = parseDetailsForm(
      form({ birth: { day: "11", month: "11", year: "2026" } }),
      TODAY,
      { birth: true },
    );
    expect(ahead).toEqual({ ok: false, errors: { birth: "future" } });
    const old = parseDetailsForm(
      form({ birth: { day: "9", month: "11", year: "1926" } }),
      TODAY,
      { birth: true },
    );
    expect(old).toEqual({ ok: false, errors: { birth: "tooOld" } });
  });
});

describe("parseBirth", () => {
  it("reads a birth date apart from the rest of the sheet", () => {
    expect(parseBirth({ day: "15", month: "4", year: "2009" }, TODAY)).toEqual({
      ok: true,
      date: "2009-04-15",
    });
    expect(parseBirth(EMPTY_DATE, TODAY)).toEqual({ ok: true, date: null });
    expect(parseBirth({ day: "30", month: "2", year: "2009" }, TODAY)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(parseBirth({ day: "11", month: "11", year: "2026" }, TODAY)).toEqual(
      { ok: false, error: "future" },
    );
    expect(parseBirth({ day: "9", month: "11", year: "1926" }, TODAY)).toEqual({
      ok: false,
      error: "tooOld",
    });
  });
});

describe("detailsFailureOf", () => {
  it("reads the database's refusals", () => {
    expect(
      detailsFailureOf("42501", "Someone else sets your own details"),
    ).toBe("ownDetails");
    expect(
      detailsFailureOf("42501", "Only an owner sets an owner's period"),
    ).toBe("ownerOnly");
    expect(
      detailsFailureOf(
        "42501",
        "Only an owner or the accountant enters a birth date",
      ),
    ).toBe("birthNotAllowed");
    expect(detailsFailureOf("42501", "Pay holders only")).toBe("noAccess");
    expect(detailsFailureOf("P0002", "Not in the team")).toBe("notInTeam");
    expect(detailsFailureOf("P0002", "Unknown period")).toBe("unknownPeriod");
    expect(detailsFailureOf("22023", "An accountant has no hours here")).toBe(
      "notStaff",
    );
    expect(detailsFailureOf("23505")).toBe("numberTaken");
    expect(detailsFailureOf("23P01", "Periods overlap")).toBe("overlap");
    expect(detailsFailureOf("23514")).toBe("invalid");
    expect(detailsFailureOf(undefined)).toBe("failed");
  });
});

describe("periods", () => {
  it("read oldest first, leaving out what doesn't read", () => {
    expect(
      periodsOf([
        {
          id: "b",
          started_on: "2026-03-01",
          ended_on: null,
          last_paid_on: null,
          source: "joined",
        },
        {
          id: "a",
          started_on: "2025-01-01",
          ended_on: "2025-12-31",
          last_paid_on: "2026-01-10",
          source: "set",
        },
        { id: "c", started_on: "soon" },
      ]).map((p) => p.id),
    ).toEqual(["a", "b"]);
  });

  it("overlap when they share a day, both ends counting", () => {
    const year = { from: "2025-01-01", to: "2025-12-31" };
    expect(spansOverlap(year, { from: "2025-12-31", to: null })).toBe(true);
    expect(spansOverlap(year, { from: "2026-01-01", to: null })).toBe(false);
    expect(spansOverlap({ from: "2026-03-01", to: null }, year)).toBe(false);
    expect(spansOverlap({ from: "2024-06-01", to: "2025-01-01" }, year)).toBe(
      true,
    );
    expect(
      spansOverlap(
        { from: "2026-03-01", to: null },
        {
          from: "2027-01-01",
          to: null,
        },
      ),
    ).toBe(true);
  });

  it("leave the one being changed out", () => {
    const periods = [period("a", "2026-03-01", null)];
    expect(overlapsAny(periods, { from: "2026-02-01", to: null })).toBe(true);
    expect(overlapsAny(periods, { from: "2026-02-01", to: null }, "a")).toBe(
      false,
    );
  });

  it("show the one today is in, else the one that ends last", () => {
    const left = period("a", "2025-01-01", "2025-12-31");
    const now = period("b", "2026-03-01", null);
    expect(currentPeriod([left, now], TODAY)?.id).toBe("b");
    expect(currentPeriod([left], TODAY)?.id).toBe("a");
    expect(
      currentPeriod([period("c", "2027-01-01", null), left], TODAY)?.id,
    ).toBe("c");
    expect(currentPeriod([], TODAY)).toBeNull();
  });

  it("limit a wage's start only when a holder set the first one", () => {
    expect(
      wageFloorOf([
        period("b", "2026-03-01", null, "joined"),
        period("a", "2025-01-01", "2025-12-31", "set"),
      ]),
    ).toBe("2025-01-01");
    expect(wageFloorOf([period("b", "2026-11-10", null, "joined")])).toBeNull();
    expect(wageFloorOf([])).toBeNull();
  });
});

describe("parsePeriodForm", () => {
  const typed = (date: string) => {
    const [year = "", month = "", day = ""] = date.split("-");
    return { day, month, year };
  };
  const input = (
    from: string,
    to: string | null = null,
    paid: string | null = null,
  ): PeriodForm => ({
    from: typed(from),
    to: to ? typed(to) : EMPTY_DATE,
    paid: paid ? typed(paid) : EMPTY_DATE,
  });
  const others = [period("a", "2025-01-01", "2025-12-31")];

  it("reads a start, and an end with the last payment", () => {
    expect(parsePeriodForm(input("2026-03-01"), TODAY, others)).toEqual({
      ok: true,
      from: "2026-03-01",
      to: null,
      paid: null,
    });
    expect(
      parsePeriodForm(
        input("2024-01-01", "2024-06-30", "2024-07-10"),
        TODAY,
        others,
      ),
    ).toEqual({
      ok: true,
      from: "2024-01-01",
      to: "2024-06-30",
      paid: "2024-07-10",
    });
  });

  it("refuses an end before the start, a payment with no end, and a start too far ahead", () => {
    expect(
      parsePeriodForm(input("2024-05-01", "2024-04-01"), TODAY, others),
    ).toEqual({ ok: false, errors: { to: "beforeStart" } });
    expect(
      parsePeriodForm(input("2024-01-01", null, "2024-02-01"), TODAY, others),
    ).toEqual({ ok: false, errors: { paid: "noEnd" } });
    expect(parsePeriodForm(input("2027-11-11"), TODAY, others)).toEqual({
      ok: false,
      errors: { from: "tooLate" },
    });
    expect(
      parsePeriodForm({ ...input("2026-03-01"), from: EMPTY_DATE }, TODAY, []),
    ).toEqual({ ok: false, errors: { from: "empty" } });
  });

  it("refuses one that shares days with another of theirs, but not with itself", () => {
    expect(
      parsePeriodForm(input("2025-06-01", "2026-04-01"), TODAY, others),
    ).toEqual({ ok: false, errors: { overlap: true } });
    expect(
      parsePeriodForm(input("2025-06-01", "2025-12-31"), TODAY, others, "a"),
    ).toEqual({ ok: true, from: "2025-06-01", to: "2025-12-31", paid: null });
  });
});
