"use server";

import { createClient } from "@db/supabase/server";
import { normalizeOtpCode } from "@domain/otp";
import { signInPath } from "@domain/passive-sign-in";
import { normalizeIsraeliMobile } from "@domain/phone";
import { forgetBusiness } from "../(app)/business-cookie";
import { forgetThisDevice } from "../push/server";
import { type SignInError, sendCode, verifyCode } from "./otp";

export type SignInState =
  | { step: "phone"; error?: SignInError }
  | {
      step: "code";
      phone: string;
      error?: SignInError;
      resent?: boolean;
      /** The code was right: where to go, once the screen has shown it. */
      to?: string;
    };

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
    const result = await verifyCode(prev.phone, token);
    if ("error" in result) {
      return { ...prev, error: result.error, resent: false };
    }
    return { ...prev, error: undefined, resent: false, to: "/home" };
  }

  return { step: "phone", error: "failed" };
}

/**
 * Sign out, forgetting this browser's device first, so a shared phone stops
 * getting the last person's notifications, and which business it was in, so
 * the next person starts in their own. Only this device's session ends
 * (`scope: "local"`, #80): signing out of a shared tablet doesn't sign the
 * person out of their own phone. Returns the door, which SignOutForm opens
 * as a whole new page, so nothing the last person's screens held stays in
 * the browser for the next one.
 */
export async function signOut(): Promise<string> {
  await forgetThisDevice();
  await forgetBusiness();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return signInPath;
}
