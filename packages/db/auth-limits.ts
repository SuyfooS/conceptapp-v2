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
 * Counts the attempt for its number and its caller, against every window of
 * the limits in `private.auth_limits` (a quarter of an hour, and a day for
 * a number; `public.note_auth_attempt`). Returns 0 when it may go ahead,
 * else the seconds until it may; a refused try is not counted. A check is
 * counted for its number only while a code sent to it may still be waiting
 * (ten minutes), and otherwise answers `NO_CODE_WAITING`. Either may be
 * null, and is then not counted. Runs with the secret key; the database
 * keeps only hashes of both. Before the function reaches a project, nothing
 * is limited, as before.
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
  return z.number().int().min(NO_CODE_WAITING).parse(data);
}

/**
 * Gives back an attempt that sent nothing: the auth server refused the code
 * for its own short wait (`public.forget_auth_attempt`). For joining and the
 * file's codes only, never sign-in, where giving a try back would tell a
 * number with an account from one without.
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
