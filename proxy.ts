import { refreshSession, withSessionCookies } from "@db/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

/** Screens for signed-in people. Everything else is public. */
const HOME = "/home";
const PRIVATE = [HOME];
const SIGN_IN = "/sign-in";

function isPrivate(pathname: string) {
  return PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Keeps the Supabase session fresh on every page request and sends people
 * to the right side of the door: signed out away from the app, signed in
 * away from the sign-in screen.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSession(request);
  const { pathname } = request.nextUrl;

  if (!userId && isPrivate(pathname)) {
    return withSessionCookies(
      response,
      NextResponse.redirect(new URL(SIGN_IN, request.url)),
    );
  }
  if (userId && pathname === SIGN_IN) {
    return withSessionCookies(
      response,
      NextResponse.redirect(new URL(HOME, request.url)),
    );
  }
  return response;
}

export const config = {
  matcher: ["/home/:path*", "/sign-in"],
};
