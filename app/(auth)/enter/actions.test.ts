import { AFTER_SIGN_IN_COOKIE } from "@domain/after-sign-in";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The demo door's two actions, with the secret key's client, the session's
// client and the business cookie stood in for. Both are server actions, so a
// POST from any page reaches them: on a site whose demo door is closed
// (DEMO_DOOR=off) each refuses before any call with the secret key, and a
// setting that is neither refuses everything, naming it. Where the door is
// open, a demo person comes in to the business offered and the reset runs,
// landing on the page a link kept for after sign-in (known issue 21), taken
// only once they are in, else on Today.

vi.mock("server-only", () => ({}));

const SHOP = "11111111-1111-4111-a111-111111111111";

const mocks = vi.hoisted(() => ({
  resetDemoBusinesses: vi.fn(),
  renewDemoSchedules: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  slug: vi.fn(),
  rememberBusiness: vi.fn(),
  cookieRead: vi.fn(),
  cookieDeleted: vi.fn(),
}));
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      mocks.cookieRead(name);
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    delete: (name: string) => {
      mocks.cookieDeleted(name);
      jar.delete(name);
    },
  }),
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
  expect(mocks.cookieRead).not.toHaveBeenCalled();
  expect(mocks.cookieDeleted).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  jar.clear();
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
    jar.set(AFTER_SIGN_IN_COOKIE, "/lists");
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
    jar.set(AFTER_SIGN_IN_COOKIE, "/lists");
    for (const person of ["platform_admin", "shop-owner", ""]) {
      expect(await enterAs(person), person).toEqual({ failed: true });
    }
    nothingCalled();
  });

  it("lands on the page a link kept for after sign-in, and takes it", async () => {
    jar.set(AFTER_SIGN_IN_COOKIE, "/lists");
    await expect(enterAs("worker", "restaurant")).rejects.toMatchObject({
      digest: expect.stringContaining(";/lists;"),
    });
    expect(mocks.cookieDeleted).toHaveBeenCalledWith(AFTER_SIGN_IN_COOKIE);
    expect(jar.has(AFTER_SIGN_IN_COOKIE)).toBe(false);
  });

  it("lands on Today for a kept page that isn't one to keep, and takes it all the same", async () => {
    for (const value of [
      "//evil.example",
      "/admin",
      "/document-files/download",
    ]) {
      jar.set(AFTER_SIGN_IN_COOKIE, value);
      await expect(
        enterAs("worker", "restaurant"),
        value,
      ).rejects.toMatchObject({
        digest: expect.stringContaining(";/home;"),
      });
      expect(jar.has(AFTER_SIGN_IN_COOKIE), value).toBe(false);
    }
  });

  it("leaves a kept page where the door fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    jar.set(AFTER_SIGN_IN_COOKIE, "/lists");
    mocks.verifyOtp.mockResolvedValueOnce({ error: new Error("expired") });
    expect(await enterAs("worker", "restaurant")).toEqual({ failed: true });
    expect(mocks.cookieRead).not.toHaveBeenCalled();
    expect(mocks.cookieDeleted).not.toHaveBeenCalled();
    expect(jar.get(AFTER_SIGN_IN_COOKIE)).toBe("/lists");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("/lists");
    logged.mockRestore();
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
