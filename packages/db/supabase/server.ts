import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "../database.types";
import { publicEnv } from "../env";

/**
 * Supabase for Server Components and Server Actions, acting as the signed-in
 * person under RLS. Create one per request. Server Components cannot write
 * cookies; the proxy refreshes the session before they run, so a failed
 * write there is safe to ignore.
 *
 * `connection()` marks the caller as request-time: the auth client reads
 * the clock, which Cache Components refuses while prerendering.
 */
export async function createClient() {
  await connection();
  const { url, publishableKey } = publicEnv();
  const store = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options);
          }
        } catch {
          // Called from a Server Component: the proxy already refreshed.
        }
      },
    },
  });
}
