import { describe, expect, it } from "vitest";
import {
  displayIsraeliMobile,
  formatIsraeliMobile,
  isIsraeliMobile,
  normalizeIsraeliMobile,
} from "./phone";

describe("normalizeIsraeliMobile", () => {
  it.each([
    ["050-123-4567", "+972501234567"],
    ["0501234567", "+972501234567"],
    ["501234567", "+972501234567"],
    ["+972 50 123 4567", "+972501234567"],
    ["972501234567", "+972501234567"],
    ["+972 050 123 4567", "+972501234567"],
    [" 054 999 0000 ", "+972549990000"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeIsraeliMobile(input)).toBe(expected);
  });

  it.each([
    "",
    "03-123-4567", // landline
    "050-123-456", // too short
    "050-123-45678", // too long
    "+1 415 555 0100", // not Israeli
    "abc",
  ])("rejects %s", (input) => {
    expect(normalizeIsraeliMobile(input)).toBeNull();
    expect(isIsraeliMobile(input)).toBe(false);
  });
});

describe("formatIsraeliMobile", () => {
  it.each([
    ["0", "0"],
    ["050", "050"],
    ["0501", "050-1"],
    ["050123", "050-123"],
    ["0501234", "050-123-4"],
    ["0501234567", "050-123-4567"],
    ["05012345678999", "050-123-4567"],
    ["+972501234567", "050-123-4567"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatIsraeliMobile(input)).toBe(expected);
  });
});

describe("displayIsraeliMobile", () => {
  it("shows a stored number the way people write it", () => {
    expect(displayIsraeliMobile("+972501234567")).toBe("050-123-4567");
  });
  it("leaves invalid input alone", () => {
    expect(displayIsraeliMobile("hello")).toBe("hello");
  });
});
