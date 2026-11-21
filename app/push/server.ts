import "server-only";
import { deliverDuePushes } from "@db/push/deliver";
import { removePushDevice } from "@db/push/devices";
import { pushConfig } from "@db/push/env";
import { createClient } from "@db/supabase/server";
import { isUuid } from "@domain/activity";
import { cookies } from "next/headers";
import { after } from "next/server";
import { requestOrigin } from "@/app/origin";

/**
 * Notifications on the phone, from the app's side: sending what an action
 * notified, and the cookie that remembers which saved device this browser is.
 */

/** The longest a caller may have the send wait, inside the route's time. */
export const PUSH_WAIT_MAX_MS = 15_000;

/**
 * After an action that may have written notifications (publishing, a swap,
 * a punch, hours, joining): send what is due once the answer has gone, so
 * the action is no slower. Delivery is global, so this also sends what waits
 * for anyone else. Nothing without the VAPID settings. With `waitMs`, it
 * waits that long first (at most `PUSH_WAIT_MAX_MS`), for a push written to
 * go a few seconds late: "מוכן"'s, which an open mode reads first (waiter
 * mode P8b), so it goes without waiting for the minute job. The route that
 * calls it gives itself the time (`maxDuration`).
 */
export function pushSoon(options: { waitMs?: number } = {}): void {
  if (!pushConfig()) return;
  const wait = Math.min(
    Math.max(Math.floor(options.waitMs ?? 0), 0),
    PUSH_WAIT_MAX_MS,
  );
  after(async () => {
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    await deliverDuePushes();
  });
}

/** The device this browser saved: its id, for forgetting it on sign-out. */
export const DEVICE_COOKIE = "ca_push_device";

/**
 * Remember the device this browser is. httpOnly, a year, and Secure wherever
 * the app runs on https (the browser tests run on http://127.0.0.1, where a
 * Secure cookie would be dropped and sign-out would forget nothing).
 */
export async function rememberDevice(device: string): Promise<void> {
  const secure = (await requestOrigin()).startsWith("https://");
  (await cookies()).set(DEVICE_COOKIE, device, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export async function forgetDeviceCookie(): Promise<void> {
  (await cookies()).delete(DEVICE_COOKIE);
}

/**
 * Before signing out: forget this browser's device, so a shared phone stops
 * getting the last person's notifications. Never stops the sign-out.
 */
export async function forgetThisDevice(): Promise<void> {
  try {
    const store = await cookies();
    const device = store.get(DEVICE_COOKIE)?.value;
    if (!device) return;
    store.delete(DEVICE_COOKIE);
    if (!isUuid(device)) return;
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (userId) await removePushDevice(userId, { device });
  } catch (error) {
    console.error("forgetting the device failed", (error as Error).message);
  }
}
