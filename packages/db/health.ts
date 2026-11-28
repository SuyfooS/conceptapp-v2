import "server-only";
import { hasPublicEnv } from "./env";
import { isMissingFunction } from "./missing";
import { createDetachedClient } from "./supabase/detached";

/**
 * How long the database has to answer: well inside the 10 seconds a try of
 * the uptime check waits for the whole page (.github/scripts/uptime.sh).
 */
export const PING_TIMEOUT_MS = 5_000;

/**
 * How long an answer from the database is kept: a minute, so however often
 * /health/db is asked, each server instance asks the database once a minute
 * at most.
 * Only an answer is kept. When the database gave none, the next request
 * asks again, so a retry sees it come back at once, and a database that is
 * down is no worse for being asked.
 */
export const KEEP_ANSWER_MS = 60_000;

/**
 * One question to the database (`public.ping()`,
 * 20261128000900_ping.sql), with the publishable key and no session, as
 * anyone on the internet could ask it: true when it answered. A project
 * the migration hasn't reached yet answers PGRST202 (`isMissingFunction`),
 * which is its API answering, so the code can deploy before Migrate without
 * the uptime check crying wolf; until then it says no more than that.
 * Without the two public settings, after 5 seconds, on any other error or
 * answer, or when anything throws: false. Never throws, and keeps nothing
 * of the error: what failed is no one's to read on a public address.
 */
async function ping(): Promise<boolean> {
  if (!hasPublicEnv()) return false;
  try {
    const { data, error } = await createDetachedClient()
      .rpc("ping")
      .abortSignal(AbortSignal.timeout(PING_TIMEOUT_MS));
    if (error) return isMissingFunction(error);
    return data === true;
  } catch {
    return false;
  }
}

/** When the database last answered, while that is kept, else null. */
let answeredAt: number | null = null;
/** The question on its way, which every request meanwhile waits for. */
let asking: Promise<boolean> | null = null;

/**
 * Whether the database answers, for /health/db (app/health/db/route.ts):
 * true for a minute after it last answered (`KEEP_ANSWER_MS`), without
 * asking again; else one `ping`, shared by every request that comes while
 * it is on its way. Per server instance, in its memory: nothing is written
 * anywhere. Call it at request time, after `connection()`: it reads the
 * clock.
 */
export function databaseAnswers(): Promise<boolean> {
  const now = Date.now();
  if (
    answeredAt !== null &&
    now >= answeredAt &&
    now - answeredAt < KEEP_ANSWER_MS
  ) {
    return Promise.resolve(true);
  }
  if (asking) return asking;
  const question = ping().then((answered) => {
    answeredAt = answered ? Date.now() : null;
    asking = null;
    return answered;
  });
  asking = question;
  return question;
}
