import { getRedirectUrl } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The proxy's two doors (Orel, 22 November 2026): on a site whose demo door
// is open (DEMO_DOOR unset or on) a signed-out visitor goes to /enter, the
// demo people beside real sign-in; where it is closed (off) straight to
// /sign-in, in one hop, and /enter itself goes on there. Signed in, either
// door leads home. The session read is stood in for.

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@db/supabase/proxy", () => ({
  refreshSession: async () => ({
    response: NextResponse.next(),
    userId: mocks.userId,
  }),
  withSessionCookies: (_from: NextResponse, to: NextResponse) => to,
}));

const { proxy } = await import("../proxy");

const USER = "00000000-0000-4000-8000-000000000001";
const SITE = "https://conceptapp.test";

/**
 * Where the proxy sends a request for `path` on this site, as a path, or
 * null where it lets the request be.
 */
async function sends(path: string): Promise<string | null> {
  const response = await proxy(new NextRequest(`${SITE}${path}`));
  const to = getRedirectUrl(response);
  if (to === null) return null;
  expect(response.status, path).toBe(307);
  const url = new URL(to);
  expect(url.origin, path).toBe(SITE);
  return url.pathname;
}

beforeEach(() => {
  mocks.userId = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the demo door open (the demo's site)", () => {
  it("sends a signed-out visitor to /enter and lets both doors be", async () => {
    for (const setting of [undefined, "on"]) {
      if (setting) vi.stubEnv("DEMO_DOOR", setting);
      expect(await sends("/home")).toBe("/enter");
      expect(await sends("/enter")).toBeNull();
      expect(await sends("/sign-in")).toBeNull();
    }
  });
});

describe("the demo door closed (the site of real businesses)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_DOOR", "off");
  });

  it("sends a signed-out visitor straight to real sign-in", async () => {
    for (const path of [
      "/home",
      "/me/past/00000000-0000-4000-b000-000000000001",
      "/admin",
      "/schedule/build",
    ]) {
      expect(await sends(path), path).toBe("/sign-in");
    }
  });

  it("sends /enter on to /sign-in, and lets /sign-in and the station be", async () => {
    expect(await sends("/enter")).toBe("/sign-in");
    expect(await sends("/sign-in")).toBeNull();
    expect(await sends("/station")).toBeNull();
  });
});

describe("signed in", () => {
  it("leads either door home, with the door open or closed", async () => {
    mocks.userId = USER;
    for (const setting of ["on", "off"]) {
      vi.stubEnv("DEMO_DOOR", setting);
      expect(await sends("/enter"), setting).toBe("/home");
      expect(await sends("/sign-in"), setting).toBe("/home");
      expect(await sends("/home"), setting).toBeNull();
    }
  });
});

describe("a setting that is neither", () => {
  it("answers nothing, naming the setting", async () => {
    // The build fails on it first: /sign-in is drawn when it is built.
    vi.stubEnv("DEMO_DOOR", "maybe");
    await expect(sends("/home")).rejects.toThrow(/DEMO_DOOR/);
    await expect(sends("/enter")).rejects.toThrow(/DEMO_DOOR/);
  });
});
