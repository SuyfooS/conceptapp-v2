import { describe, expect, it } from "vitest";
import { datePartsOf, isEmptyDate, parseTypedDate } from "./typed-date";

describe("parseTypedDate", () => {
  it("reads a day, a month and a year", () => {
    expect(parseTypedDate({ day: "15", month: "4", year: "2009" })).toEqual({
      ok: true,
      date: "2009-04-15",
    });
    expect(parseTypedDate({ day: "01", month: "03", year: "2026" })).toEqual({
      ok: true,
      date: "2026-03-01",
    });
  });

  it("takes digits from any keyboard, and spaces around them", () => {
    expect(parseTypedDate({ day: " ١٥ ", month: "٤", year: "۲۰۰۹" })).toEqual({
      ok: true,
      date: "2009-04-15",
    });
  });

  it("refuses a day the calendar doesn't have", () => {
    expect(parseTypedDate({ day: "30", month: "2", year: "2009" })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(parseTypedDate({ day: "29", month: "2", year: "2025" }).ok).toBe(
      false,
    );
    expect(parseTypedDate({ day: "29", month: "2", year: "2024" })).toEqual({
      ok: true,
      date: "2024-02-29",
    });
    expect(parseTypedDate({ day: "1", month: "13", year: "2024" }).ok).toBe(
      false,
    );
    expect(parseTypedDate({ day: "0", month: "1", year: "2024" }).ok).toBe(
      false,
    );
  });

  it("refuses a short year or letters", () => {
    expect(parseTypedDate({ day: "1", month: "1", year: "09" }).ok).toBe(false);
    expect(parseTypedDate({ day: "a", month: "1", year: "2009" }).ok).toBe(
      false,
    );
  });

  it("says when nothing was typed", () => {
    expect(parseTypedDate({ day: "", month: " ", year: "" })).toEqual({
      ok: false,
      error: "empty",
    });
    expect(isEmptyDate({ day: "", month: "", year: "2009" })).toBe(false);
  });
});

describe("datePartsOf", () => {
  it("shows a day in the three fields, without leading zeros", () => {
    expect(datePartsOf("2026-03-01")).toEqual({
      day: "1",
      month: "3",
      year: "2026",
    });
    expect(datePartsOf(null)).toEqual({ day: "", month: "", year: "" });
  });
});
