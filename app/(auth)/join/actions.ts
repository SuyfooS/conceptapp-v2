"use server";

import { claimInvite, ensurePhoneAccount, findInvite } from "@db/invites";
import { normalizeOtpCode } from "@domain/otp";
import { redirect } from "next/navigation";
import { type SignInError, sendCode, verifyCode } from "../otp";

export type JoinState =
  | { step: "invite"; error?: SignInError }
  | { step: "code"; error?: SignInError; resent?: boolean };

/**
 * Joining from an invite link: send a code to the invited number (its
 * account is made first if it has none), check it, then claim the invite
 * on the server and open the app. The number always comes from the invite,
 * never from the form. A link that stopped working on the way goes back to
 * its page, which says why.
 */
export async function join(
  token: string,
  prev: JoinState,
  form: FormData,
): Promise<JoinState> {
  const back = `/join/${encodeURIComponent(token)}`;
  const invite = await findInvite(token);
  if (invite?.status !== "open") redirect(back);

  const intent = form.get("intent");

  if (intent === "send" || intent === "resend") {
    let error: SignInError | null;
    try {
      await ensurePhoneAccount(invite.phone);
      error = await sendCode(invite.phone);
    } catch (cause) {
      console.error("join: sending the code failed", (cause as Error).message);
      error = "failed";
    }
    if (error && intent === "send") return { step: "invite", error };
    return {
      step: "code",
      error: error ?? undefined,
      resent: intent === "resend" && !error,
    };
  }

  if (intent === "verify" && prev.step === "code") {
    const raw = form.get("code");
    const code = normalizeOtpCode(typeof raw === "string" ? raw : "");
    if (!code) return { step: "code", error: "invalidCode" };
    const result = await verifyCode(invite.phone, code);
    if ("error" in result) return { step: "code", error: result.error };
    const claim = await claimInvite(token, result.userId);
    if (!claim.ok) redirect(back);
    redirect("/home");
  }

  return { step: "invite", error: "failed" };
}
