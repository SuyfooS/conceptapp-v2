import { STATION_COOKIE, STATION_PATH } from "@domain/clock-station";
import { signInPath } from "@domain/passive-sign-in";
import { beforeEach, describe, expect, it, vi } from "vitest";

// What the device's clock station decides once someone signed in, with the
// cookie, the database and the person stood in for. `signedOutPath`: a device
// that is a running station goes back to its code once signed out, and any
// other, a stopped one or one that can't be read included, to the door.
// `currentStationHome`: on a running station of the business open on Home,
// whoever may lock it gets the lock and anyone else the sign-out; nothing on
// any other device, and a device with no station's cookie reads nothing more.
// A kitchen's screen or a till (waiter mode P8a) is locked again by whoever
// runs orders, and the clock's lock on such a device says what it is.

vi.mock("server-only", () => ({}));

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const OTHER = "10000000-0000-4000-b000-000000000002";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";

/** The device's cookies, by name. */
const jar = vi.hoisted(() => new Map<string, string>());
const mocks = vi.hoisted(() => ({
  stationByToken: vi.fn(),
  getRunningStations: vi.fn(),
  countRunningStations: vi.fn(),
  clockAccess: vi.fn(),
  ordersAccess: vi.fn(),
  currentModuleSettings: vi.fn(),
  currentMember: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));
vi.mock("@db/clock-stations", () => ({
  stationByToken: mocks.stationByToken,
  getRunningStations: mocks.getRunningStations,
  countRunningStations: mocks.countRunningStations,
}));
vi.mock("../clock", () => ({ clockAccess: mocks.clockAccess }));
vi.mock("../../orders/orders-access", () => ({
  ordersAccess: mocks.ordersAccess,
}));
vi.mock("../../modules", () => ({
  currentModuleSettings: mocks.currentModuleSettings,
}));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("@/app/origin", () => ({ requestOrigin: vi.fn() }));

const { currentLockOffer, currentStationHome, signedOutPath } = await import(
  "./station"
);

/** This device holds the secret of a station of `businessId`, showing `shows`. */
function heldStation(
  businessId = BUSINESS,
  stopped = false,
  shows: "clock_code" | "prep" | "till" = "clock_code",
) {
  jar.set(STATION_COOKIE, TOKEN);
  mocks.stationByToken.mockResolvedValue({
    id: "station-entrance",
    name: shows === "clock_code" ? "entrance" : "kitchen",
    businessId,
    businessName: "Demo",
    accent: "#0a84ff",
    timeZone: "Asia/Jerusalem",
    stopped,
    shows,
    departmentId: null,
  });
}

/** Signed in as someone who runs orders in the business, or doesn't. */
function runsOrders(runs: boolean, viewing = false) {
  mocks.ordersAccess.mockResolvedValue({
    businessId: BUSINESS,
    viewing,
    reach: { mode: { runs } },
  });
}

/** Signed in, in the business, as someone who edits the clock or doesn't. */
function signedIn({
  edits = false,
  viewOnly = false,
}: {
  edits?: boolean;
  viewOnly?: boolean;
} = {}) {
  mocks.currentMember.mockResolvedValue({
    membership: { business: { id: BUSINESS } },
  });
  mocks.clockAccess.mockResolvedValue({
    businessId: BUSINESS,
    role: edits ? "manager" : "worker",
    perms: edits ? ["clock.edit"] : [],
    viewOnly,
  });
}

beforeEach(() => {
  jar.clear();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.stationByToken.mockResolvedValue(null);
  mocks.currentModuleSettings.mockResolvedValue({ codeDisplay: "both" });
  mocks.getRunningStations.mockResolvedValue([]);
  mocks.countRunningStations.mockResolvedValue({ ok: true, count: 0 });
  mocks.ordersAccess.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("where a device goes once signed out", () => {
  it("is the door with no station's cookie, read from nowhere", async () => {
    expect(await signedOutPath()).toBe(signInPath);
    jar.set(STATION_COOKIE, "not-a-secret");
    expect(await signedOutPath()).toBe(signInPath);
    expect(mocks.stationByToken).not.toHaveBeenCalled();
  });

  it("is the station's code on a running station, of any business", async () => {
    heldStation();
    expect(await signedOutPath()).toBe(STATION_PATH);
    heldStation(OTHER);
    expect(await signedOutPath()).toBe(STATION_PATH);
    expect(mocks.stationByToken).toHaveBeenCalledWith(TOKEN);
  });

  it("is the door on a stopped station, or a secret that is no station's", async () => {
    heldStation(BUSINESS, true);
    expect(await signedOutPath()).toBe(signInPath);
    mocks.stationByToken.mockResolvedValue(null);
    expect(await signedOutPath()).toBe(signInPath);
  });

  it("is the door when the station can't be read, and logs no secret", async () => {
    jar.set(STATION_COOKIE, TOKEN);
    mocks.stationByToken.mockRejectedValue(new Error("reading failed"));
    expect(await signedOutPath()).toBe(signInPath);
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      TOKEN,
    );
  });
});

describe("Home's card on the business's clock station", () => {
  it("is nothing for someone in no business", async () => {
    mocks.currentMember.mockResolvedValue({ membership: null });
    heldStation();
    expect(await currentStationHome()).toBeNull();
    expect(mocks.stationByToken).not.toHaveBeenCalled();
  });

  it("is nothing on a device with no station's cookie, which reads nothing more", async () => {
    signedIn({ edits: true });
    expect(await currentStationHome()).toBeNull();
    expect(mocks.stationByToken).not.toHaveBeenCalled();
    expect(mocks.clockAccess).not.toHaveBeenCalled();
    expect(mocks.currentModuleSettings).not.toHaveBeenCalled();
  });

  it("locks it again for whoever edits the clock, as the station it is", async () => {
    heldStation();
    signedIn({ edits: true });
    expect(await currentStationHome()).toEqual({
      kind: "lock",
      shows: "clock_code",
      offer: { current: { name: "entrance" }, running: [] },
    });
    expect(mocks.getRunningStations).not.toHaveBeenCalled();
  });

  it("tells anyone else to sign out when done", async () => {
    heldStation();
    signedIn();
    expect(await currentStationHome()).toEqual({
      kind: "signOut",
      shows: "clock_code",
    });
  });

  it("tells whoever edits the clock to sign out where they can't lock it", async () => {
    heldStation();
    // The team viewing as someone only reads.
    signedIn({ edits: true, viewOnly: true });
    expect(await currentStationHome()).toEqual({
      kind: "signOut",
      shows: "clock_code",
    });
    // Codes on a manager's phone only: locking would be refused.
    signedIn({ edits: true });
    mocks.currentModuleSettings.mockResolvedValue({ codeDisplay: "manager" });
    expect(await currentStationHome()).toEqual({
      kind: "signOut",
      shows: "clock_code",
    });
    // The clock off for the person: no access to it at all.
    mocks.clockAccess.mockResolvedValue(null);
    expect(await currentStationHome()).toEqual({
      kind: "signOut",
      shows: "clock_code",
    });
  });

  it("is nothing on a stopped station, or another business's", async () => {
    signedIn({ edits: true });
    heldStation(BUSINESS, true);
    expect(await currentStationHome()).toBeNull();
    heldStation(OTHER);
    expect(await currentStationHome()).toBeNull();
  });

  it("is nothing when the station can't be read", async () => {
    signedIn();
    jar.set(STATION_COOKIE, TOKEN);
    mocks.stationByToken.mockRejectedValue(new Error("reading failed"));
    expect(await currentStationHome()).toBeNull();
  });
});

describe("Home's card on the business's kitchen's screen or till", () => {
  it("locks it again for whoever runs orders, as the screen it is", async () => {
    heldStation(BUSINESS, false, "prep");
    signedIn();
    runsOrders(true);
    expect(await currentStationHome()).toEqual({
      kind: "lock",
      shows: "prep",
      offer: { current: { name: "kitchen" }, running: [] },
    });
  });

  it("tells whoever edits the clock and doesn't run orders to sign out, and a view too", async () => {
    heldStation(BUSINESS, false, "till");
    signedIn({ edits: true });
    runsOrders(false);
    expect(await currentStationHome()).toEqual({
      kind: "signOut",
      shows: "till",
    });
    runsOrders(true, true);
    expect(await currentStationHome()).toEqual({
      kind: "signOut",
      shows: "till",
    });
  });
});

describe("the clock's lock on a device", () => {
  it("keeps the clock's station it is", async () => {
    heldStation();
    signedIn({ edits: true });
    expect(await currentLockOffer()).toEqual({
      current: { name: "entrance" },
      running: [],
    });
  });

  it("says what a kitchen's screen is, and counts every kind of station", async () => {
    heldStation(BUSINESS, false, "prep");
    signedIn({ edits: true });
    mocks.getRunningStations.mockResolvedValue([{ name: "Front" }]);
    mocks.countRunningStations.mockResolvedValue({ ok: true, count: 2 });
    expect(await currentLockOffer()).toEqual({
      current: null,
      running: ["Front"],
      total: 2,
      other: { name: "kitchen", shows: "prep" },
    });
  });

  it("is a new station's elsewhere", async () => {
    signedIn({ edits: true });
    expect(await currentLockOffer()).toEqual({
      current: null,
      running: [],
      total: 0,
      other: null,
    });
  });
});
