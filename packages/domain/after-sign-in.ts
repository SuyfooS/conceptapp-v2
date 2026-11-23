import { isAppPath } from "./app-path";

/**
 * A link's page after sign-in (Orel, 22 November 2026; known issue 21): a
 * signed-out visitor who opens a link to a screen of the app (the week's
 * share from WhatsApp, a list, a chat) goes through the door and then lands
 * on that screen, not on Today. The proxy keeps the page in a short cookie
 * on its way to the door, never in the address, and the door that signs
 * them in takes it once (`app/(auth)/after-sign-in.ts`). Landing there gives
 * nobody anything: the page still checks who may see it, as it does for
 * anyone who opens the same link signed in.
 */

/** The cookie that keeps it: httpOnly, so only the server reads it. */
export const AFTER_SIGN_IN_COOKIE = "ca_after_sign_in";

/**
 * How long it is kept, in seconds: a code lasts 10 minutes, plus typing the
 * number and the wait between two codes.
 */
export const AFTER_SIGN_IN_MAX_AGE = 15 * 60;

/** The longest page kept, its query included. */
export const AFTER_SIGN_IN_MAX_LENGTH = 512;

/**
 * The screens a link can keep: proxy.ts's PRIVATE but Today, where sign-in
 * lands anyway, the console, which the team reaches from Today as before,
 * and the file routes (photos, a list's photos, chat's files, the official
 * documents' files), which are no screen to land on. A new private screen
 * fails tooling/after-sign-in.test.ts until it is in one list or the other.
 */
export const AFTER_SIGN_IN_SCREENS = [
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
] as const;

/**
 * Route handlers under those screens, never kept. A page kept through
 * sign-in comes back as the app's own request (the door sends the browser
 * on), so a route that trusts only its own site's requests
 * (`Sec-Fetch-Site`: the month's pay file, logged as it goes out; a
 * notification marked read) would take another site's link for one of its
 * own. A page is safe to keep: opened from another site while signed in it
 * renders just the same, and no page writes on GET.
 * tooling/after-sign-in.test.ts finds every route.ts, so a new one under a
 * kept screen fails there until it is listed.
 */
export const NEVER_AFTER_SIGN_IN = [
  "/clock/pay/export",
  "/clock/code/issue",
  "/notifications/open",
] as const;

/** A phone's notification, opened from outside the app's pages. */
const NOTIFICATION_OPEN = "/notifications/open";
/**
 * The inbox (INBOX_PATH), of the business the app opens in after sign-in:
 * for someone in two businesses, maybe not the one that holds the line.
 */
const INBOX = "/notifications";

/** Parsed against this, a kept page must come back exactly as it was. */
const BASE = "https://after-sign-in.invalid";
/** What an address carries as a browser sends it: printable ASCII. */
const PRINTABLE = /^[\x21-\x7e]+$/;
/** A slash, a backslash, a dot or a control character, percent-encoded. */
const ENCODED = /%(2f|5c|2e|[01][0-9a-f]|7f)/i;
/**
 * The path itself plain: segments of letters, digits, `.`, `_` and `-`, so
 * no empty one (`//`), and nothing percent-encoded that a route could read
 * decoded.
 */
const PLAIN_PATH = /^(\/[A-Za-z0-9._-]+)+$/;

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The page to keep for after sign-in, as given, or null: a path inside the
 * app (`isAppPath`), at most 512 characters, with no `#` and nothing
 * percent-encoded that could turn into a slash, a dot or a control
 * character; read as an address it must come back exactly as given (no dot
 * segment, nothing a browser drops, turns or encodes) with a plain path; on
 * one of the kept screens, and never a route handler. Checked when the
 * proxy keeps it and again when a door takes it, since a cookie is input
 * too.
 */
export function afterSignInPath(raw: unknown): `/${string}` | null {
  if (!isAppPath(raw) || raw.length > AFTER_SIGN_IN_MAX_LENGTH) return null;
  if (!PRINTABLE.test(raw) || raw.includes("#") || ENCODED.test(raw)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || `${url.pathname}${url.search}` !== raw) {
    return null;
  }
  const path = url.pathname;
  if (!PLAIN_PATH.test(path)) return null;
  if (!AFTER_SIGN_IN_SCREENS.some((screen) => under(path, screen))) {
    return null;
  }
  const lower = path.toLowerCase();
  if (NEVER_AFTER_SIGN_IN.some((route) => under(lower, route))) return null;
  return raw;
}

/** Whether a path opens a phone's notification (its route, never kept). */
function opensNotification(pathname: string): boolean {
  return under(pathname.toLowerCase(), NOTIFICATION_OPEN);
}

/**
 * The page to keep for a request's path and query: a phone's notification
 * opened after the session ended keeps the inbox, since its own route is
 * never kept, which is the inbox of the business the app opens in, for
 * someone in two businesses maybe not the one that holds the line; anything
 * else as `afterSignInPath` says.
 */
export function afterSignInPathOf(
  pathname: string,
  search: string,
): `/${string}` | null {
  if (opensNotification(pathname)) return INBOX;
  return afterSignInPath(`${pathname}${search}`);
}

/**
 * Whether a page opened in the window came from outside the app's own
 * pages, the only kind whose path the proxy keeps or forgets: a link from
 * another site or app, an address typed or a bookmark (`Sec-Fetch-Site`
 * cross-site, same-site or none), or a browser that doesn't say. One the
 * app's own page sent there (same-origin: a reload, a link inside the app,
 * the router falling back to a whole page) is never a link someone followed
 * in, and leaves the kept page as it was: a tab left open after its session
 * ended comes to the door that way, and keeping its page would land the next
 * person to sign in on that device on the last one's screen, a chat with
 * someone. A phone's notification counts whatever it says: the service
 * worker opens it, which a browser may report as same-origin, and it keeps
 * only the inbox.
 */
export function isOpenedFromOutside(
  headers: { get(name: string): string | null },
  pathname: string,
): boolean {
  if (opensNotification(pathname)) return true;
  return headers.get("sec-fetch-site") !== "same-origin";
}

/** Headers only the app's own router sends with its fetches. */
const ROUTER_HEADERS = [
  "rsc",
  "next-action",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-router-state-tree",
];

/**
 * Whether a request is a page opened in the window, the only kind whose
 * path the proxy keeps or forgets: a GET navigating a document
 * (`Sec-Fetch-Mode` navigate and `Sec-Fetch-Dest` document; from a browser
 * that sends neither, as Safari before 16.4, one that asks for HTML), never
 * the router's own fetches, a prefetch, an image or a frame. So the
 * router's fetches just after signing out, with the session gone, never
 * keep a page again once signing out forgot it. Next.js takes the router's
 * own headers and `_rsc` off a request before the proxy sees it, so the
 * Sec-Fetch pair, or the Accept header, is what tells; the router's are
 * refused too, should one ever reach here.
 */
export function isDocumentNavigation(
  method: string,
  headers: { get(name: string): string | null },
  search: string,
): boolean {
  if (method !== "GET") return false;
  const mode = headers.get("sec-fetch-mode");
  if (mode !== null && mode !== "navigate") return false;
  const dest = headers.get("sec-fetch-dest");
  if (dest !== null && dest !== "document") return false;
  if (mode === null && dest === null) {
    // A fetch asks for anything (*/*) and an image for images.
    if (!/\btext\/html\b/i.test(headers.get("accept") ?? "")) return false;
  }
  if (ROUTER_HEADERS.some((name) => headers.get(name) !== null)) return false;
  const purpose = headers.get("sec-purpose") ?? headers.get("purpose") ?? "";
  if (/prefetch/i.test(purpose)) return false;
  return !new URLSearchParams(search).has("_rsc");
}
