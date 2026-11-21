import { refreshSession, withSessionCookies } from "@db/supabase/proxy";
import { signInPath } from "@domain/passive-sign-in";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Screens for signed-in people: home, each module's screens (the `nav`
 * hrefs in `modules/<key>/manifest.ts`), the notifications and taking
 * orders' mode (/orders, its `mode.href`), which have no tab, the profile, the photos it
 * shows, the photos on lists, the files sent in chat, the official
 * documents' files and the admin console
 * (tooling/proxy.test.ts keeps both lists in step).
 * Everything else is public; chat's sync (/chat-sync) and the orders' sync
 * and send (/orders-sync, /orders-send) stay out on purpose: each renews the
 * session itself and answers a signed-out caller 401.
 * The station (/station) is public too, and in the matcher only, but for its
 * poll and its writes (/station/tickets, /station/write), which refuse any
 * session themselves.
 */
const HOME = "/home";
export const PRIVATE = [
  HOME,
  "/schedule",
  "/clock",
  "/reservations",
  "/storefront",
  "/lists",
  "/chat",
  "/orders",
  "/team",
  "/manage",
  "/notifications",
  "/me",
  "/photos",
  "/list-photos",
  "/chat-files",
  "/document-files",
  "/admin",
];
const DOORS = ["/sign-in", "/enter"];

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
    "/home/:path*",
    "/schedule/:path*",
    "/clock/:path*",
    "/reservations/:path*",
    "/storefront/:path*",
    "/lists/:path*",
    "/chat/:path*",
    "/orders/:path*",
    "/team/:path*",
    "/manage/:path*",
    "/notifications/:path*",
    "/me/:path*",
    "/photos/:path*",
    "/list-photos/:path*",
    "/chat-files/:path*",
    "/document-files/:path*",
    "/admin/:path*",
    // Public, and refreshed all the same: a session left on a station is
    // renewed here and counted as one, never read as nobody (PRIVATE leaves
    // it out, so a device with nobody signed in reaches it). Not the
    // kitchen's and the till's poll and writes (waiter mode P8a): each ask,
    // every five seconds, would run the proxy too; they refuse any session
    // themselves.
    "/station",
    "/station/((?!tickets$|write$).*)",
    "/sign-in",
    "/enter",
  ],
};
