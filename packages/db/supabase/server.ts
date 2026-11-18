import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import type { Database } from "../database.types";
import { hasPublicEnv, publicEnv } from "../env";
import {
  authCookieOptionsFor,
  isSessionCookie,
  sessionCookieName,
} from "./cookies";

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

/**
 * Whether this browser holds a session, valid or not: any piece of its
 * cookie. Reading the person finds nobody once the access token has expired,
 * while the refresh token in the same cookie signs them in again on the next
 * request through the proxy. What must never show beside an account (a clock
 * station's codes) asks this instead.
 */
export async function hasSessionCookie(): Promise<boolean> {
  if (!hasPublicEnv()) return false;
  const name = sessionCookieName(publicEnv().url);
  return (await cookies())
    .getAll()
    .some(
      (cookie) => cookie.value !== "" && isSessionCookie(cookie.name, name),
    );
}
