import { describe, expect, it } from "vitest";
import { normalizeOtpCode } from "./otp";

describe("normalizeOtpCode", () => {
  it.each([
    ["123456", "123456"],
    [" 123 456 ", "123456"],
    ["123-456", "123456"],
  ])("accepts %j", (input, expected) => {
    expect(normalizeOtpCode(input)).toBe(expected);
  });

  it.each(["", "12345", "1234567", "12a456", "１２３４５６"])(
    "rejects %j",
    (input) => {
      expect(normalizeOtpCode(input)).toBeNull();
    },
  );
});
