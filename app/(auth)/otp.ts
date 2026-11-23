import "server-only";
import {
  type AuthAttempt,
  forgetAuthAttempt,
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
 */
export type SignInError =
  | "invalidPhone"
  | "rateLimit"
  | "tooMany"
  | "invalidCode"
  | "wrongCode"
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
 * lately so there is nothing to check (`noCode`, counted for the caller
 * only), or the count itself failed (and then nothing goes). These limits
 * hold the app's own way in; the auth API called directly is held by
 * Supabase's and Twilio's own limits.
 */
async function count(
  kind: AuthAttempt["kind"],
  phone: string,
): Promise<AuthAttempt | "tooMany" | "noCode" | "failed"> {
  try {
    const attempt: AuthAttempt = {
      kind,
      phone,
      caller: await callerAddress(),
      at: new Date().toISOString(),
    };
    const answer = await noteAuthAttempt(attempt);
    if (answer === NO_CODE_WAITING) return "noCode";
    return answer > 0 ? "tooMany" : attempt;
  } catch (cause) {
    console.error(
      "counting a sign-in attempt failed",
      (cause as Error).message,
    );
    return "failed";
  }
}

/** A code asked of the auth server, once counted, and what it answered. */
type Requested = {
  attempt: AuthAttempt;
  refused: "unknownPhone" | "rateLimit" | "failed" | null;
};

/**
 * Count a code and ask the auth server to send it, never making an account.
 * `prepare` runs once the code may go, before it does. A refusal the auth
 * server gives no known reason for is logged by its code only.
 */
async function requestCode(
  number: string,
  prepare?: () => Promise<void>,
): Promise<Requested | "tooMany" | "failed"> {
  const attempt = await count("send", number);
  // Only a check can find no code waiting.
  if (attempt === "noCode") return "failed";
  if (typeof attempt === "string") return attempt;
  await prepare?.();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: number,
    options: { shouldCreateUser: false },
  });
  if (!error) return { attempt, refused: null };
  const reason = refusalReason(error.code);
  if (reason) return { attempt, refused: reason };
  console.error("signInWithOtp failed", error.code, error.status);
  return { attempt, refused: "failed" };
}

/**
 * Send a sign-in code by SMS, with the same answer for every valid number,
 * whether it has an account or not, so the screen never tells who is
 * registered. A number with no account gets nothing, and a code typed for
 * it is a wrong one. Every send stays counted, for the number and the
 * caller, also one the auth server held for its own short wait: only a
 * number with an account meets that wait, so giving its try back would
 * leave an unknown number's count higher, and "too many" would come to it
 * sooner.
 */
export async function sendSignInCode(
  phone: string,
): Promise<"invalidPhone" | "tooMany" | "failed" | null> {
  // One spelling per number, so each number has one count.
  const number = normalizeIsraeliMobile(phone);
  if (!number) return "invalidPhone";
  const sent = await requestCode(number);
  if (typeof sent === "string") return sent;
  return sent.refused === "failed" ? "failed" : null;
}

/**
 * Send a code by SMS to a number known to have an account, unless the number
 * or the caller asked for too many lately: joining, once the invite's
 * account is made (`prepare`, which runs once the code may go, before it
 * does), and the hiring file's codes, to the session's own number. The auth
 * server's short wait is said, and its try given back, since no code went.
 * Accounts are never created here; people arrive through invites.
 */
export async function sendCode(
  phone: string,
  prepare?: () => Promise<void>,
): Promise<SignInError | null> {
  // One spelling per number, so each number has one count.
  const number = normalizeIsraeliMobile(phone);
  if (!number) return "invalidPhone";
  const sent = await requestCode(number, prepare);
  if (typeof sent === "string") return sent;
  if (sent.refused === "rateLimit") {
    // Too soon for the auth server: no code went, so the try is given back.
    await forgetAuthAttempt(sent.attempt).catch((cause: Error) => {
      console.error("giving a sign-in attempt back failed", cause.message);
    });
    return "rateLimit";
  }
  if (sent.refused === "unknownPhone") {
    // Joining makes the account first, and the file's codes go to the
    // session's own number: a fault, logged without the number.
    console.error("signInWithOtp found no account for a code's number");
    return "failed";
  }
  return sent.refused;
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
