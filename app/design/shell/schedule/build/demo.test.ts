import { FILL_WEEK_HOURS, FILL_WEEK_HOURS_MAX } from "@domain/fill-week";
import { describe, expect, it } from "vitest";
import { demoFillWeekHours } from "./demo";

// The twin's `?hours=`: the restaurant's own settings without it, the number
// asked for in place of them with it, and the default, 42, for a number out
// of range or none, as the app reads one stored so.
describe("demoFillWeekHours", () => {
  it("reads the restaurant's settings, which leave it at 42", () => {
    expect(demoFillWeekHours()).toBe(FILL_WEEK_HOURS);
    expect(FILL_WEEK_HOURS).toBe(42);
  });

  it("takes a number from 4 to 58", () => {
    expect(demoFillWeekHours("7")).toBe(7);
    expect(demoFillWeekHours("4")).toBe(4);
    expect(demoFillWeekHours(String(FILL_WEEK_HOURS_MAX))).toBe(58);
  });

  it("reads anything else as the default, never as what was asked", () => {
    for (const asked of ["3", "59", "99", "7.5", "", "abc"]) {
      expect(demoFillWeekHours(asked)).toBe(FILL_WEEK_HOURS);
    }
  });
});
