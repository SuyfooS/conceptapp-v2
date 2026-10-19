import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { parseSecretKey, publicEnv } from "../env";

/**
 * Supabase with the secret key: bypasses every RLS policy. Only for the
 * server-only writes (opening a business, claiming invites, publishing),
 * each of which checks who is asking first. Never import this from a
 * client component; `server-only` makes the build fail if one does.
 */
export function createAdminClient() {
  const { url } = publicEnv();
  const secretKey = parseSecretKey({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
