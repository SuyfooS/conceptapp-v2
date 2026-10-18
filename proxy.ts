import { refreshSession, withSessionCookies } from "@db/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Screens for signed-in people: home, each module's screens (the `nav`
 * hrefs in `modules/<key>/manifest.ts`) and the admin console
 * (tooling/proxy.test.ts keeps both lists in step). Everything else is
 * public.
 */
const HOME = "/home";
export const PRIVATE = [
  HOME,
  "/schedule",
  "/clock",
  "/reservations",
  "/storefront",
  "/admin",
];
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
  matcher: [
    "/home/:path*",
    "/schedule/:path*",
    "/clock/:path*",
    "/reservations/:path*",
    "/storefront/:path*",
    "/admin/:path*",
    "/sign-in",
  ],
};
