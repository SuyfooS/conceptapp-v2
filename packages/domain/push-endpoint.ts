/**
 * Where a browser's push subscription may send us: its endpoint is client
 * input, and the server POSTs to it, so it must be a push service we know and
 * nothing else (no internal address, no other site). https on port 443, no
 * user or password in it, and a host from the list below. The loopback mock
 * push service of the browser tests is let in only when the caller says so
 * (`testOrigin`, which @db/push/env gives only off Vercel).
 */

/** Exact hosts of the push services browsers use. */
const PUSH_HOSTS = new Set([
  // Chrome, Edge on Android, Samsung Internet and other Chromium browsers.
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Firefox.
  "updates.push.services.mozilla.com",
  // Safari on macOS, and iPhones and iPads from iOS 16.4 (home-screen apps).
  "web.push.apple.com",
]);

/** Push services that hand out a host of their own under these domains. */
const PUSH_DOMAINS = [
  // Apple asks to allow every host under it.
  ".push.apple.com",
  // Edge on Windows (Windows Push Notification Services).
  ".notify.windows.com",
];

/** Longest endpoint kept, as the database allows. */
export const MAX_ENDPOINT_LENGTH = 1024;

const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])$/;

/**
 * The loopback origin of a mock push service (`http://127.0.0.1:3199`), or
 * null when the value isn't one: anything else is never trusted as a test
 * origin.
 */
export function loopbackOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!LOOPBACK.test(url.hostname)) return null;
  if (url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

function knownHost(host: string): boolean {
  if (PUSH_HOSTS.has(host)) return true;
  return PUSH_DOMAINS.some(
    (domain) => host.endsWith(domain) && host.length > domain.length,
  );
}

/**
 * The endpoint, parsed, when the server may send to it; else null.
 * `testOrigin` is the one loopback origin the browser tests stand up.
 */
export function pushEndpointOf(
  raw: unknown,
  options: { testOrigin?: string | null } = {},
): URL | null {
  if (typeof raw !== "string" || raw.length > MAX_ENDPOINT_LENGTH) return null;
  // Whitespace, control characters or a backslash: a URL parser may read them
  // differently from the push service.
  if (!/^[\x21-\x7e]+$/.test(raw) || raw.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.hash) return null;

  if (options.testOrigin && url.origin === options.testOrigin) return url;

  if (url.protocol !== "https:") return null;
  // An explicit :443 is dropped by the parser; any other port is refused.
  if (url.port !== "") return null;
  const host = url.hostname.toLowerCase();
  if (host.endsWith(".")) return null;
  return knownHost(host) ? url : null;
}
