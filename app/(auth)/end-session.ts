import "server-only";
import { createClient } from "@db/supabase/server";
import { forgetBusiness } from "../(app)/business-cookie";
import { forgetThisDevice } from "../push/server";

/**
 * Sign out on this device: forget this browser's device first, so a shared
 * phone stops getting the last person's notifications, and which business it
 * was in, so the next person starts in their own. Only this device's session
 * ends (`scope: "local"`, #80): signing out of a shared tablet doesn't sign
 * the person out of their own phone. Signing out and locking a station both
 * end here. A plain server module, not "use server": every export of one of
 * those is an action anyone can call.
 */
export async function endSessionHere(): Promise<void> {
  await forgetThisDevice();
  await forgetBusiness();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
}
