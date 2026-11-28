import { beforeEach, describe, expect, it, vi } from "vitest";

// Who is offered notifications on the phone, on Today's card (closing the
// pilot, PR 6) and after a moment (`currentPushAsk`), with the database, the
// session and push's keys stood in for. The browser's part (what it is,
// whether it blocks them or has them) is the card's: @domain/push's
// `pushAskStart` and its tests.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  pushConfig: vi.fn(),
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  pushAllowed: vi.fn(),
  ownDeviceKinds: vi.fn(),
  getNotificationPreferences: vi.fn(),
  seen: vi.fn(),
  putAway: vi.fn(),
}));
vi.mock("@db/push/env", () => ({ pushConfig: mocks.pushConfig }));
vi.mock("@db/push/devices", () => ({
  pushAllowed: mocks.pushAllowed,
  ownDeviceKinds: mocks.ownDeviceKinds,
}));
vi.mock("@db/notification-preferences", () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
}));
vi.mock("../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../modules", () => ({ currentModules: mocks.currentModules }));
vi.mock("./preferences-actions", () => ({
  seePushAskAction: mocks.seen,
  putAwayPushAskAction: mocks.putAway,
}));

const { currentPushAsk } = await import("./push-ask-offer");

const KEY = "BPublicKeyOfTheApp";
const ME = "10000000-0000-4000-a000-000000000001";

/** Someone in a business at `slug`, in `role`, or the team viewing as it. */
function member(role: string, { slug = "a-real-shop", viewing = false } = {}) {
  return {
    userId: ME,
    viewing: viewing ? { role, namedRole: null, businessSlug: slug } : null,
    membership: { role, business: { id: "b", slug } },
  };
}

/** Everything set for an offer; each test takes one thing away. */
function offered() {
  mocks.pushConfig.mockReturnValue({ publicKey: KEY });
  mocks.currentMember.mockResolvedValue(member("worker"));
  mocks.currentModules.mockResolvedValue(["scheduling", "notifications"]);
  mocks.pushAllowed.mockResolvedValue(true);
  mocks.ownDeviceKinds.mockResolvedValue([]);
  mocks.getNotificationPreferences.mockResolvedValue({ askedAt: null });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  offered();
});

describe("the offer of notifications on the phone", () => {
  it("comes for every role, with the key, the devices and both ways to keep it", async () => {
    for (const role of ["worker", "manager", "owner", "accountant"]) {
      mocks.currentMember.mockResolvedValue(member(role));
      expect(await currentPushAsk(), role).toEqual({
        publicKey: KEY,
        devices: [],
        seen: mocks.seen,
        putAway: mocks.putAway,
      });
    }
  });

  it("says which kinds of devices already have them", async () => {
    mocks.ownDeviceKinds.mockResolvedValue(["iphone"]);
    expect((await currentPushAsk())?.devices).toEqual(["iphone"]);
  });

  it("comes with no devices when they can't be read", async () => {
    mocks.ownDeviceKinds.mockRejectedValue(new Error("down"));
    expect((await currentPushAsk())?.devices).toEqual([]);
  });

  it("never comes without push set up, and asks nothing then", async () => {
    mocks.pushConfig.mockReturnValue(null);
    expect(await currentPushAsk()).toBeNull();
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(mocks.getNotificationPreferences).not.toHaveBeenCalled();
  });

  it("never comes in a demo business, whatever the database says", async () => {
    for (const slug of ["demo-restaurant", "demo-shop"]) {
      mocks.currentMember.mockResolvedValue(member("worker", { slug }));
      expect(await currentPushAsk(), slug).toBeNull();
    }
    expect(mocks.pushAllowed).not.toHaveBeenCalled();
  });

  it("never comes while viewing as someone", async () => {
    mocks.currentMember.mockResolvedValue(member("worker", { viewing: true }));
    expect(await currentPushAsk()).toBeNull();
  });

  it("never comes with the notifications module off", async () => {
    mocks.currentModules.mockResolvedValue(["scheduling"]);
    expect(await currentPushAsk()).toBeNull();
  });

  it("never comes before anyone added the person to a business", async () => {
    mocks.currentMember.mockResolvedValue({
      userId: ME,
      viewing: null,
      membership: null,
    });
    expect(await currentPushAsk()).toBeNull();
    mocks.currentMember.mockResolvedValue(null);
    expect(await currentPushAsk()).toBeNull();
  });

  it("never comes where the person's lines reach no phone, or that can't be told", async () => {
    for (const allowed of [false, null]) {
      mocks.pushAllowed.mockResolvedValue(allowed);
      expect(await currentPushAsk(), String(allowed)).toBeNull();
    }
  });

  it("never comes again once they said 'לא עכשיו' or a moment's card showed", async () => {
    mocks.getNotificationPreferences.mockResolvedValue({
      askedAt: "2026-11-28T08:00:00+00:00",
    });
    expect(await currentPushAsk()).toBeNull();
  });

  it("never comes when their choices can't be read", async () => {
    mocks.getNotificationPreferences.mockRejectedValue(new Error("down"));
    expect(await currentPushAsk()).toBeNull();
  });
});
