import { describe, expect, it } from "vitest";
import {
  type BrowserFacts,
  DEFAULT_TTL,
  deviceLabel,
  iosVersion,
  isPhone,
  pushBatch,
  pushInboxBody,
  pushOutcome,
  pushSubscriptionBody,
  pushSupport,
  pushTtl,
  retryAfterSeconds,
} from "./push";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const OLD_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const facts = (extra: Partial<BrowserFacts>): BrowserFacts => ({
  userAgent: DESKTOP,
  maxTouchPoints: 0,
  standalone: false,
  canPush: true,
  ...extra,
});

describe("pushOutcome", () => {
  it("reads what each push service answer means", () => {
    expect([200, 201, 202].map(pushOutcome)).toEqual(["ok", "ok", "ok"]);
    expect([404, 410].map(pushOutcome)).toEqual(["gone", "gone"]);
    expect([429, 500, 502, 503].map(pushOutcome)).toEqual([
      "retry",
      "retry",
      "retry",
      "retry",
    ]);
    expect(pushOutcome(null)).toBe("retry");
  });

  it("never forgets a device on a refusal that may be a mistake of ours", () => {
    expect([400, 401, 403, 413].map(pushOutcome)).toEqual([
      "refused",
      "refused",
      "refused",
      "refused",
    ]);
  });
});

describe("retryAfterSeconds", () => {
  const now = Date.parse("2026-11-09T10:00:00Z");

  it("reads seconds or a date, up to an hour", () => {
    expect(retryAfterSeconds("120", now)).toBe(120);
    expect(retryAfterSeconds("Mon, 09 Nov 2026 10:05:00 GMT", now)).toBe(300);
    expect(retryAfterSeconds("99999", now)).toBe(3600);
    expect(retryAfterSeconds("Mon, 09 Nov 2026 09:00:00 GMT", now)).toBe(0);
  });

  it("is null without a readable value", () => {
    expect(retryAfterSeconds(null, now)).toBeNull();
    expect(retryAfterSeconds("", now)).toBeNull();
    expect(retryAfterSeconds("soon", now)).toBeNull();
  });
});

describe("pushTtl", () => {
  const now = Date.parse("2026-11-09T10:00:00Z");

  it("keeps a push a day", () => {
    expect(pushTtl([null], now)).toBe(DEFAULT_TTL);
    expect(pushTtl([], now)).toBe(DEFAULT_TTL);
    expect(pushTtl(["2026-11-09T10:10:00Z", null], now)).toBe(DEFAULT_TTL);
  });

  it("or until its lines stop mattering, at least a minute", () => {
    expect(pushTtl(["2026-11-09T10:10:00Z"], now)).toBe(600);
    expect(pushTtl(["2026-11-09T10:10:00Z", "2026-11-09T10:20:00Z"], now)).toBe(
      1200,
    );
    expect(pushTtl(["2026-11-09T10:00:10Z"], now)).toBe(60);
    expect(pushTtl(["2026-11-12T10:00:00Z"], now)).toBe(DEFAULT_TTL);
  });
});

describe("devices", () => {
  it("are kept as a coarse word", () => {
    expect(deviceLabel(IPHONE)).toBe("iphone");
    expect(
      deviceLabel(IPHONE.replace("iPhone; CPU iPhone OS", "iPad; CPU OS")),
    ).toBe("ipad");
    expect(deviceLabel(ANDROID)).toBe("android");
    expect(deviceLabel(DESKTOP)).toBe("computer");
    expect(deviceLabel(null)).toBe("computer");
  });

  it("say which iOS they run", () => {
    expect(iosVersion(IPHONE)).toEqual([17, 5]);
    expect(iosVersion(OLD_IPHONE)).toEqual([16, 3]);
    expect(iosVersion(IPAD_AS_MAC)).toEqual([17, 4]);
  });

  it("are phones only when they are", () => {
    expect(isPhone(facts({ userAgent: IPHONE }))).toBe(true);
    expect(isPhone(facts({ userAgent: ANDROID }))).toBe(true);
    expect(isPhone(facts({ userAgent: ANDROID_TABLET }))).toBe(false);
    expect(isPhone(facts({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }))).toBe(
      false,
    );
    expect(isPhone(facts({}))).toBe(false);
  });
});

describe("pushSupport", () => {
  it("is ready where the browser can push", () => {
    expect(pushSupport(facts({}))).toBe("ready");
    expect(pushSupport(facts({ userAgent: ANDROID }))).toBe("ready");
  });

  it("asks an iPhone in Safari to add the app to the home screen", () => {
    expect(pushSupport(facts({ userAgent: IPHONE, canPush: false }))).toBe(
      "installFirst",
    );
    expect(
      pushSupport(
        facts({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5, canPush: false }),
      ),
    ).toBe("installFirst");
    expect(
      pushSupport(
        facts({ userAgent: IPHONE, standalone: true, canPush: true }),
      ),
    ).toBe("ready");
  });

  it("says when an iPhone is too old", () => {
    expect(pushSupport(facts({ userAgent: OLD_IPHONE, canPush: false }))).toBe(
      "iosTooOld",
    );
  });

  it("offers nothing where there is no push", () => {
    expect(pushSupport(facts({ canPush: false }))).toBe("unsupported");
    // A Mac without touch is a computer, whatever its Safari.
    expect(pushSupport(facts({ userAgent: IPAD_AS_MAC, canPush: false }))).toBe(
      "unsupported",
    );
  });
});

describe("pushBatch", () => {
  it("shows up to three lines one by one, more as one summary", () => {
    expect(pushBatch([1, 2, 3])).toEqual({ kind: "lines", lines: [1, 2, 3] });
    expect(pushBatch([])).toEqual({ kind: "lines", lines: [] });
    expect(pushBatch([1, 2, 3, 4, 5])).toEqual({ kind: "summary", count: 5 });
  });
});

describe("the bodies", () => {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    expirationTime: null,
    keys: {
      p256dh: `B${"A".repeat(86)}`,
      auth: "aW5zdGFudC1hdXRoLWtleQ",
    },
  };

  it("take a browser's subscription", () => {
    expect(pushSubscriptionBody.safeParse(subscription).success).toBe(true);
    expect(
      pushSubscriptionBody.safeParse({
        ...subscription,
        replaces: "https://fcm.googleapis.com/fcm/send/old",
      }).success,
    ).toBe(true);
  });

  it("refuse keys that aren't keys", () => {
    for (const keys of [
      { p256dh: "short", auth: subscription.keys.auth },
      { p256dh: subscription.keys.p256dh, auth: "not base64!" },
      { p256dh: subscription.keys.p256dh },
    ]) {
      expect(
        pushSubscriptionBody.safeParse({ ...subscription, keys }).success,
      ).toBe(false);
    }
  });

  it("take what a service worker asks with", () => {
    expect(pushInboxBody.safeParse({ endpoint: null }).success).toBe(true);
    expect(
      pushInboxBody.safeParse({ endpoint: subscription.endpoint }).success,
    ).toBe(true);
    expect(pushInboxBody.safeParse({}).success).toBe(false);
  });
});
