import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "../database.types";
import { hasPublicEnv, publicEnv } from "../env";

/**
 * Refresh the Supabase session on every request and report who is signed
 * in. Returns the response to send on (carrying refreshed cookies and the
 * no-store headers Supabase asks for) and the user id, or null.
 */
export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  // A deployment without Supabase settings (e.g. a preview before the keys
  // are added) treats everyone as signed out instead of failing every page;
  // sign-in then reports an error.
  if (!hasPublicEnv()) return { response, userId: null };
  const { url, publishableKey } = publicEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet, headers) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // getClaims verifies the token (refreshing it when needed); never trust
  // getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub ?? null;

  return { response, userId };
}

/** Copy refreshed auth cookies onto a redirect, so they are not lost. */
export function withSessionCookies(from: NextResponse, to: NextResponse) {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}
