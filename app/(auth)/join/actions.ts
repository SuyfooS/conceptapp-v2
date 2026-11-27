"use server";

import { claimInvite, ensurePhoneAccount, findInvite } from "@db/invites";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { normalizeOtpCode } from "@domain/otp";
import { CAPTCHA_FIELD, captchaTokenOf } from "@domain/turnstile";
import { redirect } from "next/navigation";
import { rememberBusiness } from "../../(app)/business-cookie";
import { pushSoon } from "../../push/server";
import { forgetAfterSignIn } from "../after-sign-in";
import {
  type Refusal,
  type SignInError,
  sendJoinCode,
  verifyCode,
} from "../otp";
import { landingAfterJoin } from "./landing";

/**
 * Joining also fails for someone with shifts left who joins as an accountant,
 * and for someone on another business's staff who would join this one's
 * (one place on a staff per login, payroll P3b).
 */
export type JoinError = SignInError | "shiftsLeft" | "elsewhere";

/**
 * Joining's two steps, each with why it refused, if it did: an error, or
 * too many codes from this network with its minutes (`Refusal`).
 */
export type JoinState =
  | ({ step: "invite" } & Refusal<JoinError>)
  | ({ step: "code"; resent?: boolean } & Refusal<JoinError>);

/**
 * Joining from an invite link: send a code to the invited number (its
 * account is made first if it has none, once the code may go, and a number
 * with none starts with no counts, `sendJoinCode`), check it, then claim
 * the invite on the server and open the app, in the business just
 * joined (someone in several opens it first): a worker or a manager on their
 * hiring file's welcome where the business uses it, anyone else on Today
 * (`landingAfterJoin`, H5b), never the page an earlier link kept for after
 * sign-in, which is forgotten. The first send answers the same whether the
 * number already had an account or not: too many and too soon are the code
 * step, whose words are true either way; a malformed number and a failure
 * stay on the invite. A new code asked for too soon reads as one asked for,
 * as on sign-in, so the app's wait between codes reads the same for every
 * number; too many and a failure are said on the code step. What "too many"
 * still tells is a known issue (docs/ROADMAP.md, 94). A send carries the
 * "אני לא רובוט" check's token (`captcha`, dropped when it isn't one), and
 * one the auth server refused for it stays on its step and says so. The
 * auth server's refusal is the same for every number, since its check
 * comes before it looks the number up, but the app's own wait isn't: a
 * send with no good token, within the wait after a sign-in code to the
 * invited number, reads as a code asked for when the number had an account
 * (its counts kept, so the auth server isn't asked) and as refused for the
 * check when it had none (its counts cleared). The app can't tell a bad
 * token itself, and showing the code step for a send refused for its check
 * would hide the refusal, so that is a known issue too (docs/ROADMAP.md,
 * 94). Too many codes from this network is said, with its minutes, on
 * either step: that count is the caller's, which joining doesn't clear, so
 * it is the same whether the number had an account or not. The number
 * always comes from the invite, never from the form.
 * A link that stopped working on the way goes back to its page, which says
 * why.
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
    let sent: Awaited<ReturnType<typeof sendJoinCode>>;
    try {
      sent = await sendJoinCode(invite.phone, {
        makeAccount: () => ensurePhoneAccount(invite.phone),
        captcha: captchaTokenOf(form.get(CAPTCHA_FIELD)),
      });
    } catch (cause) {
      console.error("join: sending the code failed", (cause as Error).message);
      sent = "failed";
    }
    // Too many from this network comes with its minutes.
    const refused: Refusal<SignInError> | null =
      typeof sent === "string" ? { error: sent } : sent;
    const error = refused?.error;
    if (intent === "send" && refused) {
      // Too many for the number, or a code sent to it within the wait: the
      // code step, word for word as for a code that went. A number with no
      // account had its counts cleared and one with an account kept them,
      // so anything else here would tell the link's holder which it was.
      // Too many from this network is said: joining clears no network's
      // count, so it is the same either way.
      if (error === "tooMany" || error === "rateLimit") {
        return { step: "code", error: undefined, resent: false };
      }
      return { step: "invite", ...refused };
    }
    // A new code asked for within the app's wait between codes, which runs
    // from the number's last counted send: a sign-in code counted for a
    // number with an account starts it, and joining cleared the counts of a
    // number with none, so saying it would tell the link's holder which it
    // was. It reads as one asked for, as on sign-in: nothing went now, and
    // the earlier code still works.
    if (intent === "resend" && error === "rateLimit") {
      return { step: "code", error: undefined, resent: true };
    }
    return {
      step: "code",
      error: undefined,
      ...refused,
      resent: intent === "resend" && !refused,
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
    // The business's modules, read with the secret key: this request's
    // session can't read them yet under RLS. A read that fails lands on
    // Today, as before.
    const rows = await getBusinessModulesForTeam(claim.businessId).catch(
      () => [],
    );
    // A page kept by an earlier link (known issue 21) goes: joining lands
    // where H5b says.
    await forgetAfterSignIn();
    // Straight on: the page would now say the link was used, so nothing here
    // can stay on screen to show a check first.
    redirect(landingAfterJoin(rows, invite.role));
  }

  return { step: "invite", error: "failed" };
}
