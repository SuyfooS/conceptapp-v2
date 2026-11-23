import { demoDoorOpen } from "@db/env";
import { refreshSession, withSessionCookies } from "@db/supabase/proxy";
import {
  AFTER_SIGN_IN_COOKIE,
  AFTER_SIGN_IN_MAX_AGE,
  afterSignInPathOf,
  isDocumentNavigation,
} from "@domain/after-sign-in";
import { doorPath, phoneSignInPath, signInPath } from "@domain/passive-sign-in";
import { isSecureRequest } from "@domain/request-origin";
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
 * A signed-out visitor's page is kept for after sign-in (known issue 21):
 * only a screen, never Today, a file, the console or a route handler
 * (`@domain/after-sign-in`).
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
const DOORS: readonly string[] = [phoneSignInPath, signInPath];

function isPrivate(pathname: string) {
  return PRIVATE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * The page a signed-out visitor opened, kept on the way to the door so
 * sign-in lands there (known issue 21). Only for a page opened in the
 * window: the router's own fetches, prefetches, images and frames leave the
 * cookie as it is. The latest page opened wins: one that can't be kept
 * (Today, a file, the console, a route handler) forgets one kept before.
 * The redirect's address stays the bare door.
 */
function keepForAfterSignIn(
  request: NextRequest,
  to: NextResponse,
): NextResponse {
  const { pathname, search, protocol } = request.nextUrl;
  if (!isDocumentNavigation(request.method, request.headers, search)) {
    return to;
  }
  const kept = afterSignInPathOf(pathname, search);
  if (kept) {
    to.cookies.set(AFTER_SIGN_IN_COOKIE, kept, {
      httpOnly: true,
      // Secure over https, as the session cookies are (`authCookieOptions`).
      secure: isSecureRequest(
        request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
        request.headers.get("x-forwarded-proto") ?? protocol.replace(/:$/, ""),
      ),
      sameSite: "lax",
      path: "/",
      maxAge: AFTER_SIGN_IN_MAX_AGE,
    });
  } else if (request.cookies.has(AFTER_SIGN_IN_COOKIE)) {
    to.cookies.delete(AFTER_SIGN_IN_COOKIE);
  }
  return to;
}

/**
 * Keeps the Supabase session fresh on every page request and sends people
 * to the right side of the door: signed out away from the app, signed in
 * away from the sign-in screen. Where this site's demo door is closed
 * (`DEMO_DOOR=off`), the door is real sign-in, and /enter only an address
 * on the way to it (tooling/proxy-door.test.ts). A signed-out visitor sent
 * to the door has the page they opened kept for after sign-in
 * (`keepForAfterSignIn`); signed in, that cookie is never touched here.
 */
export async function proxy(request: NextRequest) {
  // The setting first: a bad value answers no request at all, and the build
  // has failed on it already.
  const open = demoDoorOpen();
  const { response, userId } = await refreshSession(request);
  const { pathname } = request.nextUrl;

  if (!userId && isPrivate(pathname)) {
    return withSessionCookies(
      response,
      keepForAfterSignIn(
        request,
        NextResponse.redirect(new URL(doorPath(open), request.url)),
      ),
    );
  }
  if (userId && DOORS.includes(pathname)) {
    return withSessionCookies(
      response,
      NextResponse.redirect(new URL(HOME, request.url)),
    );
  }
  // No demo people here: whoever comes to /enter goes on to real sign-in.
  if (!open && pathname === signInPath) {
    return withSessionCookies(
      response,
      NextResponse.redirect(new URL(phoneSignInPath, request.url)),
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
