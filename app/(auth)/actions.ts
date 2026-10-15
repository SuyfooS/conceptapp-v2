"use server";

import { createClient } from "@db/supabase/server";
import { normalizeOtpCode } from "@domain/otp";
import { normalizeIsraeliMobile } from "@domain/phone";
import { redirect } from "next/navigation";

export type SignInError =
  | "invalidPhone"
  | "unknownPhone"
  | "rateLimit"
  | "invalidCode"
  | "wrongCode"
  | "failed";

export type SignInState =
  | { step: "phone"; error?: SignInError }
  | { step: "code"; phone: string; error?: SignInError; resent?: boolean };

/** Auth error codes that mean "this number has no account". */
const UNKNOWN_PHONE = new Set(["signup_disabled", "otp_disabled"]);
const RATE_LIMIT = new Set([
  "over_sms_send_rate_limit",
  "over_request_rate_limit",
]);

async function sendCode(phone: string): Promise<SignInError | null> {
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
 * The two-step sign-in: phone → SMS code → session cookies. The form posts
 * an `intent`: "send" (or resend) a code, "verify" it, or "change" the
 * number. Accounts are never created here; people arrive through invites.
 */
export async function signIn(
  prev: SignInState,
  form: FormData,
): Promise<SignInState> {
  const intent = form.get("intent");

  if (intent === "change") return { step: "phone" };

  if (intent === "send" || intent === "resend") {
    const raw =
      intent === "resend" && prev.step === "code"
        ? prev.phone
        : form.get("phone");
    const phone = normalizeIsraeliMobile(typeof raw === "string" ? raw : "");
    if (!phone) return { step: "phone", error: "invalidPhone" };
    const error = await sendCode(phone);
    if (error && intent === "send") return { step: "phone", error };
    return {
      step: "code",
      phone,
      error: error ?? undefined,
      resent: intent === "resend" && !error,
    };
  }

  if (intent === "verify" && prev.step === "code") {
    const raw = form.get("code");
    const token = normalizeOtpCode(typeof raw === "string" ? raw : "");
    if (!token) return { ...prev, error: "invalidCode", resent: false };
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      phone: prev.phone,
      token,
      type: "sms",
    });
    if (error) {
      if (error.code && RATE_LIMIT.has(error.code)) {
        return { ...prev, error: "rateLimit", resent: false };
      }
      return { ...prev, error: "wrongCode", resent: false };
    }
    redirect("/home");
  }

  return { step: "phone", error: "failed" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
