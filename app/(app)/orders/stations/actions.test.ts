import { STATION_PATH } from "@domain/clock-station";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Locking this device as the kitchen's screen or the till, and stopping one
// (waiter mode P8a), with the person, the device and the database stood in
// for: only whoever runs orders, as themselves; the same screen kept, another
// kind of station refused until it is stopped; the device remembered, then
// the session ended here, last.

vi.mock("server-only", () => ({}));

const BUSINESS = "ea000000-0000-4000-b000-000000000001";
const USER = "ea000000-0000-4000-a000-000000000001";
const DEPARTMENT = "ea000000-0000-4000-9000-000000000001";
const STATION = "ea000000-0000-4000-8000-000000000001";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";

const calls = vi.hoisted(() => [] as string[]);
const mocks = vi.hoisted(() => ({
  ordersAccess: vi.fn(),
  deviceStation: vi.fn(),
  rememberStation: vi.fn(),
  endSessionHere: vi.fn(),
  lockOrderStation: vi.fn(),
  setStationStopped: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../orders-access", () => ({ ordersAccess: mocks.ordersAccess }));
vi.mock("../../clock/station/station", () => ({
  deviceStation: mocks.deviceStation,
  rememberStation: mocks.rememberStation,
}));
vi.mock("../../../(auth)/end-session", () => ({
  endSessionHere: mocks.endSessionHere,
}));
vi.mock("@db/order-stations", () => ({
  lockOrderStation: mocks.lockOrderStation,
}));
vi.mock("@db/clock-stations", () => ({
  setStationStopped: mocks.setStationStopped,
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const {
  lockOrderDeviceAction,
  restartOrderStationAction,
  stopOrderStationAction,
} = await import("./actions");

function runs(runsOrders = true, viewing = false) {
  mocks.ordersAccess.mockResolvedValue({
    userId: USER,
    businessId: BUSINESS,
    viewing,
    reach: { mode: { runs: runsOrders } },
  });
}

function device(
  shows: "clock_code" | "prep" | "till",
  departmentId: string | null = null,
  stopped = false,
) {
  mocks.deviceStation.mockResolvedValue({
    token: TOKEN,
    station: {
      id: STATION,
      name: "Kitchen",
      businessId: BUSINESS,
      businessName: "Demo",
      accent: "#0a84ff",
      timeZone: "Asia/Jerusalem",
      stopped,
      shows,
      departmentId,
    },
  });
}

const kitchen = { name: "Kitchen", shows: "prep", department: DEPARTMENT };

beforeEach(() => {
  calls.length = 0;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.deviceStation.mockResolvedValue(null);
  mocks.rememberStation.mockImplementation(async () => {
    calls.push("remember");
  });
  mocks.endSessionHere.mockImplementation(async () => {
    calls.push("end");
  });
  mocks.lockOrderStation.mockResolvedValue({
    ok: true,
    value: { token: "new-token", stationId: STATION },
  });
  mocks.setStationStopped.mockResolvedValue({ ok: true, value: undefined });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("locking this device as the kitchen's screen or the till", () => {
  it("locks a new one for whoever runs orders, remembers it, then signs out here", async () => {
    runs();
    expect(await lockOrderDeviceAction(kitchen)).toEqual({
      ok: true,
      to: STATION_PATH,
    });
    expect(mocks.lockOrderStation).toHaveBeenCalledWith(USER, BUSINESS, {
      name: "Kitchen",
      shows: "prep",
      department: DEPARTMENT,
    });
    expect(mocks.rememberStation).toHaveBeenCalledWith("new-token");
    expect(calls).toEqual(["remember", "end"]);
  });

  it("refuses anyone who doesn't run orders, and a view", async () => {
    mocks.ordersAccess.mockResolvedValue(null);
    expect(await lockOrderDeviceAction(kitchen)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    runs(false);
    expect(await lockOrderDeviceAction(kitchen)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    runs(true, true);
    expect(await lockOrderDeviceAction(kitchen)).toEqual({
      ok: false,
      failure: "viewOnly",
    });
    expect(mocks.lockOrderStation).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("refuses what isn't a lock: a name, a kind, a till with a department", async () => {
    runs();
    for (const input of [
      { ...kitchen, name: "   " },
      { ...kitchen, name: "x".repeat(41) },
      { ...kitchen, shows: "clock_code" },
      { ...kitchen, department: "kitchen" },
      null,
    ]) {
      expect(await lockOrderDeviceAction(input), JSON.stringify(input)).toEqual(
        { ok: false, failure: "name" },
      );
    }
    expect(
      await lockOrderDeviceAction({
        name: "Till",
        shows: "till",
        department: DEPARTMENT,
      }),
    ).toEqual({ ok: false, failure: "failed" });
    expect(mocks.lockOrderStation).not.toHaveBeenCalled();
  });

  it("keeps the screen the device is, of the same kind and department", async () => {
    runs();
    device("prep", DEPARTMENT);
    expect(await lockOrderDeviceAction(kitchen)).toEqual({
      ok: true,
      to: STATION_PATH,
    });
    expect(mocks.lockOrderStation).not.toHaveBeenCalled();
    expect(mocks.rememberStation).toHaveBeenCalledWith(TOKEN);
  });

  it("refuses a device that is another running station of the business", async () => {
    runs();
    for (const [shows, department] of [
      ["clock_code", null],
      ["till", null],
      ["prep", null],
    ] as const) {
      device(shows, department);
      expect(await lockOrderDeviceAction(kitchen), shows).toEqual({
        ok: false,
        failure: "otherStation",
      });
    }
    expect(mocks.lockOrderStation).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("makes a new one on a stopped station's device", async () => {
    runs();
    device("clock_code", null, true);
    expect((await lockOrderDeviceAction(kitchen)).ok).toBe(true);
    expect(mocks.lockOrderStation).toHaveBeenCalled();
  });

  it("passes the database's refusal on, and signs nobody out", async () => {
    runs();
    mocks.lockOrderStation.mockResolvedValue({
      ok: false,
      failure: "tooManyStations",
    });
    expect(await lockOrderDeviceAction(kitchen)).toEqual({
      ok: false,
      failure: "tooManyStations",
    });
    expect(calls).toEqual([]);
  });
});

describe("stopping a screen and its undo", () => {
  it("stop and start again as whoever runs orders", async () => {
    runs();
    expect(await stopOrderStationAction(STATION)).toEqual({ ok: true });
    expect(mocks.setStationStopped).toHaveBeenCalledWith(USER, STATION, true);
    expect(await restartOrderStationAction(STATION)).toEqual({ ok: true });
    expect(mocks.setStationStopped).toHaveBeenLastCalledWith(
      USER,
      STATION,
      false,
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("refuse an id that isn't one, anyone else and a view", async () => {
    runs();
    expect(await stopOrderStationAction("station-kitchen")).toEqual({
      ok: false,
      failure: "gone",
    });
    runs(false);
    expect(await stopOrderStationAction(STATION)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    runs(true, true);
    expect(await restartOrderStationAction(STATION)).toEqual({
      ok: false,
      failure: "viewOnly",
    });
    expect(mocks.setStationStopped).not.toHaveBeenCalled();
  });

  it("pass the database's refusal on", async () => {
    runs();
    mocks.setStationStopped.mockResolvedValue({
      ok: false,
      failure: "tooLate",
    });
    expect(await restartOrderStationAction(STATION)).toEqual({
      ok: false,
      failure: "tooLate",
    });
  });
});
