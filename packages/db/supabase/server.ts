import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import type { Database } from "../database.types";
import { publicEnv } from "../env";
import { authCookieOptionsFor } from "./cookies";

/**
 * Supabase for Server Components and Server Actions, acting as the signed-in
 * person under RLS. Create one per request. Server Components cannot write
 * cookies; the proxy refreshes the session before they run, so a failed
 * write there is safe to ignore. The session cookies are httpOnly, Secure
 * over https and sameSite lax (`./cookies`), as the proxy sets them.
 *
 * `connection()` marks the caller as request-time: the auth client reads
 * the clock, which Cache Components refuses while prerendering.
 */
export async function createClient() {
  await connection();
  const { url, publishableKey } = publicEnv();
  const store = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookieOptions: authCookieOptionsFor(await headers()),
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
