import { describe, expect, it } from "vitest";
import {
  displayIsraeliMobile,
  displayIsraeliPhone,
  formatIsraeliMobile,
  ISRAELI_PHONE_E164,
  isIsraeliMobile,
  normalizeIsraeliMobile,
  normalizeIsraeliPhone,
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

describe("normalizeIsraeliPhone", () => {
  it.each([
    ["03-123-4567", "+97231234567"],
    ["02 123 4567", "+97221234567"],
    ["+972 3 123 4567", "+97231234567"],
    ["050-123-4567", "+972501234567"],
    ["0501234567", "+972501234567"],
    ["077-123-4567", "+972771234567"],
    ["+97231234567", "+97231234567"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeIsraeliPhone(input)).toBe(expected);
    expect(ISRAELI_PHONE_E164.test(expected)).toBe(true);
  });

  it.each([
    "",
    "12",
    "01-123-4567", // no such area code
    "03-123-456", // too short
    "050-123-45678", // too long
    "+97212345678",
    "1-800-123-456",
    "+1 415 555 0100",
  ])("rejects %s", (input) => {
    expect(normalizeIsraeliPhone(input)).toBeNull();
  });
});

describe("displayIsraeliPhone", () => {
  it("shows a stored number the way people write it", () => {
    expect(displayIsraeliPhone("+97231234567")).toBe("03-123-4567");
    expect(displayIsraeliPhone("+972501234567")).toBe("050-123-4567");
    expect(displayIsraeliPhone("+972771234567")).toBe("077-123-4567");
    expect(displayIsraeliPhone("031234567")).toBe("03-123-4567");
  });
  it("leaves anything else alone", () => {
    expect(displayIsraeliPhone("12")).toBe("12");
    expect(displayIsraeliPhone("")).toBe("");
  });
});
