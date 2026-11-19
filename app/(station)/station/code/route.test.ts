import { stationCodeResponse } from "@domain/clock-station";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /station/code, the clock station's codes, with the device's station,
// its session cookie and the database stood in for. It holds the route's
// refusals and what each answers: another site's request and a device that
// is no station get 403 "notStation" before anything is issued; a session on
// the device, valid or not, 409 "signedIn" before the station is read; a
// stopped station 409 "stopped"; and the database's own refusals pass on,
// the clock switched off or codes on a manager's phone only as 409, which the
// station's screen says in words. Every answer is in the route's schema and
// never kept by a cache.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const BUSINESS = "10000000-0000-4000-b000-000000000001";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";
const CODE = "Ab3-_9xYz0Ab3-_9xYz0Ab";

const mocks = vi.hoisted(() => ({
  hasSessionCookie: vi.fn(),
  deviceStation: vi.fn(),
  issueStationCode: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@db/supabase/server", () => ({
  hasSessionCookie: mocks.hasSessionCookie,
}));
vi.mock("@db/clock-stations", () => ({
  issueStationCode: mocks.issueStationCode,
}));
vi.mock("@/app/(app)/clock/station/station", () => ({
  deviceStation: mocks.deviceStation,
}));

const { POST } = await import("./route");

/** The station's page asking, or another site with its own headers. */
const ask = (
  headers: Record<string, string> = {
    "sec-fetch-site": "same-origin",
    origin: ORIGIN,
  },
) => POST(new Request(`${ORIGIN}/station/code`, { method: "POST", headers }));

/** The answer's status and body, the body checked against the route's schema. */
async function answerOf(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = stationCodeResponse.parse(await response.json());
  return { status: response.status, body };
}

/** This device is the business's station, running or stopped. */
function station(stopped = false) {
  mocks.deviceStation.mockResolvedValue({
    token: TOKEN,
    station: {
      id: "station-entrance",
      name: "entrance",
      businessId: BUSINESS,
      businessName: "Demo",
      accent: "#0a84ff",
      timeZone: "Asia/Jerusalem",
      stopped,
    },
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.hasSessionCookie.mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the station's code route", () => {
  it("issues a code to the business's running station", async () => {
    station();
    const issued = {
      code: CODE,
      short: "004201",
      expiresAt: "2026-11-17T10:01:00.000Z",
      now: "2026-11-17T10:00:00.000Z",
    };
    mocks.issueStationCode.mockResolvedValue({ ok: true, value: issued });
    expect(await answerOf(await ask())).toEqual({
      status: 200,
      body: { ok: true, ...issued },
    });
    expect(mocks.issueStationCode).toHaveBeenCalledWith(TOKEN, BUSINESS);
  });

  it("refuses another site's request before it reads anything", async () => {
    station();
    const elsewhere: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: ORIGIN },
      { origin: "https://elsewhere.test" },
    ];
    for (const headers of elsewhere) {
      expect(
        await answerOf(await ask(headers)),
        JSON.stringify(headers),
      ).toEqual({ status: 403, body: { ok: false, failure: "notStation" } });
    }
    expect(mocks.hasSessionCookie).not.toHaveBeenCalled();
    expect(mocks.deviceStation).not.toHaveBeenCalled();
    expect(mocks.issueStationCode).not.toHaveBeenCalled();
  });

  it("refuses a device someone is signed in on, before it reads the station", async () => {
    station();
    mocks.hasSessionCookie.mockResolvedValue(true);
    expect(await answerOf(await ask())).toEqual({
      status: 409,
      body: { ok: false, failure: "signedIn" },
    });
    expect(mocks.deviceStation).not.toHaveBeenCalled();
    expect(mocks.issueStationCode).not.toHaveBeenCalled();
  });

  it("refuses a device that is no station, or a stopped one, issuing nothing", async () => {
    mocks.deviceStation.mockResolvedValue(null);
    expect(await answerOf(await ask())).toEqual({
      status: 403,
      body: { ok: false, failure: "notStation" },
    });
    station(true);
    expect(await answerOf(await ask())).toEqual({
      status: 409,
      body: { ok: false, failure: "stopped" },
    });
    expect(mocks.issueStationCode).not.toHaveBeenCalled();
  });

  it("says it failed when the station can't be read", async () => {
    mocks.deviceStation.mockRejectedValue(new Error("down"));
    expect(await answerOf(await ask())).toEqual({
      status: 500,
      body: { ok: false, failure: "failed" },
    });
    expect(mocks.issueStationCode).not.toHaveBeenCalled();
  });

  it("passes the database's refusals on, each with its status", async () => {
    station();
    for (const [failure, status] of [
      ["clockOff", 409],
      ["managerOnly", 409],
      ["stopped", 409],
      ["notStation", 403],
      ["failed", 500],
    ] as const) {
      mocks.issueStationCode.mockResolvedValue({ ok: false, failure });
      expect(await answerOf(await ask()), failure).toEqual({
        status,
        body: { ok: false, failure },
      });
    }
  });
});
