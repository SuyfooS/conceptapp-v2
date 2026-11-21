import { expect, type Page } from "@playwright/test";
import type { MockPushService } from "./mock-push";

// What the push specs share (push.spec.ts, and waiter mode P8b's
// order-push.spec.ts): headless Chromium can't subscribe for real (it needs
// Google's push service), so the page's PushManager is a fake with an
// endpoint on the loopback mock push service (PUSH_TEST_ORIGIN), and the
// rest is real.

/** The page's PushManager, faked: a subscription on the mock push service. */
export async function fakePushManager(page: Page, origin: string) {
  await page.addInitScript((origin: string) => {
    const KEY = "e2e-push-subscription";
    const b64 = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const unb64 = (text: string) =>
      Uint8Array.from(
        atob(
          text.replace(/-/g, "+").replace(/_/g, "/") +
            "=".repeat((4 - (text.length % 4)) % 4),
        ),
        (c) => c.charCodeAt(0),
      );
    type Stored = {
      endpoint: string;
      key: string;
      p256dh: string;
      auth: string;
    };
    const make = (stored: Stored) => ({
      endpoint: stored.endpoint,
      expirationTime: null,
      options: {
        userVisibleOnly: true,
        applicationServerKey: unb64(stored.key).buffer,
      },
      getKey: (name: string) =>
        unb64(name === "p256dh" ? stored.p256dh : stored.auth).buffer,
      toJSON: () => ({
        endpoint: stored.endpoint,
        expirationTime: null,
        keys: { p256dh: stored.p256dh, auth: stored.auth },
      }),
      unsubscribe: async () => {
        localStorage.removeItem(KEY);
        return true;
      },
    });
    // Headless Chromium keeps notifications denied whatever the context
    // grants, so the page is told what a phone that allowed them would say.
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "granted",
    });
    Notification.requestPermission = async () => "granted";
    const proto = PushManager.prototype as unknown as {
      subscribe: (options: { applicationServerKey: BufferSource }) => unknown;
      getSubscription: () => unknown;
    };
    proto.subscribe = async (options) => {
      const key = options.applicationServerKey;
      const bytes =
        key instanceof ArrayBuffer
          ? new Uint8Array(key)
          : new Uint8Array(key.buffer, key.byteOffset, key.byteLength);
      const p256dh = crypto.getRandomValues(new Uint8Array(65));
      p256dh[0] = 4;
      const stored: Stored = {
        endpoint: `${origin}/push/${crypto.randomUUID()}`,
        key: b64(bytes),
        p256dh: b64(p256dh),
        auth: b64(crypto.getRandomValues(new Uint8Array(16))),
      };
      localStorage.setItem(KEY, JSON.stringify(stored));
      return make(stored);
    };
    proto.getSubscription = async () => {
      const raw = localStorage.getItem(KEY);
      return raw ? make(JSON.parse(raw) as Stored) : null;
    };
  }, origin);
}

/** Wait until the mock has had `count` pushes, and give them back. */
export async function pushes(
  mock: MockPushService,
  count: number,
  timeout = 15_000,
) {
  await expect.poll(() => mock.seen.length, { timeout }).toBe(count);
  return mock.seen;
}
