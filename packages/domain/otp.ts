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
