import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEND_STATUS } from "./send-status";

// The send (waiter mode P4) with the session and the database stood in for:
// refused from another site, for a body that isn't a round, signed out and
// while viewing as someone; the person is the session's and the business
// the body's, never the cookie's; each refusal at its status, with what it
// names; and nothing of the body in the server's log.

vi.mock("server-only", () => ({}));

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const COOKIE_BUSINESS = "10000000-0000-4000-b000-000000000002";
const PERSON = "00000000-0000-4000-a000-000000000012";
const KEY = "30000000-0000-4000-a000-000000000001";
const ITEM = "40000000-0000-4000-a000-000000000001";
const ORDER = "50000000-0000-4000-a000-000000000001";

const mocks = vi.hoisted(() => ({
  sameOrigin: vi.fn(),
  getOwnPlace: vi.fn(),
  sendOrderRound: vi.fn(),
}));
vi.mock("@/app/origin", () => ({ sameOriginRequest: mocks.sameOrigin }));
vi.mock("@db/session", () => ({ getOwnPlace: mocks.getOwnPlace }));
vi.mock("@db/orders", () => ({ sendOrderRound: mocks.sendOrderRound }));

const { POST } = await import("./route");

const round = {
  key: KEY,
  target: { takeaway: true },
  lines: [{ item: ITEM, quantity: 1, note: "בוטנים", allergy: true }],
};
const body = { business: BUSINESS, ...round };

function post(content: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost:3000/orders-send", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof content === "string" ? content : JSON.stringify(content),
    }),
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.sameOrigin.mockResolvedValue(true);
  mocks.getOwnPlace.mockResolvedValue({
    userId: PERSON,
    viewing: false,
    place: { businessId: COOKIE_BUSINESS, role: "worker", enabled: [] },
  });
});

describe("the send", () => {
  it("refuses another site", async () => {
    mocks.sameOrigin.mockResolvedValue(false);
    expect((await post(body)).status).toBe(403);
    expect(mocks.sendOrderRound).not.toHaveBeenCalled();
  });

  it("refuses a body that isn't a round, or is too long, before anything is read", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...body, business: "x" })).status).toBe(400);
    expect((await post({ ...body, extra: true })).status).toBe(400);
    expect(
      (await post(body, { "content-length": String(65 * 1024) })).status,
    ).toBe(400);
    expect(
      (
        await post({
          ...body,
          lines: [{ item: ITEM, quantity: 1, note: "x".repeat(70_000) }],
        })
      ).status,
    ).toBe(400);
    expect(mocks.getOwnPlace).not.toHaveBeenCalled();
  });

  it("refuses someone signed out, and a view session", async () => {
    mocks.getOwnPlace.mockResolvedValue(null);
    const out = await post(body);
    expect(out.status).toBe(401);
    expect(await out.json()).toMatchObject({ ok: false, failure: "signedOut" });
    mocks.getOwnPlace.mockResolvedValue({
      userId: PERSON,
      viewing: true,
      place: null,
    });
    const viewing = await post(body);
    expect(viewing.status).toBe(403);
    expect(await viewing.json()).toMatchObject({ failure: "viewOnly" });
    expect(mocks.sendOrderRound).not.toHaveBeenCalled();
  });

  it("sends as the session's person, to the body's business, never the cookie's", async () => {
    const sent = {
      round: KEY,
      order: ORDER,
      sentAt: "2026-11-20T18:00:00Z",
      first: true,
      place: null,
      takeaway: 1,
      tickets: [],
    };
    mocks.sendOrderRound.mockResolvedValue({ ok: true, value: sent });
    const answer = await post(body);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(await answer.json()).toEqual({ ok: true, round: sent });
    expect(mocks.sendOrderRound).toHaveBeenCalledWith(PERSON, BUSINESS, round);
  });

  it("sends a line's choices as they came, and refuses one no pick could name (P6)", async () => {
    mocks.sendOrderRound.mockResolvedValue({
      ok: true,
      value: {
        round: KEY,
        order: ORDER,
        sentAt: "2026-11-20T18:00:00Z",
        first: true,
        place: null,
        takeaway: 1,
        tickets: [],
      },
    });
    const chosen = {
      ...round,
      lines: [
        {
          item: ITEM,
          quantity: 2,
          choices: [
            { group: "doneness", option: "m" },
            { group: "extras", option: "cheese" },
          ],
        },
      ],
    };
    expect((await post({ business: BUSINESS, ...chosen })).status).toBe(200);
    expect(mocks.sendOrderRound).toHaveBeenCalledWith(PERSON, BUSINESS, chosen);
    mocks.sendOrderRound.mockClear();
    const unnamed = await post({
      business: BUSINESS,
      ...round,
      lines: [
        {
          item: ITEM,
          quantity: 1,
          choices: [{ group: "Doneness!", option: "m" }],
        },
      ],
    });
    expect(unnamed.status).toBe(400);
    expect(await unnamed.json()).toMatchObject({
      ok: false,
      failure: "invalid",
    });
    expect(mocks.sendOrderRound).not.toHaveBeenCalled();
    // The database's own refusals of them, each at its status.
    for (const failure of ["choices", "price"] as const) {
      mocks.sendOrderRound.mockResolvedValue({
        ok: false,
        failure,
        items: [],
        order: null,
      });
      expect((await post({ business: BUSINESS, ...chosen })).status).toBe(422);
    }
  });

  it("answers each refusal at its status, with the items and the order it names", async () => {
    mocks.sendOrderRound.mockResolvedValue({
      ok: false,
      failure: "unavailable",
      items: [ITEM],
      order: null,
    });
    const soldOut = await post(body);
    expect(soldOut.status).toBe(409);
    expect(await soldOut.json()).toEqual({
      ok: false,
      failure: "unavailable",
      items: [ITEM],
      order: null,
    });
    for (const [failure, status] of [
      ["taken", 409],
      ["clock", 409],
      ["body", 422],
      ["gone", 404],
      ["tooMany", 429],
      ["notYet", 503],
      ["failed", 500],
      ["noAccess", 403],
    ] as const) {
      mocks.sendOrderRound.mockResolvedValue({
        ok: false,
        failure,
        items: [],
        order: failure === "taken" ? ORDER : null,
      });
      expect((await post(body)).status, failure).toBe(status);
      expect(SEND_STATUS[failure]).toBe(status);
    }
  });

  it("logs a failure's code alone, never what the round says", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendOrderRound.mockRejectedValue(
      Object.assign(new Error("bad: בוטנים"), { code: "XX000" }),
    );
    expect((await post(body)).status).toBe(500);
    expect(log).toHaveBeenCalledWith("sending a round failed", "XX000");
    expect(JSON.stringify(log.mock.calls)).not.toContain("בוטנים");
    log.mockRestore();
  });
});
