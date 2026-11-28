import { afterEach, describe, expect, it, vi } from "vitest";
import {
  holdPersonPutAway,
  INSTALL_PUT_AWAY_KEY,
  installPutAway,
  MOMENT_SEEN_KEY,
  momentSeenHere,
  personPutAwayHere,
  putInstallAway,
  putMomentSeen,
  saveSubscription,
} from "./push-client";

// The steps to the home screen put away in this browser (closing the pilot,
// PR 6): kept in its own storage, never for the person, and nothing breaks
// where storage is blocked (a private window, cleared site data).

/** A browser's localStorage, or one that refuses every call. */
function storage(refuses = false) {
  const kept = new Map<string, string>();
  const refuse = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (refuses ? refuse() : (kept.get(key) ?? null)),
    setItem: (key: string, value: string) =>
      refuses ? refuse() : kept.set(key, value),
  });
  return kept;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the steps put away in this browser", () => {
  it("aren't, until they are, and then stay put away", () => {
    const kept = storage();
    expect(installPutAway()).toBe(false);
    putInstallAway();
    expect(kept.has(INSTALL_PUT_AWAY_KEY)).toBe(true);
    expect(installPutAway()).toBe(true);
  });

  it("come again where storage is blocked, and nothing throws", () => {
    storage(true);
    expect(() => putInstallAway()).not.toThrow();
    expect(installPutAway()).toBe(false);
  });

  it("come again where there is no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => putInstallAway()).not.toThrow();
    expect(installPutAway()).toBe(false);
  });
});

// A moment's card seen and left (after the check): kept in this browser, so
// it doesn't come again here, while nothing is kept for the person and
// Today's card goes on asking (`pushAskMark`'s `seenHere`).
describe("a moment's card seen in this browser", () => {
  it("isn't, until it is, apart from the steps put away", () => {
    const kept = storage();
    expect(momentSeenHere()).toBe(false);
    putMomentSeen();
    expect(kept.has(MOMENT_SEEN_KEY)).toBe(true);
    expect(momentSeenHere()).toBe(true);
    // Today's steps in Safari aren't put away by it.
    expect(installPutAway()).toBe(false);
  });

  it("comes again where storage is blocked or missing, and nothing throws", () => {
    storage(true);
    expect(() => putMomentSeen()).not.toThrow();
    expect(momentSeenHere()).toBe(false);
    vi.stubGlobal("localStorage", undefined);
    expect(() => putMomentSeen()).not.toThrow();
    expect(momentSeenHere()).toBe(false);
  });
});

// The kind of device sent with a subscription (after the check): an iPad
// that asks for the desktop site says a Mac's user agent, which the server
// reads as a computer; only the browser, by its touch screen, can say iPad.
describe("saving a subscription", () => {
  const IPAD_AS_MAC =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

  /** A browser saying `userAgent`, with `maxTouchPoints`; what it posts. */
  function browser(userAgent: string, maxTouchPoints: number) {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      PushManager: {},
      Notification: {},
    });
    vi.stubGlobal("navigator", {
      userAgent,
      maxTouchPoints,
      serviceWorker: {},
    });
    const posted: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        posted.push(JSON.parse(init.body));
        return new Response(null, { status: 200 });
      }),
    );
    return posted;
  }

  const subscription = {
    toJSON: () => ({
      endpoint: "https://web.push.apple.com/abc",
      keys: { p256dh: "p", auth: "a" },
    }),
  } as unknown as PushSubscription;

  it("says iPad for an iPad that asks for the desktop site", async () => {
    const posted = browser(IPAD_AS_MAC, 5);
    expect(await saveSubscription(subscription)).toBe("saved");
    expect(posted).toEqual([
      expect.objectContaining({
        endpoint: "https://web.push.apple.com/abc",
        label: "ipad",
      }),
    ]);
  });

  it("says computer for a Mac, with the endpoint it replaces", async () => {
    const posted = browser(IPAD_AS_MAC, 0);
    await saveSubscription(subscription, "https://web.push.apple.com/old");
    expect(posted).toEqual([
      expect.objectContaining({
        label: "computer",
        replaces: "https://web.push.apple.com/old",
      }),
    ]);
  });
});

// Today's "לא עכשיו" for the person, known in this page from the press on,
// while its write is still held for "ביטול": a moment's card on a screen
// drawn before the write lands offers nothing then (`usePushAskOnce`; the
// whole way, e2e/push-card.spec.ts). Never in storage.
describe("Today's 'לא עכשיו' for the person, in this page", () => {
  afterEach(() => holdPersonPutAway(false));

  it("isn't said until it is, and 'ביטול' takes it back", () => {
    expect(personPutAwayHere()).toBe(false);
    holdPersonPutAway(true);
    expect(personPutAwayHere()).toBe(true);
    holdPersonPutAway(false);
    expect(personPutAwayHere()).toBe(false);
  });

  it("keeps nothing in the browser's storage", () => {
    const kept = storage();
    holdPersonPutAway(true);
    expect(kept.size).toBe(0);
  });
});
