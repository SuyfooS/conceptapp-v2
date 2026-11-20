"use server";

import { normalizeOtpCode } from "@domain/otp";
import { normalizeIsraeliMobile } from "@domain/phone";
import { signedOutPath } from "../(app)/clock/station/station";
import { endSessionHere } from "./end-session";
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
 * Sign out on this device only (`endSessionHere`: its device, its business,
 * its session; the person's own phone stays signed in). Returns where the
 * device goes next, which SignOutForm opens as a whole new page, so nothing
 * the last person's screens held stays in the browser for the next one: the
 * clock station's code on a device that is one of a business's running
 * stations (Orel, 20 November 2026), and the door anywhere else, a stopped
 * station included. The session is gone before that is read, so a failed
 * read can't keep anyone signed in.
 */
export async function signOut(): Promise<string> {
  await endSessionHere();
  return await signedOutPath();
}
