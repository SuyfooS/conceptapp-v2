import "server-only";
import { createClient } from "@db/supabase/server";

export type SignInError =
  | "invalidPhone"
  | "unknownPhone"
  | "rateLimit"
  | "invalidCode"
  | "wrongCode"
  | "failed";

/** Auth error codes that mean "this number has no account". */
const UNKNOWN_PHONE = new Set(["signup_disabled", "otp_disabled"]);
const RATE_LIMIT = new Set([
  "over_sms_send_rate_limit",
  "over_request_rate_limit",
]);

/**
 * Send a sign-in code by SMS to a number that already has an account.
 * Accounts are never created here; people arrive through invites.
 */
export async function sendCode(phone: string): Promise<SignInError | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: { shouldCreateUser: false },
  });
  if (!error) return null;
  if (error.code && UNKNOWN_PHONE.has(error.code)) return "unknownPhone";
  if (error.code && RATE_LIMIT.has(error.code)) return "rateLimit";
  console.error("signInWithOtp failed", error.code, error.status);
  return "failed";
}

/**
 * Check the code and set the session cookies. Returns who signed in, or
 * why not.
 */
export async function verifyCode(
  phone: string,
  token: string,
): Promise<{ userId: string } | { error: SignInError }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
  if (error || !data.user) {
    if (error?.code && RATE_LIMIT.has(error.code))
      return { error: "rateLimit" };
    return { error: "wrongCode" };
  }
  return { userId: data.user.id };
}
