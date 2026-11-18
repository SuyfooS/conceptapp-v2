import { describe, expect, it } from "vitest";
import {
  defaultStationName,
  lockFailureOf,
  lockOpen,
  MAX_STATIONS,
  STATION_COOKIE_MAX_AGE,
  STATION_SHOWING_MS,
  stationCodeFailureOf,
  stationCodeResponse,
  stationCookieOptions,
  stationName,
  stationSeen,
  stationStopFailureOf,
  stationToken,
} from "./clock-station";

const CODE = "Ab3-_9xYz0Ab3-_9xYz0Ab";
const NOW = "2026-11-17T10:00:00.000Z";

describe("the station's cookie", () => {
  it("is for the server only, kept 400 days, Secure over https", () => {
    expect(stationCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
    });
    expect(STATION_COOKIE_MAX_AGE).toBe(34_560_000);
  });

  it("is not Secure on the browser tests' http", () => {
    expect(stationCookieOptions(false).secure).toBe(false);
  });

  it("holds a secret of 32 bytes and nothing else", () => {
    const token = Buffer.alloc(32, 7).toString("base64url");
    expect(stationToken.safeParse(token).success).toBe(true);
    for (const text of [
      "",
      token.slice(1),
      `${token}=`,
      `${token.slice(1)}+`,
      CODE,
    ]) {
      expect(stationToken.safeParse(text).success, text).toBe(false);
    }
  });
});

describe("a station's name", () => {
  it("is trimmed, 1 to 40 characters", () => {
    expect(stationName.parse("  עמדת הכניסה ")).toBe("עמדת הכניסה");
    expect(stationName.safeParse("   ").success).toBe(false);
    expect(stationName.safeParse("א".repeat(40)).success).toBe(true);
    expect(stationName.safeParse("א".repeat(41)).success).toBe(false);
    // Postgres can't store a NUL: refused here, before any pairing starts.
    expect(stationName.safeParse("\u0000").success).toBe(false);
    expect(stationName.safeParse("עמדה\u0007").success).toBe(false);
  });

  it("is offered as the station after those running, a number nobody has", () => {
    const nameFor = (n: number) => `Clock station ${n}`;
    expect(defaultStationName([], nameFor)).toBe("Clock station 1");
    expect(defaultStationName(["Entrance"], nameFor)).toBe("Clock station 2");
    expect(defaultStationName(["Clock station 2", "Kitchen"], nameFor)).toBe(
      "Clock station 3",
    );
    expect(
      defaultStationName([" Clock station 2 ", "Clock station 3"], nameFor),
    ).toBe("Clock station 4");
  });
});

describe("locking a device", () => {
  const names = (n: number) =>
    Array.from({ length: n }, (_, i) => `Station ${i + 1}`);

  it("is open below ten running", () => {
    expect(lockOpen({ current: null, running: [] })).toBe(true);
    expect(lockOpen({ current: null, running: names(9) })).toBe(true);
  });

  it("is closed with ten running and this device none of them", () => {
    expect(MAX_STATIONS).toBe(10);
    expect(lockOpen({ current: null, running: names(10) })).toBe(false);
  });

  it("stays open on a device that is one of them: it keeps that station", () => {
    expect(
      lockOpen({ current: { name: "Station 3" }, running: names(10) }),
    ).toBe(true);
    expect(lockOpen({ current: { name: "Entrance" }, running: [] })).toBe(true);
  });
});

describe("when a station was seen", () => {
  const now = new Date(NOW);
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("is showing the code within two minutes", () => {
    expect(stationSeen(ago(0), now)).toEqual({ kind: "showing" });
    expect(stationSeen(ago(STATION_SHOWING_MS), now)).toEqual({
      kind: "showing",
    });
  });

  it("was seen at a time before that, or never", () => {
    const at = ago(STATION_SHOWING_MS + 1);
    expect(stationSeen(at, now)).toEqual({ kind: "seen", at });
    expect(stationSeen(null, now)).toEqual({ kind: "never" });
  });
});

describe("the station's code route", () => {
  it("answers a code, or why there is none", () => {
    const issued = {
      ok: true,
      code: CODE,
      short: "004201",
      expiresAt: "2026-11-17T10:01:00.000Z",
      now: NOW,
    };
    expect(stationCodeResponse.parse(issued)).toEqual(issued);
    for (const failure of [
      "notStation",
      "stopped",
      "clockOff",
      "managerOnly",
      "signedIn",
      "failed",
    ]) {
      expect(stationCodeResponse.parse({ ok: false, failure })).toEqual({
        ok: false,
        failure,
      });
    }
  });

  it("refuses anything else", () => {
    for (const body of [
      null,
      { ok: false, failure: "noAccess" },
      { ok: false, failure: "stationsOnly" },
      { ok: true, code: CODE, short: "12345", expiresAt: NOW, now: NOW },
      { ok: true, code: `${CODE}=`, short: "123456", expiresAt: NOW, now: NOW },
      { ok: true, code: CODE, short: "123456", expiresAt: "soon", now: NOW },
    ]) {
      expect(
        stationCodeResponse.safeParse(body).success,
        JSON.stringify(body),
      ).toBe(false);
    }
  });
});

describe("the database's refusals, in words", () => {
  it("of a station's code", () => {
    expect(stationCodeFailureOf("42501", "Not a station")).toBe("notStation");
    expect(stationCodeFailureOf("42501", "This station was stopped")).toBe(
      "stopped",
    );
    expect(
      stationCodeFailureOf("42501", "The time clock is off for this business"),
    ).toBe("clockOff");
    expect(
      stationCodeFailureOf(
        "42501",
        "This business shows codes on a manager's phone only",
      ),
    ).toBe("managerOnly");
    expect(stationCodeFailureOf("22023", "Hashes must be 64 hex digits")).toBe(
      "failed",
    );
    expect(stationCodeFailureOf(undefined)).toBe("failed");
  });

  it("of locking a device", () => {
    expect(lockFailureOf("54000", "At most ten stations")).toBe(
      "tooManyStations",
    );
    expect(
      lockFailureOf("54000", "Too many devices are pairing; try again soon"),
    ).toBe("failed");
    expect(
      lockFailureOf(
        "42501",
        "This business shows codes on a manager's phone only",
      ),
    ).toBe("managerOnly");
    expect(lockFailureOf("42501", "Managers and owners only")).toBe("noAccess");
    expect(
      lockFailureOf("42501", "The time clock is off for this business"),
    ).toBe("noAccess");
    expect(
      lockFailureOf("22023", "A station needs a name of up to 40 characters"),
    ).toBe("name");
    expect(lockFailureOf("22023", "Hashes must be 64 hex digits")).toBe(
      "failed",
    );
    expect(
      lockFailureOf("28000", "The pairing code is missing or expired"),
    ).toBe("failed");
  });

  it("of stopping a station and taking it back", () => {
    expect(stationStopFailureOf("P0002")).toBe("gone");
    expect(stationStopFailureOf("55000")).toBe("tooLate");
    expect(stationStopFailureOf("42501")).toBe("noAccess");
    expect(stationStopFailureOf("XX000")).toBe("failed");
  });
});
