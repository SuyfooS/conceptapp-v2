import { stationWriteAnswer } from "@domain/order-stations";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /station/write, what a kitchen's screen or the till writes (waiter
// mode P8a), with the device's station, its session cookie and the database
// stood in for: the same gates as its poll, a body of at most 1 KB in the
// write's shape, each write for its own kind of station (a till marks
// nothing ready), and the database's refusals each with its status. A ticket
// made ready sends its sender's push once it is due (P8b), and nothing else
// does.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";
const TICKET = "ea000000-0000-4000-8000-000000000001";
const ITEM = "ea000000-0000-4000-9000-000000000001";
const ORDER = "ea000000-0000-4000-a000-000000000001";

const mocks = vi.hoisted(() => ({
  hasSessionCookie: vi.fn(),
  deviceStation: vi.fn(),
  stationSetTicketReady: vi.fn(),
  stationSetItemAvailable: vi.fn(),
  stationCloseOrder: vi.fn(),
  stationReopenOrder: vi.fn(),
  stationUndoCloseOrder: vi.fn(),
  pushSoon: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@db/supabase/server", () => ({
  hasSessionCookie: mocks.hasSessionCookie,
}));
vi.mock("@db/order-stations", () => ({
  stationSetTicketReady: mocks.stationSetTicketReady,
  stationSetItemAvailable: mocks.stationSetItemAvailable,
  stationCloseOrder: mocks.stationCloseOrder,
  stationReopenOrder: mocks.stationReopenOrder,
  stationUndoCloseOrder: mocks.stationUndoCloseOrder,
}));
vi.mock("@/app/(app)/clock/station/station", () => ({
  deviceStation: mocks.deviceStation,
}));
vi.mock("@/app/push/server", () => ({ pushSoon: mocks.pushSoon }));

const { POST } = await import("./route");

const write = (
  body: unknown,
  headers: Record<string, string> = {
    "sec-fetch-site": "same-origin",
    origin: ORIGIN,
  },
) =>
  POST(
    new Request(`${ORIGIN}/station/write`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

async function answerOf(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return {
    status: response.status,
    body: stationWriteAnswer.parse(await response.json()),
  };
}

function station(
  shows: "clock_code" | "prep" | "till" = "prep",
  stopped = false,
) {
  mocks.deviceStation.mockResolvedValue({
    token: TOKEN,
    station: {
      id: "station-kitchen",
      name: "Kitchen",
      businessId: "ea000000-0000-4000-b000-000000000001",
      businessName: "Demo",
      accent: "#0a84ff",
      timeZone: "Asia/Jerusalem",
      stopped,
      shows,
      departmentId: null,
    },
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.hasSessionCookie.mockResolvedValue(false);
  for (const mock of [
    mocks.stationSetTicketReady,
    mocks.stationSetItemAvailable,
    mocks.stationCloseOrder,
    mocks.stationReopenOrder,
    mocks.stationUndoCloseOrder,
  ]) {
    mock.mockResolvedValue({ ok: true });
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a station's write", () => {
  it("sends each of a kitchen's screen's writes on, by its secret", async () => {
    station("prep");
    expect(
      await answerOf(await write({ do: "ready", ticket: TICKET, ready: true })),
    ).toEqual({ status: 200, body: { ok: true } });
    expect(mocks.stationSetTicketReady).toHaveBeenCalledWith(
      TOKEN,
      TICKET,
      true,
    );
    await write({ do: "available", item: ITEM, available: false });
    expect(mocks.stationSetItemAvailable).toHaveBeenCalledWith(
      TOKEN,
      ITEM,
      false,
    );
  });

  it("sends each of the till's on", async () => {
    station("till");
    await write({ do: "close", order: ORDER });
    await write({ do: "reopen", order: ORDER });
    await write({ do: "undoClose", order: ORDER });
    expect(mocks.stationCloseOrder).toHaveBeenCalledWith(TOKEN, ORDER);
    expect(mocks.stationReopenOrder).toHaveBeenCalledWith(TOKEN, ORDER);
    expect(mocks.stationUndoCloseOrder).toHaveBeenCalledWith(TOKEN, ORDER);
  });

  it("refuses a write of the other kind of station, and any on the clock's", async () => {
    station("till");
    expect(
      await answerOf(await write({ do: "ready", ticket: TICKET, ready: true })),
    ).toEqual({ status: 409, body: { ok: false, failure: "notOrders" } });
    station("prep");
    expect(await answerOf(await write({ do: "close", order: ORDER }))).toEqual({
      status: 409,
      body: { ok: false, failure: "notOrders" },
    });
    station("clock_code");
    expect(
      (await answerOf(await write({ do: "close", order: ORDER }))).status,
    ).toBe(409);
    expect(mocks.stationCloseOrder).not.toHaveBeenCalled();
    expect(mocks.stationSetTicketReady).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't a write, or over 1 KB", async () => {
    station("prep");
    for (const body of [
      "not json",
      { do: "ready", ticket: "t-4", ready: true },
      { do: "ready", ticket: TICKET, ready: true, actor: TICKET },
      { do: "ready", ticket: TICKET, ready: true, pad: "x".repeat(1100) },
    ]) {
      expect(await answerOf(await write(body))).toEqual({
        status: 400,
        body: { ok: false, failure: "invalid" },
      });
    }
    expect(mocks.stationSetTicketReady).not.toHaveBeenCalled();
  });

  it("has the poll's gates: another site, a session, no station, a stopped one", async () => {
    station("prep");
    expect(
      await answerOf(
        await write(
          { do: "close", order: ORDER },
          { "sec-fetch-site": "cross-site" },
        ),
      ),
    ).toEqual({ status: 403, body: { ok: false, failure: "notStation" } });
    mocks.hasSessionCookie.mockResolvedValue(true);
    expect(await answerOf(await write({ do: "close", order: ORDER }))).toEqual({
      status: 409,
      body: { ok: false, failure: "signedIn" },
    });
    mocks.hasSessionCookie.mockResolvedValue(false);
    mocks.deviceStation.mockResolvedValue(null);
    expect(
      (await answerOf(await write({ do: "close", order: ORDER }))).status,
    ).toBe(403);
    station("till", true);
    expect(await answerOf(await write({ do: "close", order: ORDER }))).toEqual({
      status: 409,
      body: { ok: false, failure: "stopped" },
    });
  });

  it("passes the database's refusals on, each with its status", async () => {
    station("till");
    for (const [failure, status] of [
      ["gone", 404],
      ["held", 409],
      ["window", 409],
      ["taken", 409],
      ["off", 409],
      ["stopped", 409],
      ["notStation", 403],
      ["failed", 500],
    ] as const) {
      mocks.stationCloseOrder.mockResolvedValue({ ok: false, failure });
      expect(
        await answerOf(await write({ do: "close", order: ORDER })),
        failure,
      ).toEqual({ status, body: { ok: false, failure } });
    }
  });

  it("sends the sender's push once a ticket made ready's is due, and for nothing else (P8b)", async () => {
    station("prep");
    await write({ do: "ready", ticket: TICKET, ready: true });
    expect(mocks.pushSoon).toHaveBeenCalledTimes(1);
    expect(mocks.pushSoon).toHaveBeenCalledWith({ waitMs: 11_000 });
    mocks.pushSoon.mockClear();
    await write({ do: "ready", ticket: TICKET, ready: false });
    await write({ do: "available", item: ITEM, available: false });
    mocks.stationSetTicketReady.mockResolvedValue({
      ok: false,
      failure: "window",
    });
    await write({ do: "ready", ticket: TICKET, ready: true });
    station("till");
    await write({ do: "close", order: ORDER });
    expect(mocks.pushSoon).not.toHaveBeenCalled();
  });

  it("says it failed when a write throws, logging no secret", async () => {
    station("till");
    mocks.stationCloseOrder.mockRejectedValue(new Error("boom"));
    expect(await answerOf(await write({ do: "close", order: ORDER }))).toEqual({
      status: 500,
      body: { ok: false, failure: "failed" },
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      TOKEN,
    );
  });
});
