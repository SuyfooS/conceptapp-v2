import { describe, expect, it } from "vitest";
import { normalizeOtpCode, refusalReason } from "./otp";

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

describe("refusalReason", () => {
  it.each([
    ["signup_disabled", "unknownPhone"],
    ["otp_disabled", "unknownPhone"],
    ["over_sms_send_rate_limit", "rateLimit"],
    ["over_request_rate_limit", "rateLimit"],
    ["unexpected_failure", null],
    [undefined, null],
  ] as const)("reads %j as %j", (code, expected) => {
    expect(refusalReason(code)).toBe(expected);
  });
});
