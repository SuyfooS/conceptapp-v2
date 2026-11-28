import { describe, expect, it } from "vitest";
import {
  type BrowserFacts,
  browserDeviceLabel,
  DEFAULT_TTL,
  type DeviceLabel,
  deviceKinds,
  deviceLabel,
  installedHere,
  iosVersion,
  isPhone,
  type PushAskEvent,
  type PushAskFacts,
  type PushAskPlace,
  type PushAskState,
  pushAskMark,
  pushAskStart,
  pushBatch,
  pushInboxBody,
  pushOutcome,
  pushSubscriptionBody,
  pushSupport,
  pushTtl,
  retryAfterSeconds,
  savedDeviceLabel,
  summaryPlace,
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

  it("are told by the browser too: an iPad asking for the desktop site is an iPad", () => {
    // Safari's default on an iPad: a Mac's user agent, and a touch screen.
    expect(
      browserDeviceLabel(facts({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })),
    ).toBe("ipad");
    // A Mac has no touch screen: a computer, as the server says.
    expect(browserDeviceLabel(facts({ userAgent: IPAD_AS_MAC }))).toBe(
      "computer",
    );
    // A touch screen alone makes nothing an iPad.
    expect(browserDeviceLabel(facts({ maxTouchPoints: 10 }))).toBe("computer");
    expect(
      browserDeviceLabel(facts({ userAgent: ANDROID, maxTouchPoints: 5 })),
    ).toBe("android");
    for (const userAgent of [IPHONE, ANDROID, DESKTOP]) {
      expect(browserDeviceLabel(facts({ userAgent }))).toBe(
        deviceLabel(userAgent),
      );
    }
  });

  it("are saved by the user agent, which the browser only refines to an iPad", () => {
    expect(savedDeviceLabel("computer", "ipad")).toBe("ipad");
    expect(savedDeviceLabel("computer", undefined)).toBe("computer");
    expect(savedDeviceLabel("computer", "iphone")).toBe("computer");
    expect(savedDeviceLabel("computer", "android")).toBe("computer");
    // What the user agent tells for itself is never changed.
    expect(savedDeviceLabel("iphone", "ipad")).toBe("iphone");
    expect(savedDeviceLabel("android", "ipad")).toBe("android");
    expect(savedDeviceLabel("ipad", "computer")).toBe("ipad");
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

  it("are read back as their kinds, each once, an unknown one left out", () => {
    expect(
      deviceKinds.parse(["iphone", "computer", "iphone", null, "watch", 3]),
    ).toEqual(["iphone", "computer"]);
    expect(deviceKinds.parse([])).toEqual([]);
    expect(deviceKinds.safeParse(null).success).toBe(false);
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

// The offer to turn notifications on (closing the pilot, PR 6): Today's card
// for everyone, and the quiet card after a moment.
const asked = (extra: Partial<PushAskFacts>): PushAskFacts => ({
  support: "ready",
  permission: "default",
  subscribed: false,
  installPutAway: false,
  installedHere: false,
  ...extra,
});

describe("pushAskStart", () => {
  it("offers the way to turn them on where push is ready and off", () => {
    expect(pushAskStart(asked({}))).toBe("off");
    // Allowed before, and turned off since: offered again.
    expect(pushAskStart(asked({ permission: "granted" }))).toBe("off");
  });

  it("offers nothing where this browser has them or blocks them", () => {
    expect(pushAskStart(asked({ subscribed: true }))).toBe("none");
    expect(pushAskStart(asked({ permission: "denied" }))).toBe("none");
  });

  it("offers nothing where push can't come", () => {
    expect(pushAskStart(asked({ support: "unsupported" }))).toBe("none");
    expect(pushAskStart(asked({ support: "iosTooOld" }))).toBe("none");
  });

  it("shows the steps to the home screen in an iPhone's Safari", () => {
    expect(pushAskStart(asked({ support: "installFirst" }))).toBe("install");
    // Whatever Safari says of its permission, which it can't use.
    expect(
      pushAskStart(asked({ support: "installFirst", permission: "denied" })),
    ).toBe("install");
  });

  it("leaves the steps out once put away in this browser, or done", () => {
    expect(
      pushAskStart(asked({ support: "installFirst", installPutAway: true })),
    ).toBe("none");
    expect(
      pushAskStart(asked({ support: "installFirst", installedHere: true })),
    ).toBe("none");
  });

  it("asks again in the app on the home screen, whatever Safari put away", () => {
    // The home-screen app is `ready`: its own storage, nothing put away.
    expect(pushAskStart(asked({ installPutAway: true }))).toBe("off");
    expect(pushAskStart(asked({ installedHere: true }))).toBe("off");
  });
});

describe("installedHere", () => {
  const all: DeviceLabel[] = ["iphone", "ipad", "android", "computer"];

  it("is an iPhone or iPad with the app's notifications on", () => {
    expect(installedHere("iphone", ["computer", "iphone"])).toBe(true);
    expect(installedHere("ipad", ["ipad"])).toBe(true);
  });

  it("is never another kind of device, or another kind of Apple's", () => {
    expect(installedHere("iphone", ["ipad", "computer"])).toBe(false);
    expect(installedHere("ipad", ["iphone"])).toBe(false);
    expect(installedHere("iphone", [])).toBe(false);
    // A computer's browser has no home-screen app of this kind.
    expect(installedHere("computer", all)).toBe(false);
    expect(installedHere("android", all)).toBe(false);
  });
});

describe("pushAskMark", () => {
  const places: PushAskPlace[] = ["today", "moment"];
  const states: PushAskState[] = [
    "install",
    "off",
    "working",
    "on",
    "denied",
    "failed",
  ];
  const events: PushAskEvent[] = ["seen", "enable", "settings", "dismiss"];

  it("never counts the steps to the home screen as asked", () => {
    for (const place of places) {
      for (const event of events) {
        expect(
          pushAskMark(place, "install", event),
          `${place} ${event}`,
        ).not.toBe("person");
      }
    }
  });

  it("puts the steps away in this browser on Today's 'לא עכשיו' alone", () => {
    expect(pushAskMark("today", "install", "dismiss")).toBe("device");
    for (const event of ["seen", "enable", "settings"] as const) {
      expect(pushAskMark("today", "install", event), event).toBeNull();
    }
  });

  it("keeps a moment's steps in this browser: seen, as seen; pressed, put away", () => {
    expect(pushAskMark("moment", "install", "seen")).toBe("seenHere");
    for (const event of ["enable", "settings", "dismiss"] as const) {
      expect(pushAskMark("moment", "install", event), event).toBe("device");
    }
  });

  it("keeps Today's card only by 'לא עכשיו', for the person", () => {
    for (const state of ["off", "working", "failed"] as const) {
      expect(pushAskMark("today", state, "dismiss"), state).toBe("person");
    }
    for (const state of states) {
      for (const event of ["seen", "enable", "settings"] as const) {
        expect(
          pushAskMark("today", state, event),
          `${state} ${event}`,
        ).toBeNull();
      }
    }
  });

  it("keeps nothing when Today's card closes on what came of a press", () => {
    expect(pushAskMark("today", "on", "dismiss")).toBeNull();
    expect(pushAskMark("today", "denied", "dismiss")).toBeNull();
  });

  it("keeps a moment's card only seen in this browser, so Today's goes on", () => {
    for (const state of states) {
      expect(pushAskMark("moment", state, "seen"), state).toBe("seenHere");
    }
  });

  it("keeps a moment's card for the person once it is answered, as before", () => {
    for (const state of states.filter((s) => s !== "install")) {
      for (const event of ["enable", "settings", "dismiss"] as const) {
        expect(pushAskMark("moment", state, event), `${state} ${event}`).toBe(
          "person",
        );
      }
    }
  });

  it("never keeps Today's card as seen", () => {
    for (const state of states) {
      for (const event of events) {
        expect(
          pushAskMark("today", state, event),
          `${state} ${event}`,
        ).not.toBe("seenHere");
      }
    }
  });
});

describe("pushBatch", () => {
  it("shows up to three lines one by one, more as one summary", () => {
    expect(pushBatch([1, 2, 3])).toEqual({ kind: "lines", lines: [1, 2, 3] });
    expect(pushBatch([])).toEqual({ kind: "lines", lines: [] });
    expect(pushBatch([1, 2, 3, 4, 5])).toEqual({ kind: "summary", count: 5 });
  });
});

describe("summaryPlace", () => {
  it("opens the inbox when every line is from the business the person is in", () => {
    expect(summaryPlace(["a", "a", "a", "a"], "a")).toBe("inbox");
  });

  it("opens Home when a line is from another business, which the inbox doesn't list", () => {
    expect(summaryPlace(["a", "b", "a", "a"], "a")).toBe("home");
    expect(summaryPlace(["b", "b", "b", "b"], "a")).toBe("home");
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

  it("take the kind of device the browser says, and leave out one they don't know", () => {
    expect(
      pushSubscriptionBody.parse({ ...subscription, label: "ipad" }).label,
    ).toBe("ipad");
    expect(pushSubscriptionBody.parse(subscription).label).toBeUndefined();
    for (const label of ["watch", 3, null]) {
      const parsed = pushSubscriptionBody.safeParse({ ...subscription, label });
      expect(parsed.success, String(label)).toBe(true);
      expect(parsed.data?.label, String(label)).toBeUndefined();
    }
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
