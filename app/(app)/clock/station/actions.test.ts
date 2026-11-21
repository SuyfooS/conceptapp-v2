import { STATION_PATH } from "@domain/clock-station";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Locking this device on the clock's code (`lockDeviceAction`), with the
// person, the device and the database stood in for: a device that is the
// business's kitchen's screen or till stays that one for whoever runs
// orders, and isn't the clock's for a clock editor until it is stopped; one
// that is another business's gives way to this business's clock station,
// as the prep screen's lock does. Then the device is remembered and the
// session ended here, last.

vi.mock("server-only", () => ({}));

const A = "ea000000-0000-4000-b000-000000000001";
const B = "ea000000-0000-4000-b000-000000000002";
const USER = "ea000000-0000-4000-a000-000000000001";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";

const calls = vi.hoisted(() => [] as string[]);
const mocks = vi.hoisted(() => ({
  clockAccess: vi.fn(),
  currentModuleSettings: vi.fn(),
  deviceStation: vi.fn(),
  orderLockerBusiness: vi.fn(),
  rememberStation: vi.fn(),
  endSessionHere: vi.fn(),
  lockStation: vi.fn(),
}));
vi.mock("../clock", () => ({ clockAccess: mocks.clockAccess }));
vi.mock("../../modules", () => ({
  currentModuleSettings: mocks.currentModuleSettings,
}));
vi.mock("./station", () => ({
  deviceStation: mocks.deviceStation,
  orderLockerBusiness: mocks.orderLockerBusiness,
  rememberStation: mocks.rememberStation,
}));
vi.mock("../../../(auth)/end-session", () => ({
  endSessionHere: mocks.endSessionHere,
}));
vi.mock("@db/clock-stations", () => ({ lockStation: mocks.lockStation }));

const { lockDeviceAction } = await import("./actions");

/** This device holds the secret of a running station of `businessId`. */
function device(businessId: string, shows: "clock_code" | "prep" | "till") {
  mocks.deviceStation.mockResolvedValue({
    token: TOKEN,
    station: {
      id: "station-1",
      name: shows === "clock_code" ? "Door" : "Kitchen",
      businessId,
      businessName: "Demo",
      accent: "#0a84ff",
      timeZone: "Asia/Jerusalem",
      stopped: false,
      shows,
      departmentId: null,
    },
  });
}

/** Signed in as someone who edits business `businessId`'s clock. */
function editsClock(businessId: string) {
  mocks.clockAccess.mockResolvedValue({
    userId: USER,
    businessId,
    role: "manager",
    perms: ["clock.edit"],
    viewOnly: false,
  });
}

beforeEach(() => {
  calls.length = 0;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.deviceStation.mockResolvedValue(null);
  mocks.orderLockerBusiness.mockResolvedValue(null);
  mocks.clockAccess.mockResolvedValue(null);
  mocks.currentModuleSettings.mockResolvedValue({ codeDisplay: "both" });
  mocks.rememberStation.mockImplementation(async () => {
    calls.push("remember");
  });
  mocks.endSessionHere.mockImplementation(async () => {
    calls.push("end");
  });
  mocks.lockStation.mockResolvedValue({
    ok: true,
    value: { token: "new-token", stationId: "station-2" },
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the clock's lock on a kitchen's screen or a till", () => {
  it("keeps the business's own one for whoever runs its orders", async () => {
    device(A, "prep");
    mocks.orderLockerBusiness.mockResolvedValue(A);
    expect(await lockDeviceAction({ name: "Door" })).toEqual({
      ok: true,
      to: STATION_PATH,
    });
    expect(mocks.lockStation).not.toHaveBeenCalled();
    expect(mocks.rememberStation).toHaveBeenCalledWith(TOKEN);
    expect(calls).toEqual(["remember", "end"]);
  });

  it("refuses the business's own one to a clock editor who doesn't run orders", async () => {
    device(A, "till");
    editsClock(A);
    expect(await lockDeviceAction({ name: "Door" })).toEqual({
      ok: false,
      failure: "otherStation",
    });
    expect(mocks.lockStation).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("makes another business's one this business's clock station", async () => {
    device(A, "prep");
    // B's clock editor, who may run B's orders too: A's screen is none of B's.
    mocks.orderLockerBusiness.mockResolvedValue(B);
    editsClock(B);
    expect(await lockDeviceAction({ name: "Door" })).toEqual({
      ok: true,
      to: STATION_PATH,
    });
    expect(mocks.lockStation).toHaveBeenCalledWith(USER, B, "Door");
    expect(mocks.rememberStation).toHaveBeenCalledWith("new-token");
    expect(calls).toEqual(["remember", "end"]);
  });

  it("refuses anyone who edits no clock, as before", async () => {
    device(B, "prep");
    expect(await lockDeviceAction({ name: "Door" })).toEqual({
      ok: false,
      failure: "noAccess",
    });
  });
});

describe("the clock's lock on the clock's own station", () => {
  it("keeps it, and makes a new one elsewhere", async () => {
    device(A, "clock_code");
    editsClock(A);
    expect(await lockDeviceAction({ name: "Door" })).toEqual({
      ok: true,
      to: STATION_PATH,
    });
    expect(mocks.lockStation).not.toHaveBeenCalled();
    expect(mocks.rememberStation).toHaveBeenCalledWith(TOKEN);

    mocks.deviceStation.mockResolvedValue(null);
    expect(await lockDeviceAction({ name: "Door" })).toEqual({
      ok: true,
      to: STATION_PATH,
    });
    expect(mocks.lockStation).toHaveBeenCalledWith(USER, A, "Door");
  });
});
