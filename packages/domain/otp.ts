/** Login codes sent by SMS are six digits. */
export const OTP_LENGTH = 6;

/**
 * The code as the auth server expects it, or null when it is not six digits.
 * Spaces and dashes from a pasted SMS are dropped.
 */
export function normalizeOtpCode(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits) ? digits : null;
}

/**
 * What a refused request for a code means, from the auth server's error code:
 * the number has no account, or it asked again too soon. Null otherwise.
 */
export function refusalReason(
  code: string | undefined,
): "unknownPhone" | "rateLimit" | null {
  if (code === "signup_disabled" || code === "otp_disabled") {
    return "unknownPhone";
  }
  if (
    code === "over_sms_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return "rateLimit";
  }
  return null;
}
