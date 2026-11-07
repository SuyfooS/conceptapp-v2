import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * The demo businesses, while the door is passive (`@domain/passive-sign-in`).
 * Both run with the secret key: nobody signed in may call them.
 */

/**
 * Puts every demo business back the way it starts, except one reset in the
 * last few seconds. Returns how many it reset.
 */
export async function resetDemoBusinesses(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "reset_demo_businesses",
  );
  if (error) throw error;
  return data;
}

/**
 * Publishes this week's schedule for each demo business that renews, if it
 * isn't published yet. Does nothing otherwise, so it is safe to call often.
 * Returns how many weeks it published.
 */
export async function renewDemoSchedules(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("renew_demo_schedules");
  if (error) throw error;
  return data;
}
