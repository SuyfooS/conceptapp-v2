import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The demo door's two actions, with the secret key's client, the session's
// client and the business cookie stood in for. Both are server actions, so a
// POST from any page reaches them: on a site whose demo door is closed
// (DEMO_DOOR=off) each refuses before any call with the secret key, and a
// setting that is neither refuses everything, naming it. Where the door is
// open, a demo person comes in to the business offered and the reset runs.

vi.mock("server-only", () => ({}));

const SHOP = "11111111-1111-4111-a111-111111111111";

const mocks = vi.hoisted(() => ({
  resetDemoBusinesses: vi.fn(),
  renewDemoSchedules: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  slug: vi.fn(),
  rememberBusiness: vi.fn(),
}));
vi.mock("@db/demo", () => ({
  resetDemoBusinesses: mocks.resetDemoBusinesses,
  renewDemoSchedules: mocks.renewDemoSchedules,
}));
vi.mock("@db/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { generateLink: mocks.generateLink } },
  }),
}));
vi.mock("@db/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp },
    from: () => ({
      select: () => ({
        eq: (_column: string, slug: string) => ({
          maybeSingle: async () => {
            mocks.slug(slug);
            return { data: { id: SHOP } };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("../../(app)/business-cookie", () => ({
  rememberBusiness: mocks.rememberBusiness,
}));

const { enterAs, resetDemo } = await import("./actions");

/** Nothing reached the secret key, the session or the device. */
function nothingCalled() {
  expect(mocks.generateLink).not.toHaveBeenCalled();
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
  expect(mocks.rememberBusiness).not.toHaveBeenCalled();
  expect(mocks.resetDemoBusinesses).not.toHaveBeenCalled();
  expect(mocks.renewDemoSchedules).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.generateLink.mockResolvedValue({
    data: { properties: { hashed_token: "hashed" } },
    error: null,
  });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.resetDemoBusinesses.mockResolvedValue(2);
  mocks.renewDemoSchedules.mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the demo door closed (the site of real businesses)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_DOOR", "off");
  });

  it("signs nobody in, before the secret key is asked", async () => {
    expect(await enterAs("worker", "restaurant")).toEqual({ failed: true });
    expect(await enterAs("shopOwner", "shop")).toEqual({ failed: true });
    nothingCalled();
  });

  it("resets nothing", async () => {
    expect(await resetDemo()).toEqual({ ok: false });
    nothingCalled();
  });
});

describe("the demo door open (the demo's site)", () => {
  it("brings a demo person in to the business offered, and home", async () => {
    for (const setting of [undefined, "on"]) {
      if (setting) vi.stubEnv("DEMO_DOOR", setting);
      mocks.generateLink.mockClear();
      await expect(enterAs("worker", "restaurant")).rejects.toMatchObject({
        digest: expect.stringContaining(";/home;"),
      });
      expect(mocks.generateLink).toHaveBeenCalledTimes(1);
      expect(mocks.generateLink).toHaveBeenCalledWith({
        type: "recovery",
        email: "worker@demo.conceptapp.invalid",
      });
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        token_hash: "hashed",
        type: "recovery",
      });
      expect(mocks.slug).toHaveBeenLastCalledWith("demo-restaurant");
      expect(mocks.rememberBusiness).toHaveBeenLastCalledWith(SHOP);
    }
    // The restaurant's week is the visitor's to build.
    expect(mocks.renewDemoSchedules).not.toHaveBeenCalled();
  });

  it("publishes the shop's week for whoever comes in to it", async () => {
    await expect(enterAs("shopWorker", "shop")).rejects.toMatchObject({
      digest: expect.stringContaining(";/home;"),
    });
    expect(mocks.slug).toHaveBeenLastCalledWith("demo-shop");
    expect(mocks.renewDemoSchedules).toHaveBeenCalledTimes(1);
  });

  it("offers nobody else, whatever a client sends", async () => {
    for (const person of ["platform_admin", "shop-owner", ""]) {
      expect(await enterAs(person), person).toEqual({ failed: true });
    }
    nothingCalled();
  });

  it("puts the demo businesses back", async () => {
    expect(await resetDemo()).toEqual({ ok: true });
    expect(mocks.resetDemoBusinesses).toHaveBeenCalledTimes(1);
  });
});

describe("a setting that is neither", () => {
  it("refuses both, naming the setting, and calls nothing", async () => {
    vi.stubEnv("DEMO_DOOR", "maybe");
    await expect(enterAs("worker", "restaurant")).rejects.toThrow(/DEMO_DOOR/);
    await expect(resetDemo()).rejects.toThrow(/DEMO_DOOR/);
    nothingCalled();
  });
});
