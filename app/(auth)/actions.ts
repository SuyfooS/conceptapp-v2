"use server";

import { normalizeOtpCode } from "@domain/otp";
import { normalizeIsraeliMobile } from "@domain/phone";
import { CAPTCHA_FIELD, captchaTokenOf } from "@domain/turnstile";
import { signedOutPath } from "../(app)/clock/station/station";
import type { SignedOut } from "../sign-out-form";
import { takeAfterSignIn } from "./after-sign-in";
import { endSessionHere, sessionUserHere } from "./end-session";
import { type Refusal, sendSignInCode, verifyCode } from "./otp";

/**
 * Sign-in's two steps, each with why it refused, if it did: an error, or
 * too many codes from this network with its minutes (`Refusal`).
 */
export type SignInState =
  | ({ step: "phone" } & Refusal)
  | ({
      step: "code";
      phone: string;
      resent?: boolean;
      /**
       * The code was right: where to go, once the screen has shown it. The
       * page a link asked for before sign-in, or Today.
       */
      to?: string;
    } & Refusal);

/**
 * The two-step sign-in: phone → SMS code → session cookies. The form posts
 * an `intent`: "send" (or resend) a code, "verify" it, or "change" the
 * number. A valid number gets the same answer whether it has an account or
 * not (`sendSignInCode`), so the screen tells nobody who is registered.
 * A send or a resend posts the "אני לא רובוט" check's token too (`captcha`),
 * dropped when it isn't one; a send refused for it stays on its step and
 * says so. Too many codes from this network is said with its minutes, on
 * either step: that count is the caller's, the same for every number; too
 * many for the number is said as before. Accounts are never created here;
 * people arrive through invites. A right code lands on the page a link
 * asked for before sign-in, taken
 * only then (`takeAfterSignIn`, known issue 21): a wrong code, a new code
 * or another number leave it kept.
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
    const sent = await sendSignInCode(
      phone,
      captchaTokenOf(form.get(CAPTCHA_FIELD)),
    );
    // Too many from this network comes with its minutes.
    const refused = typeof sent === "string" ? { error: sent } : sent;
    if (refused && intent === "send") return { step: "phone", ...refused };
    return {
      step: "code",
      phone,
      error: undefined,
      ...refused,
      resent: intent === "resend" && !refused,
    };
  }

  if (intent === "verify" && prev.step === "code") {
    const raw = form.get("code");
    const token = normalizeOtpCode(typeof raw === "string" ? raw : "");
    // A check answers for itself: the minutes of a network's refusal
    // before it don't stay.
    if (!token) {
      return {
        ...prev,
        error: "invalidCode",
        minutes: undefined,
        resent: false,
      };
    }
    const result = await verifyCode(prev.phone, token);
    if ("error" in result) {
      return {
        ...prev,
        error: result.error,
        minutes: undefined,
        resent: false,
      };
    }
    return {
      ...prev,
      error: undefined,
      minutes: undefined,
      resent: false,
      to: (await takeAfterSignIn()) ?? "/home",
    };
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
 * read can't keep anyone signed in. It also says whose session it ended,
 * read first, whose waiter-mode records on the phone go with it (P7): the
 * server's word, since the page's may be stale, or the session cookie's
 * claim where the auth server can't say (`sessionUserHere`), so a sign-out
 * that can't reach it still takes them. With "who" it ends nothing
 * and says only whose session this is, for SignOutForm's question first;
 * anyone may ask that of their own session.
 */
export async function signOut(only?: "who"): Promise<SignedOut> {
  const user = await sessionUserHere();
  if (only === "who") return { to: null, user };
  await endSessionHere();
  return { to: await signedOutPath(), user };
}
