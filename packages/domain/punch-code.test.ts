import { describe, expect, it } from "vitest";
import {
  codePhase,
  formatShortCode,
  isSameOriginPost,
  issueResponse,
  needsPunchCode,
  nextFetchDelayMs,
  PUNCH_CODE_MIN_LEFT_SECONDS,
  padShortCode,
  parsePunchScan,
  punchPayload,
  punchProof,
  secondsToNextCode,
  spokenDigits,
} from "./punch-code";

const CODE = "Ab3-_9xYz0Ab3-_9xYz0Ab";

describe("what the QR holds", () => {
  it("reads the clock's code from a scan, and nothing else", () => {
    expect(parsePunchScan(`ca1:${CODE}`)).toBe(CODE);
    expect(parsePunchScan(`  ca1:${CODE}\n`)).toBe(CODE);
    for (const text of [
      `ca2:${CODE}`,
      `CA1:${CODE}`,
      `ca1:${CODE.slice(1)}`,
      `ca1:${CODE}x`,
      `ca1:${CODE.slice(1)}=`,
      `https://conceptapp-v2.vercel.app/clock?c=${CODE}`,
      CODE,
      "שלום",
      "",
    ]) {
      expect(parsePunchScan(text), text).toBeNull();
    }
  });

  it("writes what the QR holds and reads it back", () => {
    expect(punchPayload(CODE)).toBe(`ca1:${CODE}`);
    expect(parsePunchScan(punchPayload(CODE))).toBe(CODE);
  });

  it("groups the digits to read, and spells them for screen readers", () => {
    expect(formatShortCode("482915")).toBe("482 915");
    expect(formatShortCode("004201")).toBe("004 201");
    expect(spokenDigits("482915")).toBe("4 8 2 9 1 5");
  });
});

describe("punchProof", () => {
  it("accepts each way to punch, and refuses anything else", () => {
    for (const proof of [
      { kind: "plain" },
      { kind: "scan", code: CODE },
      { kind: "typed", digits: "004201" },
      { kind: "none" },
    ]) {
      expect(punchProof.parse(proof)).toEqual(proof);
    }
    for (const proof of [
      null,
      "plain",
      { kind: "typed", digits: "12345" },
      { kind: "typed", digits: "1234567" },
      { kind: "typed", digits: "12a456" },
      { kind: "scan", code: `${CODE}=` },
      { kind: "scan" },
      { kind: "station" },
    ]) {
      expect(punchProof.safeParse(proof).success, JSON.stringify(proof)).toBe(
        false,
      );
    }
  });
});

describe("needsPunchCode", () => {
  it("asks owners for no code, and nobody when the setting is off", () => {
    expect(needsPunchCode({ requirePunchCode: true }, "worker")).toBe(true);
    expect(needsPunchCode({ requirePunchCode: true }, "manager")).toBe(true);
    expect(needsPunchCode({ requirePunchCode: true }, "owner")).toBe(false);
    for (const role of ["owner", "manager", "worker"] as const) {
      expect(needsPunchCode({ requirePunchCode: false }, role)).toBe(false);
    }
  });
});

describe("codePhase", () => {
  const issued = {
    now: "2026-11-08T10:00:00.000Z",
    expiresAt: "2026-11-08T10:01:00.000Z",
  };
  const at = (seconds: number, failures = 0) =>
    codePhase({ issued, elapsedMs: seconds * 1000, failures });

  it("keeps a code on screen while it has more than 20 seconds left", () => {
    expect(PUNCH_CODE_MIN_LEFT_SECONDS).toBe(20);
    expect(at(0)).toBe("showing");
    expect(at(39)).toBe("showing");
    expect(at(41)).toBe("stale");
  });

  it("goes by the server's times, whatever the device's clock says", () => {
    // Three hours from any real time: only the times given and the time since count.
    const away = {
      now: "2020-01-01T13:00:00.000+03:00",
      expiresAt: "2020-01-01T13:01:00.000+03:00",
    };
    expect(codePhase({ issued: away, elapsedMs: 0, failures: 0 })).toBe(
      "showing",
    );
    expect(codePhase({ issued: away, elapsedMs: 41_000, failures: 0 })).toBe(
      "stale",
    );
  });

  it("keeps a good code through failed fetches, and says so after two", () => {
    expect(at(25, 1)).toBe("showing");
    expect(at(25, 2)).toBe("reconnecting");
    expect(at(41, 1)).toBe("stale");
    expect(at(41, 2)).toBe("offline");
  });

  it("is loading before the first code, and offline when it never came", () => {
    expect(codePhase({ issued: null, elapsedMs: 0, failures: 0 })).toBe(
      "loading",
    );
    expect(codePhase({ issued: null, elapsedMs: 0, failures: 1 })).toBe(
      "loading",
    );
    expect(codePhase({ issued: null, elapsedMs: 0, failures: 2 })).toBe(
      "offline",
    );
  });
});

describe("the code screen's timing", () => {
  it("asks again after 20 seconds, then 5 and 10 after failures", () => {
    expect(nextFetchDelayMs(0)).toBe(20_000);
    expect(nextFetchDelayMs(1)).toBe(5_000);
    expect(nextFetchDelayMs(2)).toBe(10_000);
    expect(nextFetchDelayMs(7)).toBe(10_000);
  });

  it("counts down whole seconds to the next code, never below 0", () => {
    expect(secondsToNextCode(0)).toBe(20);
    expect(secondsToNextCode(500)).toBe(20);
    expect(secondsToNextCode(1_000)).toBe(19);
    expect(secondsToNextCode(19_001)).toBe(1);
    expect(secondsToNextCode(20_000)).toBe(0);
    expect(secondsToNextCode(31_000)).toBe(0);
  });
});

describe("padShortCode and isSameOriginPost", () => {
  it("pads six digits and checks where a request came from", () => {
    expect(padShortCode(0)).toBe("000000");
    expect(padShortCode(42)).toBe("000042");
    expect(padShortCode(999_999)).toBe("999999");
    for (const n of [-1, 1_000_000, 4.2, Number.NaN]) {
      expect(() => padShortCode(n)).toThrow(RangeError);
    }

    const own = "https://conceptapp-v2.vercel.app";
    const post = (secFetchSite: string | null, origin: string | null) =>
      isSameOriginPost({ secFetchSite, origin }, own);
    expect(post(null, null)).toBe(true);
    expect(post("same-origin", null)).toBe(true);
    expect(post("same-origin", own)).toBe(true);
    expect(post(null, own)).toBe(true);
    expect(post("same-site", own)).toBe(false);
    expect(post("cross-site", null)).toBe(false);
    expect(post("none", null)).toBe(false);
    expect(post(null, "https://evil.example")).toBe(false);
    expect(post("same-origin", "https://conceptapp-v2.vercel.app.evil")).toBe(
      false,
    );
    expect(post(null, "null")).toBe(false);
  });
});

describe("issueResponse", () => {
  it("reads the issue route's answers", () => {
    const answer = {
      ok: true,
      code: CODE,
      short: "004201",
      expiresAt: "2026-11-08T10:01:00.000+00:00",
      now: "2026-11-08T10:00:00.000Z",
    };
    expect(issueResponse.parse(answer)).toEqual(answer);
    expect(issueResponse.parse({ ok: false, failure: "viewOnly" })).toEqual({
      ok: false,
      failure: "viewOnly",
    });
    for (const wrong of [
      { ...answer, short: "4201" },
      { ...answer, code: "short" },
      { ...answer, expiresAt: "soon" },
      { ok: false, failure: "clockOff" },
      { ok: true },
      "<!DOCTYPE html>",
    ]) {
      expect(issueResponse.safeParse(wrong).success).toBe(false);
    }
  });
});
