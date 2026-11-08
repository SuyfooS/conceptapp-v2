import "server-only";
import { createClient } from "@db/supabase/server";
import { refusalReason } from "@domain/otp";

export type SignInError =
  | "invalidPhone"
  | "unknownPhone"
  | "rateLimit"
  | "invalidCode"
  | "wrongCode"
  | "failed";

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
  const reason = refusalReason(error.code);
  if (reason) return reason;
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
    if (refusalReason(error?.code) === "rateLimit") {
      return { error: "rateLimit" };
    }
    return { error: "wrongCode" };
  }
  return { userId: data.user.id };
}
