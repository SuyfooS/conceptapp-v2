import { isSecureRequest } from "@domain/request-origin";
import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * How the session cookies are set (#80), on top of @supabase/ssr's own
 * (path "/", 400 days). httpOnly: only the server reads them. The app has no
 * Supabase client in the browser (every read and write goes through the
 * server: `./server`, `./proxy`, `./admin`), so no script on a page needs
 * the session, and one that shouldn't be there can't take it. Secure over
 * https; sameSite lax, so another site's form or request doesn't carry them.
 */
export function authCookieOptions(
  host: string | null | undefined,
  forwardedProto: string | null | undefined,
): CookieOptionsWithName {
  return {
    httpOnly: true,
    secure: isSecureRequest(host, forwardedProto),
    sameSite: "lax",
    path: "/",
  };
}

/** The same, for a request's headers. */
export function authCookieOptionsFor(headers: {
  get(name: string): string | null;
}): CookieOptionsWithName {
  return authCookieOptions(
    headers.get("x-forwarded-host") ?? headers.get("host"),
    headers.get("x-forwarded-proto"),
  );
}

/**
 * The name @supabase/ssr gives a project's session cookie: its storage key,
 * `sb-<the URL's first label>-auth-token` (supabase-js's default), cut into
 * `.0`, `.1`… once it is long.
 */
export function sessionCookieName(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

/**
 * Whether a cookie holds the session, or a piece of it, as @supabase/ssr's
 * own `isChunkLike` reads it. A sign-in's code verifier is no session.
 */
export function isSessionCookie(name: string, sessionName: string): boolean {
  if (name === sessionName) return true;
  const piece = /^(.*)\.(0|[1-9][0-9]*)$/.exec(name);
  return piece?.[1] === sessionName;
}
