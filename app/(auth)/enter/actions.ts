"use server";

import { renewDemoSchedules, resetDemoBusinesses } from "@db/demo";
import { createAdminClient } from "@db/supabase/admin";
import { createClient } from "@db/supabase/server";
import {
  demoBusinessOf,
  demoEmailOf,
  demoPersonOf,
  PASSIVE_SIGN_IN,
} from "@domain/passive-sign-in";
import { redirect } from "next/navigation";

export type EnterResult = { failed: true };

export type ResetResult = { ok: boolean };

/**
 * Open a session for a demo person without asking them anything: the secret key
 * makes a one-time sign-in token, which nothing is sent for, and it is used here
 * on the spot. Only for the people `demoEmailOf` knows. A business whose week
 * renews gets it published first, so there is a schedule to see on arrival.
 */
export async function enterAs(person: string): Promise<EnterResult> {
  const known = demoPersonOf(person);
  const email = demoEmailOf(known);
  if (!PASSIVE_SIGN_IN || !known || !email) return { failed: true };

  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) throw error;
    const supabase = await createClient();
    const verified = await supabase.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: "magiclink",
    });
    if (verified.error) throw verified.error;
  } catch (error) {
    console.error("passive sign-in failed", (error as Error).message);
    return { failed: true };
  }

  // The person is in either way: a week that didn't renew is no reason to
  // keep them out.
  if (demoBusinessOf(known).renews) {
    try {
      await renewDemoSchedules();
    } catch (error) {
      console.error("demo schedule renewal failed", (error as Error).message);
    }
  }
  redirect("/home");
}

/**
 * Puts the demo businesses back the way they start, from the door. Anyone at
 * the door may: anyone there can change them too.
 */
export async function resetDemo(): Promise<ResetResult> {
  if (!PASSIVE_SIGN_IN) return { ok: false };
  try {
    await resetDemoBusinesses();
    return { ok: true };
  } catch (error) {
    console.error("demo reset failed", (error as Error).message);
    return { ok: false };
  }
}
