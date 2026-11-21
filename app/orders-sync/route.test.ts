import { beforeEach, describe, expect, it, vi } from "vitest";

// The mode's sync (waiter mode P4) with the session and the database stood
// in for: refused from another site, for a question that isn't one and signed
// out; the kitchen's read first, which may move the version, and the floor
// and one's own rounds only when it found something new; 204 when nothing
// asked moved; 404 while the module is off; 409 for a taker off a shift; the
// order read whole only when the orders moved; the smallest version answered;
// nothing kept on the way. One's own rounds that came back read their ready
// tickets' lines (P8b), never while viewing, and a failure there still
// answers.

vi.mock("server-only", () => ({}));

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const PERSON = "00000000-0000-4000-a000-000000000012";
const ORDER = "50000000-0000-4000-a000-000000000001";
const T = "2026-11-20T18:00:00Z";

const mocks = vi.hoisted(() => ({
  sameOrigin: vi.fn(),
  getOwnPlace: vi.fn(),
  getOrderPrep: vi.fn(),
  getOrderFloor: vi.fn(),
  getMyOrders: vi.fn(),
  getOrderDetail: vi.fn(),
  getMenu: vi.fn(),
  readOrderReady: vi.fn(),
  order: [] as string[],
}));
vi.mock("@/app/origin", () => ({ sameOriginRequest: mocks.sameOrigin }));
vi.mock("@db/session", () => ({ getOwnPlace: mocks.getOwnPlace }));
vi.mock("@db/order-taking", () => ({ getMenu: mocks.getMenu }));
vi.mock("@db/orders", () => ({
  getOrderPrep: mocks.getOrderPrep,
  getOrderFloor: mocks.getOrderFloor,
  getMyOrders: mocks.getMyOrders,
  getOrderDetail: mocks.getOrderDetail,
  readOrderReady: mocks.readOrderReady,
}));

const { GET } = await import("./route");

const floor = (version: number) => ({
  version,
  now: T,
  day: "2026-11-20",
  runs: false,
  orders: [],
  closed: [],
  fixes: null,
  ready: [],
});
const mine = (version: number) => ({
  version,
  now: T,
  day: "2026-11-20",
  rounds: [],
});
const prep = (version: number) => ({
  version,
  now: T,
  departments: [],
  tickets: [],
});

function ask(query: string) {
  return GET(
    new Request(`http://localhost:3000/orders-sync?b=${BUSINESS}&${query}`),
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function") mock.mockReset();
  }
  mocks.order = [];
  mocks.sameOrigin.mockResolvedValue(true);
  mocks.getOwnPlace.mockResolvedValue({
    userId: PERSON,
    viewing: false,
    place: null,
  });
  mocks.getOrderPrep.mockImplementation(async () => {
    mocks.order.push("prep");
    return prep(9);
  });
  mocks.getOrderFloor.mockImplementation(async () => {
    mocks.order.push("floor");
    return floor(10);
  });
  mocks.getMyOrders.mockResolvedValue(mine(10));
  mocks.getMenu.mockResolvedValue("same");
  mocks.readOrderReady.mockResolvedValue(0);
});

describe("the mode's sync", () => {
  it("refuses another site, a question that isn't one, and someone signed out", async () => {
    mocks.sameOrigin.mockResolvedValue(false);
    expect((await ask("f=1")).status).toBe(403);
    mocks.sameOrigin.mockResolvedValue(true);
    expect((await ask("f=2")).status).toBe(400);
    mocks.getOwnPlace.mockResolvedValue(null);
    const out = await ask("f=1");
    expect(out.status).toBe(401);
    expect(out.headers.get("cache-control")).toBe("no-store");
  });

  it("fails, to be asked again, when the session couldn't be read now: never signed out", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getOwnPlace.mockRejectedValue(
      Object.assign(new Error("fetch failed"), {
        name: "AuthRetryableFetchError",
      }),
    );
    const out = await ask("f=1");
    expect(out.status).toBe(500);
    expect(out.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getOrderFloor).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("reads the kitchen first, then the rest, and answers the smallest version", async () => {
    const answer = await ask("v=5&f=1&y=1&p=1");
    expect(mocks.order).toEqual(["prep", "floor"]);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    const json = await answer.json();
    expect(json.version).toBe(9);
    expect(json.prep.version).toBe(9);
    expect(json.floor.version).toBe(10);
    expect(mocks.getOrderPrep).toHaveBeenCalledWith(BUSINESS, 5);
    expect(mocks.getOrderFloor).toHaveBeenCalledWith(BUSINESS, 5);
  });

  it("asks nothing more when the kitchen found nothing new, and answers 204", async () => {
    mocks.getOrderPrep.mockResolvedValue("same");
    expect((await ask("v=9&f=1&y=1&p=1&m=3")).status).toBe(204);
    expect(mocks.getOrderFloor).not.toHaveBeenCalled();
    expect(mocks.getMyOrders).not.toHaveBeenCalled();
    expect(mocks.getMenu).toHaveBeenCalledWith(BUSINESS, 3);
  });

  it("is not found while the module is off, and refuses a taker off a shift", async () => {
    mocks.getOrderFloor.mockResolvedValue("closed");
    expect((await ask("f=1")).status).toBe(404);
    mocks.getOrderFloor.mockResolvedValue({ off: "clock" });
    const off = await ask("f=1");
    expect(off.status).toBe(409);
    expect(await off.json()).toEqual({ off: "clock" });
  });

  it("reads the order whole only when the orders moved", async () => {
    mocks.getOrderFloor.mockResolvedValue("same");
    mocks.getMyOrders.mockResolvedValue("same");
    expect((await ask(`v=10&f=1&y=1&o=${ORDER}`)).status).toBe(204);
    expect(mocks.getOrderDetail).not.toHaveBeenCalled();
    mocks.getOrderFloor.mockResolvedValue(floor(11));
    mocks.getOrderDetail.mockResolvedValue("closed");
    const moved = await ask(`v=10&f=1&y=1&o=${ORDER}`);
    expect(moved.status).toBe(200);
    expect(mocks.getOrderDetail).toHaveBeenCalledWith(ORDER);
    // An order no longer to read is said once, as none.
    expect((await moved.json()).order).toBeNull();
  });

  it("asks for the menu whole for an empty m, and keeps it out for none", async () => {
    mocks.getMenu.mockResolvedValue({
      version: 4,
      categories: [],
      items: [],
      places: [],
    });
    const whole = await ask("m=");
    expect(mocks.getMenu).toHaveBeenCalledWith(BUSINESS, undefined);
    expect((await whole.json()).menu.version).toBe(4);
    mocks.getMenu.mockClear();
    await ask("f=1");
    expect(mocks.getMenu).not.toHaveBeenCalled();
  });
});

describe("the ready lines a sync shows (P8b)", () => {
  const READY = "60000000-0000-4000-a000-000000000001";
  const GONE = "60000000-0000-4000-a000-000000000002";
  const MAKING = "60000000-0000-4000-a000-000000000003";
  const KITCHEN = "70000000-0000-4000-a000-000000000001";
  const ticket = (id: string, status: string, lines: number) => ({
    id,
    department: KITCHEN,
    status,
    held: false,
    kitchenSeenAt: T,
    readyAt: status === "ready" ? T : null,
    servedAt: null,
    lines,
    items: [],
  });
  const withReady = (version: number) => ({
    ...mine(version),
    rounds: [
      {
        id: "60000000-0000-4000-a000-000000000010",
        order: ORDER,
        placeName: "4",
        takeaway: null,
        orderStatus: "open",
        sentAt: T,
        tickets: [
          ticket(READY, "ready", 2),
          // Every line taken back: nothing to serve.
          ticket(GONE, "ready", 0),
          ticket(MAKING, "new", 1),
        ],
      },
    ],
  });

  it("reads the person's own ready tickets' lines when their rounds came back", async () => {
    mocks.getMyOrders.mockResolvedValue(withReady(10));
    const answer = await ask("v=5&y=1");
    expect(answer.status).toBe(200);
    expect(mocks.readOrderReady).toHaveBeenCalledWith(PERSON, BUSINESS, [
      READY,
    ]);
  });

  it("reads none while viewing, nor when their rounds weren't asked or didn't move", async () => {
    mocks.getMyOrders.mockResolvedValue(withReady(10));
    mocks.getOwnPlace.mockResolvedValue({
      userId: PERSON,
      viewing: true,
      place: null,
    });
    expect((await ask("v=5&y=1")).status).toBe(200);
    mocks.getOwnPlace.mockResolvedValue({
      userId: PERSON,
      viewing: false,
      place: null,
    });
    await ask("v=5&f=1");
    mocks.getMyOrders.mockResolvedValue("same");
    mocks.getOrderFloor.mockResolvedValue("same");
    expect((await ask("v=10&f=1&y=1")).status).toBe(204);
    expect(mocks.readOrderReady).not.toHaveBeenCalled();
  });

  it("still answers when reading them failed, logging the code alone", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getMyOrders.mockResolvedValue(withReady(10));
    mocks.readOrderReady.mockRejectedValue(
      Object.assign(new Error("secret detail"), { code: "XX000" }),
    );
    const answer = await ask("v=5&y=1");
    expect(answer.status).toBe(200);
    expect((await answer.json()).mine.version).toBe(10);
    expect(log).toHaveBeenCalledWith("reading the ready lines failed", "XX000");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret detail");
    log.mockRestore();
  });
});
