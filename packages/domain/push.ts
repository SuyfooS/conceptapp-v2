import { z } from "zod";
import { MAX_ENDPOINT_LENGTH } from "./push-endpoint";

/**
 * Notifications on the phone (Web Push, RFC 8030): the pure parts. A push
 * carries no payload; the phone's service worker asks /push/inbox what to
 * show. What a push service's answer means, how long a push may wait, what a
 * phone shows when several lines arrive at once, and what kind of device a
 * browser is.
 */

/** What a push service's answer means for one device. */
export type PushOutcome = "ok" | "gone" | "refused" | "retry";

/**
 * A push service's status, or null for no answer (a network error, a timeout):
 *   2xx       taken.
 *   404, 410  the subscription is gone: forget the device.
 *   429, 5xx  busy or broken: try again later.
 *   other 4xx refused. 400 and 403 are also what a mistake of ours looks like
 *             (Apple's BadJwtToken, a rotated key), so they count against the
 *             device instead of forgetting it on the spot.
 */
export function pushOutcome(status: number | null): PushOutcome {
  if (status === null) return "retry";
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410) return "gone";
  if (status === 429 || status >= 500) return "retry";
  return "refused";
}

/** The longest wait a push service may ask for that is honoured, in seconds. */
export const MAX_RETRY_AFTER = 3600;

/**
 * A Retry-After header in seconds (delta seconds, or an HTTP date), capped at
 * an hour; null when absent or unreadable.
 */
export function retryAfterSeconds(
  header: string | null | undefined,
  now: number,
): number | null {
  if (!header) return null;
  const value = header.trim();
  let seconds: number;
  if (/^\d+$/.test(value)) {
    seconds = Number(value);
  } else {
    const at = Date.parse(value);
    if (Number.isNaN(at)) return null;
    seconds = Math.ceil((at - now) / 1000);
  }
  return Math.min(Math.max(seconds, 0), MAX_RETRY_AFTER);
}

/** How long a push service keeps a push for a phone that is off: a day. */
export const DEFAULT_TTL = 24 * 60 * 60;

/**
 * The push's time to live, in seconds: a day, or until the latest of its lines
 * stops mattering when every one of them has such a time (a reminder that is
 * no use afterwards). At least a minute.
 */
export function pushTtl(
  validUntil: readonly (string | null)[],
  now: number,
): number {
  if (validUntil.length === 0 || validUntil.some((v) => v === null)) {
    return DEFAULT_TTL;
  }
  const latest = Math.max(...validUntil.map((v) => Date.parse(v ?? "") || now));
  const seconds = Math.floor((latest - now) / 1000);
  return Math.min(Math.max(seconds, 60), DEFAULT_TTL);
}

/** The coarse word kept for a device, from its browser's user agent. */
export type DeviceLabel = "iphone" | "ipad" | "android" | "computer";

/**
 * What kind of device a user agent is, coarsely, for the list of devices; the
 * user agent itself is not kept. An iPad that asks for the desktop site says
 * it is a Mac, and is a computer here.
 */
export function deviceLabel(userAgent: string | null | undefined): DeviceLabel {
  const ua = userAgent ?? "";
  if (/\biPhone\b|\biPod\b/.test(ua)) return "iphone";
  if (/\biPad\b/.test(ua)) return "ipad";
  if (/\bAndroid\b/.test(ua)) return "android";
  return "computer";
}

/** What the browser can tell about itself, for the push switch. */
export type BrowserFacts = {
  userAgent: string;
  /** `navigator.maxTouchPoints`: an iPad that says it is a Mac has some. */
  maxTouchPoints: number;
  /** Opened from the home screen (`display-mode: standalone`, `navigator.standalone`). */
  standalone: boolean;
  /** `serviceWorker`, `PushManager` and `Notification` are all there. */
  canPush: boolean;
};

/** iOS and iPadOS, whose Safari has push only in a home-screen app from 16.4. */
export function isAppleMobile(facts: BrowserFacts): boolean {
  if (/\b(iPhone|iPad|iPod)\b/.test(facts.userAgent)) return true;
  return /\bMacintosh\b/.test(facts.userAgent) && facts.maxTouchPoints > 1;
}

/** The iOS version a user agent says, as [major, minor], or null. */
export function iosVersion(userAgent: string): [number, number] | null {
  const match = /\bOS (\d+)[_.](\d+)/.exec(userAgent);
  if (!match) {
    // An iPad asking for the desktop site says only Safari's version.
    const safari = /\bVersion\/(\d+)\.(\d+)/.exec(userAgent);
    return safari ? [Number(safari[1]), Number(safari[2])] : null;
  }
  return [Number(match[1]), Number(match[2])];
}

/** Where the push switch stands before anyone presses it. */
export type PushSupport =
  /** Push works here. */
  | "ready"
  /** An iPhone or iPad in Safari: add the app to the home screen first. */
  | "installFirst"
  /** An iPhone or iPad older than iOS 16.4. */
  | "iosTooOld"
  /** No push in this browser: nothing is offered. */
  | "unsupported";

export function pushSupport(facts: BrowserFacts): PushSupport {
  if (isAppleMobile(facts)) {
    const version = iosVersion(facts.userAgent);
    if (version && (version[0] < 16 || (version[0] === 16 && version[1] < 4))) {
      return "iosTooOld";
    }
    if (!facts.standalone) return "installFirst";
    return facts.canPush ? "ready" : "unsupported";
  }
  return facts.canPush ? "ready" : "unsupported";
}

/** Whether to say "this phone" or "this device". */
export function isPhone(facts: BrowserFacts): boolean {
  return (
    /\b(iPhone|iPod)\b/.test(facts.userAgent) ||
    (/\bAndroid\b/.test(facts.userAgent) && /\bMobile\b/.test(facts.userAgent))
  );
}

const base64url = (min: number, max: number) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}={0,2}$`));

/**
 * What the browser posts to /push/subscription: `PushSubscription.toJSON()`,
 * and, from the service worker when the browser replaced a subscription by
 * itself, the endpoint it replaces.
 */
export const pushSubscriptionBody = z.object({
  endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    // 65 bytes and 16, base64url.
    p256dh: base64url(80, 98),
    auth: base64url(16, 30),
  }),
  replaces: z.string().min(1).max(MAX_ENDPOINT_LENGTH).optional(),
});

export type PushSubscriptionBody = z.infer<typeof pushSubscriptionBody>;

/** What the browser sends to forget this device. */
export const pushRemovalBody = z.object({
  endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH),
});

/** What the service worker posts to /push/inbox. */
export const pushInboxBody = z.object({
  endpoint: z.string().min(1).max(MAX_ENDPOINT_LENGTH).nullable(),
});

/** One notification as the phone shows it. */
export type PushNotice = {
  /** The line's id, "summary" for several, or "conceptapp" for a plain one. */
  tag: string;
  title: string;
  body?: string;
  /** A path inside the app. */
  url: `/${string}`;
  /** Milliseconds since the epoch. */
  timestamp?: number;
  lang: "he" | "en";
  dir: "rtl" | "ltr";
  /** Shown again in place of itself: no sound, no buzz. */
  silent?: boolean;
};

/** What /push/inbox answers. */
export type PushInboxAnswer = {
  notifications: PushNotice[];
  /** Unread lines, for the home-screen icon's count; null when unknown. */
  unread: number | null;
};

/** At most this many lines are shown one by one; more become one summary. */
export const PUSH_LINES_SHOWN = 3;

/**
 * What a phone shows for the lines that are new to it, newest first: each on
 * its own, up to three; more than that, one summary instead.
 */
export function pushBatch<T>(
  lines: readonly T[],
): { kind: "lines"; lines: T[] } | { kind: "summary"; count: number } {
  if (lines.length > PUSH_LINES_SHOWN) {
    return { kind: "summary", count: lines.length };
  }
  return { kind: "lines", lines: [...lines] };
}

/**
 * Where a summary of several lines opens (payroll P3b), from the businesses
 * the lines are from and the one the person is in now (`here`): the inbox
 * when every line is from `here`, since the inbox lists that business only;
 * else Home, where "העסקים שלי" says what is unread in each business.
 */
export function summaryPlace(
  businessIds: readonly string[],
  here: string,
): "inbox" | "home" {
  return businessIds.every((id) => id === here) ? "inbox" : "home";
}
