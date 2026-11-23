import "server-only";
import { z } from "zod";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";

/** A code about to be sent ("send") or checked ("verify"). */
export type AuthAttempt = {
  kind: "send" | "verify";
  phone: string | null;
  /** The address the request came from. */
  caller: string | null;
  /** When it is counted, as an ISO time: the key to give it back. */
  at: string;
};

/**
 * What a check answers when no code went to its number lately: it was
 * counted for its caller only, and there is nothing to check.
 */
export const NO_CODE_WAITING = -1;

/**
 * What a send answers when a code was counted for its number within the
 * app's own wait between two codes (`private.auth_send_wait`), the same for
 * every number: it was counted for its caller only, and nothing is to be
 * sent.
 */
export const CODE_JUST_SENT = -2;

/**
 * Counts the attempt for its number and its caller, against every window of
 * the limits in `private.auth_limits` (a quarter of an hour, and a day for
 * a number; `public.note_auth_attempt`). Returns 0 when it may go ahead,
 * else the seconds until it may; a refused try is not counted. A check is
 * counted for its number only while a code sent to it may still be waiting
 * (ten minutes), and otherwise answers `NO_CODE_WAITING`. A send inside the
 * app's own wait after the number's last counted send answers
 * `CODE_JUST_SENT`. Either answer is counted for the caller only. Either
 * the number or the caller may be null, and is then not counted. Runs with
 * the secret key; the database keeps only hashes of both. Before the
 * function reaches a project, nothing is limited, as before.
 */
export async function noteAuthAttempt(attempt: AuthAttempt): Promise<number> {
  const { data, error } = await createAdminClient().rpc("note_auth_attempt", {
    kind: attempt.kind,
    // An empty string is no number, or no caller.
    phone: attempt.phone ?? "",
    caller: attempt.caller ?? "",
    at_time: attempt.at,
  });
  if (error) {
    if (isMissingFunction(error)) return 0;
    throw new Error(`Could not count the attempt: ${error.message}`);
  }
  return z.number().int().min(CODE_JUST_SENT).parse(data);
}

/**
 * Gives back a send the auth server sent nothing for, for its number and its
 * caller (`public.forget_auth_attempt`): it refused the code for one of its
 * own limits (the project's SMS in an hour, its requests from one address),
 * or the SMS provider failed. Not a send to a number with no account: on
 * sign-in that stays counted, as a code sent does.
 */
export async function forgetAuthAttempt(attempt: AuthAttempt): Promise<void> {
  const { error } = await createAdminClient().rpc("forget_auth_attempt", {
    kind: attempt.kind,
    phone: attempt.phone ?? "",
    caller: attempt.caller ?? "",
    at_time: attempt.at,
  });
  if (error && !isMissingFunction(error)) {
    throw new Error(`Could not give the attempt back: ${error.message}`);
  }
}

/**
 * Clears the codes counted for a number, sent and checked, while it has no
 * account (`public.forget_number_attempts`): none reached anyone, since
 * sign-in sends nothing to such a number. For joining from an open invite
 * only, before its code is counted, so a stranger's sign-in tries can't hold
 * the invited person out. The database keeps the counts of a number with an
 * account, and the callers'. Before the function reaches a project, nothing
 * is cleared, as before.
 */
export async function forgetNumberAttempts(phone: string): Promise<void> {
  const { error } = await createAdminClient().rpc("forget_number_attempts", {
    phone,
  });
  if (error && !isMissingFunction(error)) {
    throw new Error(`Could not clear the number's attempts: ${error.message}`);
  }
}
