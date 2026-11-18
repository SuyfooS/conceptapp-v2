"use server";

import { claimInvite, ensurePhoneAccount, findInvite } from "@db/invites";
import { normalizeOtpCode } from "@domain/otp";
import { redirect } from "next/navigation";
import { rememberBusiness } from "../../(app)/business-cookie";
import { pushSoon } from "../../push/server";
import { type SignInError, sendCode, verifyCode } from "../otp";

/**
 * Joining also fails for someone with shifts left who joins as an accountant,
 * and for someone on another business's staff who would join this one's
 * (one place on a staff per login, payroll P3b).
 */
export type JoinError = SignInError | "shiftsLeft" | "elsewhere";

export type JoinState =
  | { step: "invite"; error?: JoinError }
  | { step: "code"; error?: JoinError; resent?: boolean };

/**
 * Joining from an invite link: send a code to the invited number (its
 * account is made first if it has none, once the code may go), check it,
 * then claim the invite on the server and open the app, in the business just
 * joined (someone in several opens it first). The number always
 * comes from the invite, never from the form. A link that stopped working on
 * the way goes back to its page, which says why.
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
      error = await sendCode(invite.phone, () =>
        ensurePhoneAccount(invite.phone),
      );
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
    // Shifts left to finish, or a place on another staff: said here, since
    // the link itself still works.
    if (
      !claim.ok &&
      (claim.error === "shiftsLeft" || claim.error === "elsewhere")
    ) {
      return { step: "code", error: claim.error };
    }
    if (!claim.ok) redirect(back);
    await rememberBusiness(claim.businessId);
    // The owners and managers hear who joined.
    pushSoon();
    // Straight on: the page would now say the link was used, so nothing here
    // can stay on screen to show a check first.
    redirect("/home");
  }

  return { step: "invite", error: "failed" };
}
