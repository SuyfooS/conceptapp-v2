"use server";

import { normalizeOtpCode } from "@domain/otp";
import { normalizeIsraeliMobile } from "@domain/phone";
import { redirect } from "next/navigation";
import type { SignInState } from "../../(auth)/actions";
import type { JoinState } from "../../(auth)/join/actions";

// Stand-ins for the auth actions on the design demo: the same steps with no
// code sent. Any complete code is "wrong", so the error state can be seen too.

export async function demoSignIn(
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
    return { step: "code", phone, resent: intent === "resend" };
  }
  if (intent === "verify" && prev.step === "code") {
    const raw = form.get("code");
    const code = normalizeOtpCode(typeof raw === "string" ? raw : "");
    return {
      ...prev,
      error: code ? "wrongCode" : "invalidCode",
      resent: false,
    };
  }
  return { step: "phone", error: "failed" };
}

export async function demoJoin(
  prev: JoinState,
  form: FormData,
): Promise<JoinState> {
  const intent = form.get("intent");
  if (intent === "send" || intent === "resend") {
    return { step: "code", resent: intent === "resend" };
  }
  if (intent === "verify" && prev.step === "code") {
    const raw = form.get("code");
    const code = normalizeOtpCode(typeof raw === "string" ? raw : "");
    return { step: "code", error: code ? "wrongCode" : "invalidCode" };
  }
  return { step: "invite", error: "failed" };
}

export async function demoSignOut(): Promise<void> {}

/** The passive door's stand-in: on to the demo app, nothing signed in. */
export async function demoEnter(): Promise<{ failed: true }> {
  redirect("/design/shell");
}
