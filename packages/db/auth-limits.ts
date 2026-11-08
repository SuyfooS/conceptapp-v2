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
 * Counts the attempt for its number and its caller, against the limits in
 * `private.auth_limits` (`public.note_auth_attempt`). Returns 0 when it may
 * go ahead, else the seconds until it may; a refused try is not counted.
 * Either may be null, and is then not counted. Runs with the secret key; the
 * database keeps only hashes of both. Before the function reaches a project,
 * nothing is limited, as before.
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
  return z.number().int().nonnegative().parse(data);
}

/**
 * Gives back an attempt that sent nothing: the auth server refused the code
 * for its own short wait (`public.forget_auth_attempt`).
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
