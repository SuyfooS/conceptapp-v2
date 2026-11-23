import "server-only";
import { createClient, sessionCookieUser } from "@db/supabase/server";
import { forgetBusiness } from "../(app)/business-cookie";
import { forgetFileOpen } from "../(app)/team/[person]/file/step-up";
import { forgetThisDevice } from "../push/server";
import { forgetAfterSignIn } from "./after-sign-in";

/**
 * Sign out on this device: forget this browser's device first, so a shared
 * phone stops getting the last person's notifications, which business it
 * was in, so the next person starts in their own, a page a link kept for
 * after sign-in (known issue 21), so the next person at a shared device
 * starts on Today, and a holder's open hiring files (H6a), the database's
 * step-up for this sign-in with the cookie, so the next person meets them
 * locked and the session that ends holds none. Only this device's session
 * ends (`scope: "local"`, #80): signing out of a shared tablet doesn't sign
 * the person out of their own phone. Signing out and locking a station both
 * end here. A plain server module, not "use server": every export of one of
 * those is an action anyone can call.
 */
export async function endSessionHere(): Promise<void> {
  await forgetThisDevice();
  await forgetBusiness();
  await forgetAfterSignIn();
  await forgetFileOpen();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
}

/**
 * Whose session this device has, or null where none is: as the auth server
 * verifies it, or, where it can't say (out of reach, too many asks, a
 * refresh discarded, or the session gone from it), as the session cookie
 * claims it (`sessionCookieUser`, read first, since a refused refresh
 * deletes the cookie). Only the device's own records of that person go by
 * it (waiter mode P7), so the claim is enough: deleting them gives nobody
 * anything, and a waiter signing out of a shared phone while the auth server
 * can't be reached doesn't leave their rounds, notes and menus on it. A
 * session gone from the auth server names its person too: it is theirs that
 * ends here, and the outbox would take their rounds off the phone on its
 * next 401 anyway. Never in the way of signing out.
 */
export async function sessionUserHere(): Promise<string | null> {
  const claimed = await sessionCookieUser().catch(() => null);
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return data?.claims.sub ?? claimed;
  } catch {
    return claimed;
  }
}
