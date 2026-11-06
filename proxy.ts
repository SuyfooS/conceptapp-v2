import { refreshSession, withSessionCookies } from "@db/supabase/proxy";
import { signInPath } from "@domain/passive-sign-in";
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
  "/team",
  "/admin",
];
/** Where signed-in people have no business: they go on to the app. `/` is the landing page. */
const DOORS = ["/", "/sign-in", "/enter"];

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
      NextResponse.redirect(new URL(signInPath, request.url)),
    );
  }
  if (userId && DOORS.includes(pathname)) {
    return withSessionCookies(
      response,
      NextResponse.redirect(new URL(HOME, request.url)),
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/",
    "/home/:path*",
    "/schedule/:path*",
    "/clock/:path*",
    "/reservations/:path*",
    "/storefront/:path*",
    "/team/:path*",
    "/admin/:path*",
    "/sign-in",
    "/enter",
  ],
};
