import { stationAnswerSchema } from "@domain/order-stations";
import { beforeEach, describe, expect, it, vi } from "vitest";

// GET /station/tickets, what a kitchen's screen or the till reads (waiter
// mode P8a), with the device's station, its session cookie and the database
// stood in for. Another site's request and a device that is no station get
// 403 before anything is read; a session on the device 409 "signedIn"
// before the station is read; a stopped station 409, the clock's 409
// "notOrders"; a query that isn't one 400. A kitchen's screen gets its
// tickets with only their senders' names, the till its orders, 204 when
// nothing moved. Every answer is in the route's schema and never kept by a
// cache, and no secret reaches the log.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const BUSINESS = "ea000000-0000-4000-b000-000000000001";
const SENDER = "ea000000-0000-4000-a000-000000000005";
const DEPARTMENT = "ea000000-0000-4000-9000-000000000001";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";
const AT = "2026-12-01T18:00:00.000Z";

const mocks = vi.hoisted(() => ({
  hasSessionCookie: vi.fn(),
  deviceStation: vi.fn(),
  stationOrderPrep: vi.fn(),
  stationOrderMenu: vi.fn(),
  stationOrderTill: vi.fn(),
  getStationPeople: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@db/supabase/server", () => ({
  hasSessionCookie: mocks.hasSessionCookie,
}));
vi.mock("@db/order-stations", () => ({
  stationOrderPrep: mocks.stationOrderPrep,
  stationOrderMenu: mocks.stationOrderMenu,
  stationOrderTill: mocks.stationOrderTill,
  getStationPeople: mocks.getStationPeople,
}));
vi.mock("@/app/(app)/clock/station/station", () => ({
  deviceStation: mocks.deviceStation,
}));

const { GET } = await import("./route");

const ask = (
  query = "",
  headers: Record<string, string> = { "sec-fetch-site": "same-origin" },
) => GET(new Request(`${ORIGIN}/station/tickets${query}`, { headers }));

/** The answer's status and body, the body checked against the route's schema. */
async function answerOf(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  if (response.status === 204) return { status: 204, body: null };
  const body = stationAnswerSchema.parse(await response.json());
  return { status: response.status, body };
}

/** This device is the business's station, of a kind, running or stopped. */
function station(
  shows: "clock_code" | "prep" | "till" = "prep",
  stopped = false,
) {
  mocks.deviceStation.mockResolvedValue({
    token: TOKEN,
    station: {
      id: "station-kitchen",
      name: "Kitchen",
      businessId: BUSINESS,
      businessName: "Demo",
      accent: "#0a84ff",
      timeZone: "Asia/Jerusalem",
      stopped,
      shows,
      departmentId: shows === "prep" ? DEPARTMENT : null,
    },
  });
}

const ticket = (id: string, sentBy: string | null) => ({
  id,
  order: "ea000000-0000-4000-8000-000000000001",
  department: DEPARTMENT,
  placeName: "4",
  takeaway: null,
  status: "new",
  sentAt: AT,
  firedAt: null,
  readyAt: null,
  sentBy,
  lines: [],
});

const prep = {
  version: 9,
  now: AT,
  lateAfterMinutes: 15,
  department: DEPARTMENT,
  departmentGone: false,
  departments: [{ id: DEPARTMENT, name: "Kitchen", archived: false }],
  tickets: [
    ticket("ea000000-0000-4000-8000-00000000000a", SENDER),
    ticket("ea000000-0000-4000-8000-00000000000b", null),
  ],
};

const till = {
  version: 9,
  now: AT,
  day: "2026-12-01",
  departments: [],
  orders: [],
  closed: [],
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.hasSessionCookie.mockResolvedValue(false);
  mocks.getStationPeople.mockResolvedValue({ [SENDER]: "Yoav" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the station's poll", () => {
  it("gives a kitchen's screen its tickets, its menu and only their senders' names", async () => {
    station();
    mocks.stationOrderPrep.mockResolvedValue({ ok: true, value: prep });
    mocks.stationOrderMenu.mockResolvedValue({
      ok: true,
      value: { version: 3, items: [] },
    });
    expect(await answerOf(await ask("?v=8&m=2"))).toEqual({
      status: 200,
      body: {
        ok: true,
        shows: "prep",
        prep,
        names: { [SENDER]: "Yoav" },
        menu: { version: 3, items: [] },
      },
    });
    expect(mocks.stationOrderPrep).toHaveBeenCalledWith(TOKEN, 8);
    expect(mocks.stationOrderMenu).toHaveBeenCalledWith(TOKEN, 2);
    expect(mocks.getStationPeople).toHaveBeenCalledWith(BUSINESS, [SENDER]);
  });

  it("says only what moved, and 204 when nothing did", async () => {
    station();
    mocks.stationOrderPrep.mockResolvedValue({ ok: true, value: "same" });
    mocks.stationOrderMenu.mockResolvedValue({
      ok: true,
      value: { version: 3, items: [] },
    });
    expect(await answerOf(await ask("?v=9&m=2"))).toMatchObject({
      status: 200,
      body: { prep: null, names: {}, menu: { version: 3 } },
    });
    expect(mocks.getStationPeople).not.toHaveBeenCalled();
    mocks.stationOrderMenu.mockResolvedValue({ ok: true, value: "same" });
    expect(await answerOf(await ask("?v=9&m=3"))).toEqual({
      status: 204,
      body: null,
    });
  });

  it("gives the till its orders", async () => {
    station("till");
    mocks.stationOrderTill.mockResolvedValue({ ok: true, value: till });
    expect(await answerOf(await ask())).toEqual({
      status: 200,
      body: { ok: true, shows: "till", till },
    });
    expect(mocks.stationOrderTill).toHaveBeenCalledWith(TOKEN, null);
    expect(mocks.stationOrderPrep).not.toHaveBeenCalled();
    mocks.stationOrderTill.mockResolvedValue({ ok: true, value: "same" });
    expect((await answerOf(await ask("?v=9"))).status).toBe(204);
  });

  it("refuses another site's request before it reads anything", async () => {
    station();
    const elsewhere: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { origin: "https://elsewhere.test" },
    ];
    for (const headers of elsewhere) {
      expect(await answerOf(await ask("", headers))).toEqual({
        status: 403,
        body: { ok: false, failure: "notStation" },
      });
    }
    expect(mocks.deviceStation).not.toHaveBeenCalled();
  });

  it("refuses a device someone is signed in on, before it reads the station", async () => {
    station();
    mocks.hasSessionCookie.mockResolvedValue(true);
    expect(await answerOf(await ask())).toEqual({
      status: 409,
      body: { ok: false, failure: "signedIn" },
    });
    expect(mocks.deviceStation).not.toHaveBeenCalled();
  });

  it("refuses a device that is no station, a stopped one and the clock's", async () => {
    mocks.deviceStation.mockResolvedValue(null);
    expect(await answerOf(await ask())).toEqual({
      status: 403,
      body: { ok: false, failure: "notStation" },
    });
    station("prep", true);
    expect(await answerOf(await ask())).toEqual({
      status: 409,
      body: { ok: false, failure: "stopped" },
    });
    station("clock_code");
    expect(await answerOf(await ask())).toEqual({
      status: 409,
      body: { ok: false, failure: "notOrders" },
    });
    expect(mocks.stationOrderPrep).not.toHaveBeenCalled();
  });

  it("refuses a query that isn't one", async () => {
    station();
    expect(await answerOf(await ask("?v=-1"))).toEqual({
      status: 400,
      body: { ok: false, failure: "failed" },
    });
    expect(mocks.stationOrderPrep).not.toHaveBeenCalled();
  });

  it("passes the database's refusals on, each with its status", async () => {
    station();
    mocks.stationOrderMenu.mockResolvedValue({ ok: true, value: "same" });
    for (const [failure, status] of [
      ["stopped", 409],
      ["notOrders", 409],
      ["off", 409],
      ["notStation", 403],
      ["failed", 500],
    ] as const) {
      mocks.stationOrderPrep.mockResolvedValue({ ok: false, failure });
      expect(await answerOf(await ask()), failure).toEqual({
        status,
        body: { ok: false, failure },
      });
    }
  });

  it("says it failed when the station can't be read, logging no secret", async () => {
    mocks.deviceStation.mockRejectedValue(new Error("down"));
    expect(await answerOf(await ask())).toEqual({
      status: 500,
      body: { ok: false, failure: "failed" },
    });
    station();
    mocks.stationOrderPrep.mockRejectedValue(new Error("boom"));
    mocks.stationOrderMenu.mockResolvedValue({ ok: true, value: "same" });
    expect((await answerOf(await ask())).status).toBe(500);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      TOKEN,
    );
  });
});
