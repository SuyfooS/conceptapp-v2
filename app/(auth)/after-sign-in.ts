import "server-only";
import { AFTER_SIGN_IN_COOKIE, afterSignInPath } from "@domain/after-sign-in";
import { cookies } from "next/headers";

/**
 * The page a link asked for before sign-in (proxy.ts keeps it, known issue
 * 21), taken once a door has signed the person in: read, deleted, and
 * checked again, since a cookie is the browser's to write too. Null where
 * none was kept or it isn't one to keep: the door lands on Today. Never
 * logged. A plain server module, not "use server": every export of one of
 * those is an action anyone can call.
 */
export async function takeAfterSignIn(): Promise<`/${string}` | null> {
  const jar = await cookies();
  const kept = jar.get(AFTER_SIGN_IN_COOKIE)?.value;
  if (kept === undefined) return null;
  jar.delete(AFTER_SIGN_IN_COOKIE);
  return afterSignInPath(kept);
}

/**
 * Forget it: on signing out and locking a station, so the next person at a
 * shared device starts on Today, and on joining, which lands where H5b
 * says.
 */
export async function forgetAfterSignIn(): Promise<void> {
  (await cookies()).delete(AFTER_SIGN_IN_COOKIE);
}
