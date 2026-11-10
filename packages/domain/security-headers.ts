/**
 * What every response says to the browser about itself (the security check
 * of 8 November 2026, #80), read by next.config.ts on every host the app
 * answers on, conceptapp.co.il and conceptapp-v2.vercel.app alike.
 *
 * The content policy holds `frame-ancestors` alone: no other site may show
 * the app in a frame, so nobody can lay a page over its buttons. A full
 * policy (scripts, styles, images) would need a nonce on every Next.js
 * inline script and so every page rendered per request; until that is
 * worth it, the rest stays the browser's default.
 */

/**
 * What the app may ask the device for, and only on its own pages, never in
 * a frame: the camera for the clock's QR scanner (`@ui/use-qr-camera`), the
 * screen kept on while the clock's code is shown (`@ui/use-wake-lock`), and
 * full screen for the code (`/clock/code`). The rest is off for everyone.
 * Notifications on the phone (Web Push) are not a feature of this header:
 * the person allows them in the browser.
 */
export const PERMISSIONS_POLICY = [
  "camera=(self)",
  "screen-wake-lock=(self)",
  "fullscreen=(self)",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
].join(", ");

export type Header = { key: string; value: string };

/** On every response. */
export const SECURITY_HEADERS: readonly Header[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // The same for browsers that predate frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Another site sees where a visitor came from, never the path: an invite
  // link's token stays out of anyone else's logs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
];

/**
 * Paths kept out of search: the design gallery with its mock screens, and
 * invite links, each a token for one person. Each response under them says
 * `noindex` (below), as their page metadata does. `app/robots.ts` leaves
 * them crawlable on purpose: a crawler has to fetch a page to see its
 * noindex, and one told not to fetch it may still list the bare address.
 */
export const OUT_OF_SEARCH = ["/design", "/join"] as const;

export const NOINDEX: Header = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
};

/**
 * The service worker (public/sw.js), as the PWA guide serves it: always
 * fetched fresh, so a change reaches phones on their next visit, and able to
 * load nothing but itself.
 */
const SERVICE_WORKER: Header[] = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self'",
  },
];

export type HeaderRule = { source: string; headers: Header[] };

/**
 * next.config.ts's `headers()`. When two rules set the same header on a
 * path, the later one wins, so the service worker's own content policy
 * comes after the one for every page.
 */
export function headerRules(): HeaderRule[] {
  return [
    { source: "/:path*", headers: [...SECURITY_HEADERS] },
    ...OUT_OF_SEARCH.map((path) => ({
      source: `${path}/:path*`,
      headers: [NOINDEX],
    })),
    { source: "/sw.js", headers: SERVICE_WORKER },
  ];
}
