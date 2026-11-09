import { describe, expect, it } from "vitest";
import {
  isIsraeliId,
  israeliIdHint,
  israeliIdSchema,
  normalizeIsraeliId,
} from "./israeli-id";

describe("normalizeIsraeliId", () => {
  it.each([
    ["000000018", "000000018"],
    ["18", "000000018"],
    ["123456782", "123456782"],
    ["12-345678-2", "123456782"],
    ["12.345.678.2", "123456782"],
    [" 123 456 782 ", "123456782"],
    ["039337423", "039337423"],
    ["999999998", "999999998"],
    ["\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0662", "123456782"],
    ["\u200F123456782", "123456782"],
  ])("reads %s as %s", (input, expected) => {
    expect(normalizeIsraeliId(input)).toBe(expected);
    expect(isIsraeliId(input)).toBe(true);
  });

  it.each([
    ["a wrong check digit", "000000019"],
    ["a wrong check digit", "123456789"],
    ["all zeros", "000000000"],
    ["ten digits", "1234567890"],
    ["a letter", "12a456782"],
    ["nothing", ""],
  ])("refuses %s (%s)", (_name, input) => {
    expect(normalizeIsraeliId(input)).toBeNull();
    expect(isIsraeliId(input)).toBe(false);
  });
});

describe("israeliIdHint", () => {
  it("is the last four digits", () => {
    expect(israeliIdHint("123456782")).toBe("6782");
  });
});

describe("israeliIdSchema", () => {
  it("stores the nine-digit form", () => {
    expect(israeliIdSchema.parse("12-345678-2")).toBe("123456782");
  });

  it("refuses a wrong check digit with its own issue", () => {
    const result = israeliIdSchema.safeParse("000000019");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("israeliId");
  });
});
