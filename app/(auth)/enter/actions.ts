"use server";

import { createAdminClient } from "@db/supabase/admin";
import { createClient } from "@db/supabase/server";
import { demoEmailOf, PASSIVE_SIGN_IN } from "@domain/passive-sign-in";
import { redirect } from "next/navigation";

export type EnterResult = { failed: true };

/**
 * Open a session for a demo person without asking them anything: the secret key
 * makes a one-time sign-in token, which nothing is sent for, and it is used here
 * on the spot. Only for the people `demoEmailOf` knows.
 */
export async function enterAs(person: string): Promise<EnterResult> {
  const email = demoEmailOf(person);
  if (!PASSIVE_SIGN_IN || !email) return { failed: true };

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
  redirect("/home");
}
