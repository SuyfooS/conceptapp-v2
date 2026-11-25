import "server-only";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";

/**
 * The demo businesses, on a site whose demo door is open (`DEMO_DOOR`,
 * `./env`). All run with the secret key: nobody signed in may call them,
 * and their callers ask the door first (tooling/demo-door.test.ts).
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

/**
 * Sends next week's sample availability for each demo business whose
 * definition names it (`sampleAvailability`: the hosted restaurant's manager
 * and two workers), for each of those people still on its staff who hasn't
 * sent any, through the database functions a sent answer goes through
 * (`public.renew_demo_availability`). Never touches an answer someone sent,
 * and does nothing on a published week or with scheduling off, so it is safe
 * to call often. Writes no log row and no notification. Returns how many
 * answers it wrote: none before its migration reaches the project (Migrate
 * runs after the deploy), as before.
 */
export async function renewDemoAvailability(): Promise<number> {
  const { data, error } = await createAdminClient().rpc(
    "renew_demo_availability",
  );
  if (error) {
    if (isMissingFunction(error)) return 0;
    throw error;
  }
  return data;
}
