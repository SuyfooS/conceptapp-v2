import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { publicEnv } from "../env";

/**
 * Supabase with the publishable key and no session of its own to keep: for
 * checking a code that proves a signed-in person is at their own phone (the
 * hiring file's bank change) without signing this browser in as anyone. A
 * session a call opens stays in this object, is never written to a cookie or
 * renewed, and goes with it; the caller ends it on the auth server too.
 */
export function createDetachedClient() {
  const { url, publishableKey } = publicEnv();
  return createClient<Database>(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
