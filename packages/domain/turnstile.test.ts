import { describe, expect, it } from "vitest";
import {
  CAPTCHA_TOKEN_MAX,
  type CaptchaEvent,
  type CaptchaState,
  captchaErrorKind,
  captchaLanguageOf,
  captchaSizeFor,
  captchaTokenOf,
  nextCaptchaState,
  pressWaits,
  TURNSTILE_ORIGIN,
  TURNSTILE_SCRIPT,
  TURNSTILE_TEST_KEYS,
} from "./turnstile";

// The "אני לא רובוט" check before every SMS code (P9b): where it goes on
// each of Cloudflare's answers, which of its errors another try can fix,
// when a press waits, the box's size, and the token a send takes from a
// browser.

const STATES: CaptchaState[] = [
  "loading",
  "ready",
  "tap",
  "failed",
  "unavailable",
];

describe("nextCaptchaState", () => {
  const live = STATES.filter((state) => state !== "unavailable");

  it("is ready with a token, and on its way again once it expires, is spent or the tick is done", () => {
    for (const state of live) {
      expect(nextCaptchaState(state, { kind: "token" }), state).toBe("ready");
      for (const kind of ["expired", "reset", "settled"] as const) {
        expect(nextCaptchaState(state, { kind }), `${state} ${kind}`).toBe(
          "loading",
        );
      }
    }
  });

  it("asks for a tick when Cloudflare does", () => {
    for (const state of live) {
      expect(nextCaptchaState(state, { kind: "interactive" })).toBe("tap");
    }
  });

  it("fails or is unavailable by the error's code", () => {
    for (const state of live) {
      expect(nextCaptchaState(state, { kind: "error", code: "600010" })).toBe(
        "failed",
      );
      expect(nextCaptchaState(state, { kind: "error", code: "110200" })).toBe(
        "unavailable",
      );
    }
  });

  it("is unavailable without the script or in a browser Cloudflare doesn't run in", () => {
    for (const state of live) {
      for (const kind of ["scriptFailed", "unsupported"] as const) {
        expect(nextCaptchaState(state, { kind })).toBe("unavailable");
      }
    }
  });

  it("is unavailable at the load's deadline only while nothing came", () => {
    expect(nextCaptchaState("loading", { kind: "loadTimeout" })).toBe(
      "unavailable",
    );
    for (const state of ["ready", "tap", "failed"] as const) {
      expect(nextCaptchaState(state, { kind: "loadTimeout" })).toBe(state);
    }
  });

  it("stays unavailable but for a new widget, which starts a new check", () => {
    const events: CaptchaEvent[] = [
      { kind: "token" },
      { kind: "expired" },
      { kind: "reset" },
      { kind: "interactive" },
      { kind: "settled" },
      { kind: "error", code: "600010" },
      { kind: "loadTimeout" },
    ];
    for (const event of events) {
      expect(nextCaptchaState("unavailable", event), event.kind).toBe(
        "unavailable",
      );
    }
    for (const state of STATES) {
      expect(nextCaptchaState(state, { kind: "rendered" })).toBe("loading");
    }
  });
});

describe("captchaErrorKind", () => {
  it("is unavailable for what no retry fixes", () => {
    for (const code of [
      "110100",
      "110110",
      "110200",
      "110420",
      "110430",
      "110500",
      "110510",
      "200100",
      "400020",
      "400021",
      "400070",
    ]) {
      expect(captchaErrorKind(code), code).toBe("unavailable");
    }
  });

  it("is failed for what another try may pass, and for a code it doesn't know", () => {
    for (const code of [
      "110600",
      "110620",
      "200010",
      "200500",
      "300010",
      "300030",
      "600010",
      "102001",
      "",
      "nope",
    ]) {
      expect(captchaErrorKind(code), code).toBe("failed");
    }
  });
});

describe("pressWaits", () => {
  it("waits while the check is on its way or asks for a tick, never on a failure", () => {
    expect(STATES.filter(pressWaits)).toEqual(["loading", "tap"]);
  });
});

describe("captchaSizeFor", () => {
  it("is compact below Turnstile's 300px, flexible from there", () => {
    expect(captchaSizeFor(299)).toBe("compact");
    expect(captchaSizeFor(150)).toBe("compact");
    expect(captchaSizeFor(300)).toBe("flexible");
    expect(captchaSizeFor(496)).toBe("flexible");
  });
});

describe("captchaTokenOf", () => {
  it("takes a token of visible characters, up to Cloudflare's longest", () => {
    expect(captchaTokenOf("XXXX.DUMMY.TOKEN.XXXX")).toBe(
      "XXXX.DUMMY.TOKEN.XXXX",
    );
    const longest = "a".repeat(CAPTCHA_TOKEN_MAX);
    expect(captchaTokenOf(longest)).toBe(longest);
  });

  it("drops anything else", () => {
    for (const raw of [
      "",
      "a".repeat(CAPTCHA_TOKEN_MAX + 1),
      "two words",
      "line\nbreak",
      "טוקן",
      42,
      null,
      undefined,
      ["XXXX.DUMMY.TOKEN.XXXX"],
      { token: "x" },
    ]) {
      expect(captchaTokenOf(raw), JSON.stringify(raw)).toBeUndefined();
    }
  });
});

describe("captchaLanguageOf", () => {
  it("is the screen's language, Hebrew but for English", () => {
    expect(captchaLanguageOf("he")).toBe("he");
    expect(captchaLanguageOf("en")).toBe("en");
    expect(captchaLanguageOf("fr")).toBe("he");
  });
});

describe("Cloudflare's addresses and keys", () => {
  it("are the three published test keys", () => {
    expect(TURNSTILE_TEST_KEYS).toEqual({
      pass: "1x00000000000000000000AA",
      fail: "2x00000000000000000000AB",
      tap: "3x00000000000000000000FF",
    });
  });

  it("load the script from Cloudflare, rendered by the app", () => {
    const url = new URL(TURNSTILE_SCRIPT);
    expect(url.origin).toBe(TURNSTILE_ORIGIN);
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("render")).toBe("explicit");
  });
});
