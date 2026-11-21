import { beforeEach, describe, expect, it, vi } from "vitest";

// The mode's writes besides the send (waiter mode P4) with who is asking
// (`ordersAccess`) and the database's writes stood in for. They hold what a
// write keeps before it reaches the database: nothing for someone the mode
// isn't for, nothing in another business than the screen was drawn for,
// nothing while viewing, nothing with a shape the database wouldn't take;
// and each passes the person and the ids it was given. P5's fixes too: a
// reason from its own list with a fix, and none with its undo.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  ordersAccess: vi.fn(),
  serveOrderTicket: vi.fn(),
  setOrderTicketReady: vi.fn(),
  takeBackOrderLine: vi.fn(),
  fireOrderTickets: vi.fn(),
  setOrderLabel: vi.fn(),
  cancelOrderLine: vi.fn(),
  compOrderLine: vi.fn(),
  cancelOrder: vi.fn(),
  moveOrder: vi.fn(),
  closeOrder: vi.fn(),
  reopenOrder: vi.fn(),
}));
vi.mock("./orders-access", () => ({ ordersAccess: mocks.ordersAccess }));
vi.mock("@db/orders", () => ({
  serveOrderTicket: mocks.serveOrderTicket,
  setOrderTicketReady: mocks.setOrderTicketReady,
  takeBackOrderLine: mocks.takeBackOrderLine,
  fireOrderTickets: mocks.fireOrderTickets,
  setOrderLabel: mocks.setOrderLabel,
  cancelOrderLine: mocks.cancelOrderLine,
  compOrderLine: mocks.compOrderLine,
  cancelOrder: mocks.cancelOrder,
  moveOrder: mocks.moveOrder,
  closeOrder: mocks.closeOrder,
  reopenOrder: mocks.reopenOrder,
}));

const {
  cancelLineAction,
  cancelOrderAction,
  closeOrderAction,
  compLineAction,
  fireAction,
  moveOrderAction,
  reopenOrderAction,
  serveAction,
  setLabelAction,
  setReadyAction,
  takeBackAction,
} = await import("./actions");

const PLACE = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const PERSON = "33333333-3333-4333-a333-333333333333";
const TICKET = "44444444-4444-4444-a444-444444444444";

function asking(viewing = false) {
  mocks.ordersAccess.mockResolvedValue({
    userId: PERSON,
    businessId: PLACE,
    viewing,
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  for (const write of [
    mocks.serveOrderTicket,
    mocks.setOrderTicketReady,
    mocks.takeBackOrderLine,
    mocks.setOrderLabel,
    mocks.cancelOrderLine,
    mocks.compOrderLine,
    mocks.cancelOrder,
    mocks.moveOrder,
    mocks.closeOrder,
    mocks.reopenOrder,
  ]) {
    write.mockResolvedValue({ ok: true, value: null });
  }
  mocks.fireOrderTickets.mockResolvedValue({ ok: true, value: 1 });
});

const all = [
  () => serveAction(PLACE, TICKET, true),
  () => setReadyAction(PLACE, TICKET, true),
  () => takeBackAction(PLACE, TICKET),
  () => fireAction(PLACE, TICKET),
  () => setLabelAction(PLACE, TICKET, "דנה"),
  () => cancelLineAction(PLACE, TICKET, "guest", true),
  () => compLineAction(PLACE, TICKET, "staff", true),
  () => cancelOrderAction(PLACE, TICKET, "mistake"),
  () => moveOrderAction(PLACE, TICKET, OTHER),
  () => closeOrderAction(PLACE, TICKET),
  () => reopenOrderAction(PLACE, TICKET),
];
const writes = () => [
  mocks.serveOrderTicket,
  mocks.setOrderTicketReady,
  mocks.takeBackOrderLine,
  mocks.fireOrderTickets,
  mocks.setOrderLabel,
  mocks.cancelOrderLine,
  mocks.compOrderLine,
  mocks.cancelOrder,
  mocks.moveOrder,
  mocks.closeOrder,
  mocks.reopenOrder,
];

describe("the mode's writes", () => {
  it("refuse someone the mode isn't for", async () => {
    mocks.ordersAccess.mockResolvedValue(null);
    for (const write of all) {
      expect(await write()).toEqual({ ok: false, failure: "noAccess" });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("refuse a screen drawn for another business", async () => {
    asking();
    expect(await serveAction(OTHER, TICKET, true)).toEqual({
      ok: false,
      failure: "businessChanged",
    });
    expect(mocks.serveOrderTicket).not.toHaveBeenCalled();
  });

  it("refuse everything while viewing", async () => {
    asking(true);
    for (const write of all) {
      expect(await write()).toEqual({ ok: false, failure: "viewOnly" });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("refuse a shape the database wouldn't take", async () => {
    asking();
    expect(await serveAction(PLACE, "x", true)).toEqual({
      ok: false,
      failure: "invalid",
    });
    expect(await setReadyAction(PLACE, TICKET, "yes")).toEqual({
      ok: false,
      failure: "invalid",
    });
    expect(await setLabelAction(PLACE, TICKET, "x".repeat(41))).toEqual({
      ok: false,
      failure: "invalid",
    });
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("pass the person and what they were given, and the database's answer back", async () => {
    asking();
    expect(await serveAction(PLACE, TICKET, false)).toEqual({
      ok: true,
      value: null,
    });
    expect(mocks.serveOrderTicket).toHaveBeenCalledWith(PERSON, TICKET, false);
    await setReadyAction(PLACE, TICKET, true);
    expect(mocks.setOrderTicketReady).toHaveBeenCalledWith(
      PERSON,
      TICKET,
      true,
    );
    await takeBackAction(PLACE, TICKET);
    expect(mocks.takeBackOrderLine).toHaveBeenCalledWith(PERSON, TICKET);
    expect(await fireAction(PLACE, TICKET)).toEqual({ ok: true, value: 1 });
    expect(mocks.fireOrderTickets).toHaveBeenCalledWith(PERSON, TICKET);
    await setLabelAction(PLACE, TICKET, "");
    expect(mocks.setOrderLabel).toHaveBeenCalledWith(PERSON, TICKET, null);
    mocks.takeBackOrderLine.mockResolvedValue({
      ok: false,
      failure: "window",
      items: [],
      order: null,
    });
    expect(await takeBackAction(PLACE, TICKET)).toEqual({
      ok: false,
      failure: "window",
    });
  });
});

describe("the fixes (P5)", () => {
  it("refuse a screen drawn for another business", async () => {
    asking();
    for (const write of [
      () => cancelLineAction(OTHER, TICKET, "guest", true),
      () => compLineAction(OTHER, TICKET, "staff", true),
      () => cancelOrderAction(OTHER, TICKET, "guest"),
      () => moveOrderAction(OTHER, TICKET, PLACE),
      () => closeOrderAction(OTHER, TICKET),
      () => reopenOrderAction(OTHER, TICKET),
    ]) {
      expect(await write()).toEqual({ ok: false, failure: "businessChanged" });
    }
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("refuse a reason not in the list, a reason with an undo, none with a fix, and no id", async () => {
    asking();
    const invalid = { ok: false, failure: "invalid" };
    expect(await cancelLineAction(PLACE, TICKET, "bored", true)).toEqual(
      invalid,
    );
    expect(await cancelLineAction(PLACE, TICKET, "guest", false)).toEqual(
      invalid,
    );
    expect(await cancelLineAction(PLACE, TICKET, null, true)).toEqual(invalid);
    expect(await cancelLineAction(PLACE, TICKET, "guest", "yes")).toEqual(
      invalid,
    );
    expect(await cancelLineAction(PLACE, "x", "guest", true)).toEqual(invalid);
    // A line's reason is not the house's.
    expect(await compLineAction(PLACE, TICKET, "guest", true)).toEqual(invalid);
    expect(await compLineAction(PLACE, TICKET, "staff", false)).toEqual(
      invalid,
    );
    // "sold_out" is a line's reason, not an order's.
    expect(await cancelOrderAction(PLACE, TICKET, "sold_out")).toEqual(invalid);
    expect(await cancelOrderAction(PLACE, TICKET, null)).toEqual(invalid);
    expect(await moveOrderAction(PLACE, TICKET, "table-4")).toEqual(invalid);
    expect(await closeOrderAction(PLACE, "x")).toEqual(invalid);
    expect(await reopenOrderAction(PLACE, 4)).toEqual(invalid);
    for (const write of writes()) expect(write).not.toHaveBeenCalled();
  });

  it("pass the person, the ids and the reason, and an undo with none", async () => {
    asking();
    await cancelLineAction(PLACE, TICKET, "sold_out", true);
    expect(mocks.cancelOrderLine).toHaveBeenCalledWith(
      PERSON,
      TICKET,
      "sold_out",
      true,
    );
    await cancelLineAction(PLACE, TICKET, null, false);
    expect(mocks.cancelOrderLine).toHaveBeenLastCalledWith(
      PERSON,
      TICKET,
      null,
      false,
    );
    await compLineAction(PLACE, TICKET, "make_good", true);
    expect(mocks.compOrderLine).toHaveBeenCalledWith(
      PERSON,
      TICKET,
      "make_good",
      true,
    );
    await compLineAction(PLACE, TICKET, null, false);
    expect(mocks.compOrderLine).toHaveBeenLastCalledWith(
      PERSON,
      TICKET,
      null,
      false,
    );
    await cancelOrderAction(PLACE, TICKET, "other");
    expect(mocks.cancelOrder).toHaveBeenCalledWith(PERSON, TICKET, "other");
    await moveOrderAction(PLACE, TICKET, OTHER);
    expect(mocks.moveOrder).toHaveBeenCalledWith(PERSON, TICKET, OTHER);
    await closeOrderAction(PLACE, TICKET);
    expect(mocks.closeOrder).toHaveBeenCalledWith(PERSON, TICKET);
    await reopenOrderAction(PLACE, TICKET);
    expect(mocks.reopenOrder).toHaveBeenCalledWith(PERSON, TICKET);
    mocks.moveOrder.mockResolvedValue({
      ok: false,
      failure: "taken",
      items: [],
      order: TICKET,
    });
    expect(await moveOrderAction(PLACE, TICKET, OTHER)).toEqual({
      ok: false,
      failure: "taken",
    });
  });
});
