import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /push/subscription, the browser saving its subscription, with the
// session, the database and the device cookie stood in for; the rules
// (`deviceLabel`, `savedDeviceLabel`, the body's schema) are the real ones.
// These hold what the route makes of them together: the kind of device is
// the user agent's word, refined to an iPad only by what the browser says
// (an iPad's Safari asking for the desktop site says it is a Mac), and
// nothing else the browser says changes it. The browser tests save a device
// only from a computer's Chromium.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const TEST_ORIGIN = "http://127.0.0.1:3199";
const ME = "10000000-0000-4000-a000-000000000001";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// Safari's default on an iPad: the desktop site, with a Mac's user agent.
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  savePushDevice: vi.fn(),
  removePushDevice: vi.fn(),
  rememberDevice: vi.fn(),
  forgetDeviceCookie: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("@/app/(app)/member", () => ({ currentMember: mocks.currentMember }));
vi.mock("@db/push/devices", () => ({
  savePushDevice: mocks.savePushDevice,
  removePushDevice: mocks.removePushDevice,
}));
vi.mock("@db/push/env", () => ({
  pushConfig: () => ({ publicKey: "BPublicKeyOfTheApp" }),
  pushTestOrigin: () => TEST_ORIGIN,
}));
vi.mock("../server", () => ({
  rememberDevice: mocks.rememberDevice,
  forgetDeviceCookie: mocks.forgetDeviceCookie,
}));

const { POST } = await import("./route");

/** A subscription as `PushSubscription.toJSON()` gives it, with `label` if any. */
function subscription(label?: string) {
  return {
    endpoint: `${TEST_ORIGIN}/push/00000000-0000-4000-b000-000000000001`,
    keys: { p256dh: `B${"A".repeat(86)}`, auth: "aW5zdGFudC1hdXRoLWtleQ" },
    ...(label === undefined ? {} : { label }),
  };
}

/** Saved from a browser whose user agent is `agent`. */
const save = (agent: string, body: unknown) =>
  POST(
    new Request(`${ORIGIN}/push/subscription`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        origin: ORIGIN,
        "user-agent": agent,
      },
      body: JSON.stringify(body),
    }),
  );

/** The kind of device the route saved, the last time. */
const savedLabel = () => mocks.savePushDevice.mock.lastCall?.[2];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.currentMember.mockResolvedValue({
    userId: ME,
    viewing: null,
    membership: { role: "owner", business: { id: "b" } },
  });
  mocks.savePushDevice.mockResolvedValue({ ok: true, device: "device-1" });
});

describe("the kind of device a saved subscription is kept as", () => {
  it("is an iPad for an iPad's Safari that asks for the desktop site", async () => {
    const response = await save(MAC, subscription("ipad"));
    expect(response.status).toBe(200);
    expect(mocks.savePushDevice).toHaveBeenCalledWith(
      ME,
      {
        endpoint: subscription().endpoint,
        p256dh: subscription().keys.p256dh,
        auth: subscription().keys.auth,
      },
      "ipad",
      undefined,
    );
    expect(mocks.rememberDevice).toHaveBeenCalledWith("device-1");
  });

  it("is the user agent's word when the browser says nothing more", async () => {
    await save(MAC, subscription());
    expect(savedLabel()).toBe("computer");
    await save(MAC, subscription("computer"));
    expect(savedLabel()).toBe("computer");
    await save(IPHONE, subscription());
    expect(savedLabel()).toBe("iphone");
  });

  it("is never changed by the browser but from a computer to an iPad", async () => {
    // An iPhone's user agent stays an iPhone, whatever the browser says.
    await save(IPHONE, subscription("ipad"));
    expect(savedLabel()).toBe("iphone");
    // A computer saying it is an Android phone stays a computer.
    await save(MAC, subscription("android"));
    expect(savedLabel()).toBe("computer");
  });

  it("leaves out a kind it doesn't know, and saves the device all the same", async () => {
    const response = await save(MAC, subscription("watch"));
    expect(response.status).toBe(200);
    expect(savedLabel()).toBe("computer");
  });
});
