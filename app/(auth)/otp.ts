import "server-only";
import {
  type AuthAttempt,
  CODE_JUST_SENT,
  forgetAuthAttempt,
  forgetNumberAttempts,
  forgetRefusedSend,
  NO_CODE_WAITING,
  noteAuthAttempt,
} from "@db/auth-limits";
import { createAdminClient } from "@db/supabase/admin";
import { createDetachedClient } from "@db/supabase/detached";
import { createClient } from "@db/supabase/server";
import { refusalReason } from "@domain/otp";
import { normalizeIsraeliMobile } from "@domain/phone";
import { headers } from "next/headers";

/**
 * Why a code didn't go or wasn't taken. None says a number has no account:
 * sign-in answers every valid number the same (`sendSignInCode`).
 * `captcha`: the auth server refused the send's "אני לא רובוט" token, or
 * its lack of one, once Supabase's CAPTCHA is on.
 */
export type SignInError =
  | "invalidPhone"
  | "rateLimit"
  | "tooMany"
  | "invalidCode"
  | "wrongCode"
  | "captcha"
  | "failed";

/**
 * The address the request came from. Vercel sets these headers itself, so a
 * visitor can't choose them. Null when there is none.
 */
async function callerAddress(): Promise<string | null> {
  const sent = await headers();
  const real = sent.get("x-real-ip")?.trim();
  if (real) return real;
  return sent.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/**
 * Count a code about to be sent or checked, or say why it may not go: the
 * number or the caller tried too many lately, no code went to the number
 * lately so there is nothing to check (`noCode`), a code was counted for the
 * number within the app's own wait between codes so none goes now
 * (`justSent`, the same for every number), or the count itself failed (and
 * then nothing goes). `noCode` and `justSent` are counted for the caller
 * only. These limits hold the app's own way in; the auth API called directly
 * is held by Supabase's and Twilio's own limits.
 */
async function count(
  kind: AuthAttempt["kind"],
  phone: string,
): Promise<AuthAttempt | "tooMany" | "noCode" | "justSent" | "failed"> {
  try {
    const attempt: AuthAttempt = {
      kind,
      phone,
      caller: await callerAddress(),
      at: new Date().toISOString(),
    };
    const answer = await noteAuthAttempt(attempt);
    if (answer === NO_CODE_WAITING) return "noCode";
    if (answer === CODE_JUST_SENT) return "justSent";
    return answer > 0 ? "tooMany" : attempt;
  } catch (cause) {
    console.error(
      "counting a sign-in attempt failed",
      (cause as Error).message,
    );
    return "failed";
  }
}

/**
 * What asking for a code came to: sent; a code counted for the number within
 * the app's own wait, so the auth server wasn't asked (`justSent`); the
 * number has no account, counted all the same (`unknownPhone`); refused for
 * its "אני לא רובוט" check (`captcha`); too many; or failed.
 */
type Requested =
  | "sent"
  | "justSent"
  | "unknownPhone"
  | "captcha"
  | "tooMany"
  | "failed";

/** How a code goes: what runs first, and the check's token. */
type SendOptions = {
  /** Runs once the code may go, before it does. */
  prepare?: () => Promise<void>;
  /**
   * The "אני לא רובוט" check's token from the browser, as `captchaTokenOf`
   * takes it; none when the check didn't load or failed.
   */
  captcha?: string;
};

/**
 * Count a code and ask the auth server to send it, never making an account.
 * `prepare` runs once the code may go, before it does. The check's token
 * goes with it (`captchaToken`), and a send without one goes all the same:
 * the app can't know whether Supabase's CAPTCHA is on, so the auth server
 * decides. The app's own wait between two codes to one number is longer
 * than the auth server's (`private.auth_send_wait`), so the auth server's
 * wait refuses no code the app lets go, unless one was asked of it
 * directly. What it still refuses is one of its limits on everyone (the
 * project's SMS in an hour, its requests from one address), and that try,
 * like one the SMS provider failed, sent nothing and is given back for the
 * number and the caller. A send it refuses for the check sent nothing either,
 * and is given back for the number only (`forgetRefusedSend`): the caller's
 * try stays counted. All are logged by their code only.
 */
async function requestCode(
  number: string,
  { prepare, captcha }: SendOptions = {},
): Promise<Requested> {
  const attempt = await count("send", number);
  // Only a check can find no code waiting.
  if (attempt === "noCode") return "failed";
  if (typeof attempt === "string") return attempt;
  await prepare?.();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: number,
    options: {
      shouldCreateUser: false,
      ...(captcha ? { captchaToken: captcha } : {}),
    },
  });
  if (!error) return "sent";
  const reason = refusalReason(error.code);
  if (reason === "unknownPhone") return "unknownPhone";
  if (reason === "captcha") {
    console.warn("signInWithOtp refused the CAPTCHA token", error.code);
    await forgetRefusedSend(attempt).catch((cause: Error) => {
      console.error("giving a refused send back failed", cause.message);
    });
    return "captcha";
  }
  console.error("signInWithOtp failed", error.code, error.status);
  await forgetAuthAttempt(attempt).catch((cause: Error) => {
    console.error("giving a sign-in attempt back failed", cause.message);
  });
  return "failed";
}

/**
 * Send a sign-in code by SMS, with the same answer for every valid number,
 * whether it has an account or not, so the screen never tells who is
 * registered. A number with no account gets nothing, its send counted as a
 * sent one is, and a code typed for it is a wrong one. A send inside the
 * app's own wait after the number's last counted one asks the auth server
 * nothing, for every number alike, and the earlier code still works. A limit
 * of the auth server's on everyone, or the SMS provider failing, is a
 * failure, with its try given back (`requestCode`). The SMS cap and the
 * provider are reached only by a number with an account, so meanwhile one
 * without still gets the code step (a known issue in docs/ROADMAP.md). A
 * send refused for its "אני לא רובוט" check (`captcha`) is said the same
 * for every number: the auth server checks it before it looks the number
 * up.
 */
export async function sendSignInCode(
  phone: string,
  captcha?: string,
): Promise<"invalidPhone" | "tooMany" | "failed" | "captcha" | null> {
  // One spelling per number, so each number has one count.
  const number = normalizeIsraeliMobile(phone);
  if (!number) return "invalidPhone";
  const sent = await requestCode(number, { captcha });
  return sent === "tooMany" || sent === "failed" || sent === "captcha"
    ? sent
    : null;
}

/**
 * Send a code by SMS to a number known to have an account, unless the number
 * or the caller asked for too many lately: joining (`sendJoinCode`), once the
 * invite's account is made (`prepare`, which runs once the code may go,
 * before it does), and the hiring file's codes, to the session's own number.
 * A code counted for the number within the app's own wait is said
 * (`rateLimit`; joining answers it as a code asked for, `join`); nothing
 * went, and the auth server wasn't asked. The "אני לא רובוט" check's token
 * goes with it (`captcha`), and a refusal for it is said. Accounts are
 * never created here; people arrive through invites.
 */
export async function sendCode(
  phone: string,
  options: SendOptions = {},
): Promise<SignInError | null> {
  // One spelling per number, so each number has one count.
  const number = normalizeIsraeliMobile(phone);
  if (!number) return "invalidPhone";
  const sent = await requestCode(number, options);
  if (sent === "sent") return null;
  if (sent === "justSent") return "rateLimit";
  if (sent === "unknownPhone") {
    // Joining makes the account first, and the file's codes go to the
    // session's own number: a fault, logged without the number.
    console.error("signInWithOtp found no account for a code's number");
    return "failed";
  }
  return sent;
}

/**
 * Send the code to join from an open invite, making the invited number's
 * account once the code may go (`makeAccount`). While the number has no
 * account its counts are cleared first: sign-in counts a send to such a
 * number but sends nothing, so a stranger could fill its day with nobody
 * seeing a code, and hold the new person out of joining. The database clears
 * nothing for a number with an account (`forgetNumberAttempts`), and once
 * this send makes the account it never clears again. A clear that fails
 * leaves the counts as they were. The account is made before the auth
 * server sees the check's token, so a send it refuses for the check leaves
 * the account made, which joining needs anyway. The clear and the app's
 * wait come before the check too, so within the wait after a sign-in code
 * a send with no good token answers `rateLimit` for a number with an
 * account and `captcha` for one without (docs/ROADMAP.md, 94).
 */
export async function sendJoinCode(
  phone: string,
  {
    makeAccount,
    captcha,
  }: { makeAccount: () => Promise<void>; captcha?: string },
): Promise<SignInError | null> {
  const number = normalizeIsraeliMobile(phone);
  if (!number) return "invalidPhone";
  await forgetNumberAttempts(number).catch((cause: Error) => {
    console.error("clearing a new number's attempts failed", cause.message);
  });
  return sendCode(number, { prepare: makeAccount, captcha });
}

type Checked =
  | { userId: string; accessToken: string | null }
  | { error: SignInError };

/**
 * A code checked on `client`, counted first: the number in one spelling,
 * so a respelled one meets the same count. With no code sent to the number
 * lately there is nothing to check, so it is a wrong code and the auth
 * server isn't asked.
 */
async function checked(
  client: Pick<ReturnType<typeof createDetachedClient>, "auth">,
  phone: string,
  token: string,
): Promise<Checked> {
  const number = normalizeIsraeliMobile(phone);
  if (!number) return { error: "wrongCode" };
  const attempt = await count("verify", number);
  if (attempt === "noCode") return { error: "wrongCode" };
  // Only a send can meet the wait between codes.
  if (attempt === "justSent") return { error: "failed" };
  if (typeof attempt === "string") return { error: attempt };
  const { data, error } = await client.auth.verifyOtp({
    phone: number,
    token,
    type: "sms",
  });
  if (error || !data.user) {
    if (refusalReason(error?.code) === "rateLimit") {
      return { error: "rateLimit" };
    }
    return { error: "wrongCode" };
  }
  return {
    userId: data.user.id,
    accessToken: data.session?.access_token ?? null,
  };
}

/**
 * Check the code and set the session cookies, unless the number or the caller
 * checked too many lately. Returns who signed in, or why not.
 */
export async function verifyCode(
  phone: string,
  token: string,
): Promise<{ userId: string } | { error: SignInError }> {
  // The number comes back from the browser with the form's state.
  const result = await checked(await createClient(), phone, token);
  return "error" in result ? result : { userId: result.userId };
}

/**
 * The number a person signs in with now, as the auth server holds it
 * (`auth.users.phone`, read with the secret key): where a code that proves
 * it is them goes. Never the profile's copy, which a number changed by the
 * team doesn't reach, nor one a browser sends. Null without one.
 */
export async function signInPhoneOf(userId: string): Promise<string | null> {
  const { data, error } =
    await createAdminClient().auth.admin.getUserById(userId);
  if (error) {
    throw Object.assign(new Error("reading a sign-in number failed"), {
      code: error.code ?? String(error.status ?? ""),
    });
  }
  return normalizeIsraeliMobile(data.user?.phone ?? "");
}

/**
 * Check a code that proves a signed-in person is at their own phone (the
 * hiring file's bank change), counted with the sign-in codes, on a client
 * that keeps no session (`createDetachedClient`): this browser's own session
 * stays as it is whoever the number turns out to be, and the session the
 * check opened on the auth server is ended at once (`local`: that one
 * session only). Returns whose number it was, for the caller to compare
 * with the session's before anything is kept.
 */
export async function checkCode(
  phone: string,
  token: string,
): Promise<{ userId: string } | { error: SignInError }> {
  const client = createDetachedClient();
  const result = await checked(client, phone, token);
  if ("error" in result) return result;
  if (result.accessToken) {
    const { error } = await client.auth.admin.signOut(
      result.accessToken,
      "local",
    );
    if (error) {
      console.error(
        "ending a checked code's session failed",
        error.code ?? error.status,
      );
    }
  }
  return { userId: result.userId };
}
