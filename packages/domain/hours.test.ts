import { describe, expect, it } from "vitest";
import { minutesOf, openingHours, rangeMinutes, timeOfDay } from "./hours";

describe("times of day", () => {
  it("accepts HH:MM on the 24-hour clock only", () => {
    for (const ok of ["00:00", "09:30", "23:59"]) {
      expect(timeOfDay.safeParse(ok).success).toBe(true);
    }
    for (const bad of ["24:00", "9:30", "09:60", "0930", ""]) {
      expect(timeOfDay.safeParse(bad).success).toBe(false);
    }
  });

  it("counts minutes since midnight", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("16:30")).toBe(990);
  });

  it("measures ranges, including past midnight", () => {
    expect(rangeMinutes("09:00", "16:00")).toBe(420);
    expect(rangeMinutes("19:30", "00:00")).toBe(270);
    expect(rangeMinutes("19:00", "01:00")).toBe(360);
  });
});

describe("opening hours", () => {
  it("accepts split days and ranges past midnight", () => {
    const hours = [
      { day: 0, open: "08:00", close: "12:00" },
      { day: 0, open: "18:00", close: "01:00" },
      { day: 6, open: "20:00", close: "23:30" },
    ];
    expect(openingHours.parse(hours)).toEqual(hours);
    expect(openingHours.parse([])).toEqual([]);
  });

  it("refuses overlapping ranges on the same day", () => {
    const result = openingHours.safeParse([
      { day: 1, open: "08:00", close: "16:00" },
      { day: 1, open: "15:00", close: "23:00" },
    ]);
    expect(result.success).toBe(false);
  });

  it("refuses a late range that runs into a later one on the same day", () => {
    const result = openingHours.safeParse([
      { day: 2, open: "22:00", close: "02:00" },
      { day: 2, open: "23:00", close: "23:30" },
    ]);
    expect(result.success).toBe(false);
  });

  it("allows the same hours on different days", () => {
    const result = openingHours.safeParse([
      { day: 1, open: "08:00", close: "16:00" },
      { day: 2, open: "08:00", close: "16:00" },
    ]);
    expect(result.success).toBe(true);
  });

  it("refuses a bad day, a bad time and an empty range", () => {
    for (const range of [
      { day: 7, open: "08:00", close: "16:00" },
      { day: 1, open: "8:00", close: "16:00" },
      { day: 1, open: "10:00", close: "10:00" },
    ]) {
      expect(openingHours.safeParse([range]).success).toBe(false);
    }
  });
});
