import { beforeEach, describe, expect, it, vi } from "vitest";
import { type LockOffer, lockInputOf } from "../../clock/station/station-types";
import type { OrdersAccess } from "../orders-access";

// The prep screen's two locks (waiter mode P8a), with the database and the
// device stood in for: a device that is the business's kitchen's screen
// already is offered locking again as the screen it is, with the department
// it shows, whichever that is (the bar's, or every one), and the sheet sends
// that back, so the action keeps it; the till's lock on it says what it is.

vi.mock("server-only", () => ({}));

const BUSINESS = "ea000000-0000-4000-b000-000000000001";
const KITCHEN = "ea000000-0000-4000-9000-000000000001";
const BAR = "ea000000-0000-4000-9000-000000000002";

const mocks = vi.hoisted(() => ({
  getRunningOrderStations: vi.fn(),
  countRunningStations: vi.fn(),
  currentOn: vi.fn(),
}));
vi.mock("@db/order-stations", () => ({
  getRunningOrderStations: mocks.getRunningOrderStations,
}));
vi.mock("@db/clock-stations", () => ({
  countRunningStations: mocks.countRunningStations,
}));
vi.mock("../../clock/station/station", () => ({
  currentOn: mocks.currentOn,
}));

const { orderStationsOffer } = await import("./stations");

/** Someone who runs the business's orders, or a view as one. */
const access = (viewing = false) =>
  ({
    businessId: BUSINESS,
    viewing,
    timeZone: "Asia/Jerusalem",
    reach: { mode: { runs: true } },
    departments: [
      { id: KITCHEN, name: "Kitchen", archivedAt: null },
      { id: BAR, name: "Bar", archivedAt: null },
    ],
  }) as unknown as OrdersAccess;

/** This device is a running station of the business, showing `shows`. */
function device(shows: "prep" | "till", departmentId: string | null) {
  mocks.currentOn.mockResolvedValue({
    id: "station-1",
    name: shows === "till" ? "Till" : "Bar",
    businessId: BUSINESS,
    businessName: "Demo",
    accent: "#0a84ff",
    timeZone: "Asia/Jerusalem",
    stopped: false,
    shows,
    departmentId,
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getRunningOrderStations.mockResolvedValue([]);
  mocks.countRunningStations.mockResolvedValue({ ok: true, count: 1 });
  mocks.currentOn.mockResolvedValue(null);
});

describe("the prep screen's locks on a device that is a station already", () => {
  it("offers the bar's screen locking again as the bar's, and the sheet sends the bar", async () => {
    device("prep", BAR);
    const offer = await orderStationsOffer(access());
    expect(offer?.kitchen).toEqual({
      current: { name: "Bar", department: BAR },
      running: [],
    });
    expect(offer?.till).toMatchObject({
      current: null,
      other: { name: "Bar", shows: "prep" },
    });
    // The sheet starts on the first department, the kitchen, and hides it.
    expect(
      lockInputOf("prep", offer?.kitchen as LockOffer, KITCHEN, "Bar"),
    ).toEqual({ name: "Bar", department: BAR });
  });

  it("keeps a screen of every department as one", async () => {
    device("prep", null);
    const offer = await orderStationsOffer(access());
    expect(offer?.kitchen.current).toEqual({ name: "Bar", department: null });
    expect(
      lockInputOf("prep", offer?.kitchen as LockOffer, KITCHEN, "Bar"),
    ).toEqual({ name: "Bar", department: null });
  });

  it("offers the till again as the till, with no department", async () => {
    device("till", null);
    const offer = await orderStationsOffer(access());
    expect(offer?.till.current).toEqual({ name: "Till", department: null });
    expect(lockInputOf("till", offer?.till as LockOffer, "", "Till")).toEqual({
      name: "Till",
    });
    expect(offer?.kitchen).toMatchObject({
      current: null,
      other: { name: "Till", shows: "till" },
    });
  });

  it("sends the department chosen on any other device, every one as null", async () => {
    const offer = await orderStationsOffer(access());
    const kitchen = offer?.kitchen as LockOffer;
    expect(kitchen.current).toBeNull();
    expect(lockInputOf("prep", kitchen, BAR, "Bar")).toEqual({
      name: "Bar",
      department: BAR,
    });
    expect(lockInputOf("prep", kitchen, "", "Prep")).toEqual({
      name: "Prep",
      department: null,
    });
    expect(lockInputOf("clock", kitchen, BAR, "Door")).toEqual({
      name: "Door",
    });
  });

  it("reads no device for a view, which locks nothing", async () => {
    device("prep", BAR);
    const offer = await orderStationsOffer(access(true));
    expect(mocks.currentOn).not.toHaveBeenCalled();
    expect(offer?.kitchen.current).toBeNull();
    expect(offer?.viewOnly).toBe(true);
  });
});
