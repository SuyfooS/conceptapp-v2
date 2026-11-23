import {
  AFTER_SIGN_IN_COOKIE,
  AFTER_SIGN_IN_MAX_AGE,
} from "@domain/after-sign-in";
import { getRedirectUrl } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The proxy's two doors (Orel, 22 November 2026): on a site whose demo door
// is open (DEMO_DOOR unset or on) a signed-out visitor goes to /enter, the
// demo people beside real sign-in; where it is closed (off) straight to
// /sign-in, in one hop, and /enter itself goes on there. Signed in, either
// door leads home. The session read is stood in for.
//
// The page a signed-out visitor opened (known issue 21): the redirect to the
// door keeps it in an httpOnly cookie for 15 minutes, its address bare; only
// for a page opened in the window from outside the app's own pages, so the
// router's own fetches, a prefetch, an image, a POST, or a reload of a tab
// left open after its session ended (Sec-Fetch-Site same-origin) leave the
// cookie as it is; where a phone's notification leads (its route, or the
// bare inbox) keeps the bare inbox whatever it says.
// A page that can't be kept (Today, the console, a file, a route handler)
// forgets one kept before. Signed in, the cookie is never touched.

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

/** A page opened in the window from another site, as a browser asks for it. */
const NAVIGATE = {
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
  "sec-fetch-site": "cross-site",
};

/**
 * The proxy's answer to a request for `path`: opened in the window from
 * another site unless `headers` say otherwise, with a page kept before when
 * `kept` is given, on this site unless `site` names another.
 */
async function visit(
  path: string,
  {
    method = "GET",
    headers = NAVIGATE,
    kept,
    site = SITE,
  }: {
    method?: string;
    headers?: Record<string, string>;
    kept?: string;
    site?: string;
  } = {},
): Promise<NextResponse> {
  const cookie: Record<string, string> =
    kept === undefined
      ? {}
      : { cookie: `${AFTER_SIGN_IN_COOKIE}=${encodeURIComponent(kept)}` };
  return await proxy(
    new NextRequest(`${site}${path}`, {
      method,
      headers: { ...headers, ...cookie },
    }),
  );
}

/** Where an answer sends the browser, as a path and its query. */
function door(response: NextResponse): string | null {
  const to = getRedirectUrl(response);
  if (to === null) return null;
  const url = new URL(to);
  return `${url.pathname}${url.search}`;
}

/** The page cookie an answer sets or deletes, if any. */
const keptBy = (response: NextResponse) =>
  response.cookies.get(AFTER_SIGN_IN_COOKIE);

/** The cookie as the proxy keeps a page, on https. */
const keeps = (value: string) => ({
  name: AFTER_SIGN_IN_COOKIE,
  value,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: AFTER_SIGN_IN_MAX_AGE,
  secure: true,
});

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

describe("the page a signed-out visitor opened", () => {
  const WEEK = "/schedule?week=2026-11-22";
  const LINE = "/notifications/open/00000000-0000-4000-8000-0000000000aa";

  it("is kept on the way to either door, the door's address bare", async () => {
    for (const [setting, to] of [
      ["on", "/enter"],
      ["off", "/sign-in"],
    ] as const) {
      vi.stubEnv("DEMO_DOOR", setting);
      const response = await visit(WEEK);
      expect(response.status, setting).toBe(307);
      expect(door(response), setting).toBe(to);
      expect(keptBy(response), setting).toMatchObject(keeps(WEEK));
    }
  });

  it("is Secure only over https", async () => {
    const response = await visit(WEEK, { site: "http://127.0.0.1:3100" });
    expect(keptBy(response)).toMatchObject({ ...keeps(WEEK), secure: false });
    const forwarded = await visit(WEEK, {
      site: "http://127.0.0.1:3100",
      headers: { ...NAVIGATE, "x-forwarded-proto": "https" },
    });
    expect(keptBy(forwarded)).toMatchObject(keeps(WEEK));
  });

  it("is kept for a browser that sends no Sec-Fetch headers (an older Safari) when it asks for a page", async () => {
    const accept =
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    expect(keptBy(await visit(WEEK, { headers: { accept } }))).toMatchObject(
      keeps(WEEK),
    );
    // Its fetches ask for anything: Next.js takes the router's headers off
    // before the proxy sees them, so that is what tells.
    for (const kept of [undefined, "/lists"]) {
      const fetched = await visit(WEEK, { headers: { accept: "*/*" }, kept });
      expect(door(fetched)).toBe("/enter");
      expect(fetched.headers.get("set-cookie")).toBeNull();
    }
  });

  it("keeps the inbox for a notification opened after the session ended", async () => {
    const response = await visit(LINE);
    expect(door(response)).toBe("/enter");
    expect(keptBy(response)).toMatchObject(keeps("/notifications"));
  });

  it("keeps the inbox for a notification whatever its window says, the service worker's same-origin too", async () => {
    for (const site of ["same-origin", "none", "same-site"]) {
      const response = await visit(LINE, {
        headers: { ...NAVIGATE, "sec-fetch-site": site },
        kept: WEEK,
      });
      expect(door(response), site).toBe("/enter");
      expect(keptBy(response), site).toMatchObject(keeps("/notifications"));
    }
  });

  it("keeps the bare inbox for a notification that leads there, the service worker's same-origin window too", async () => {
    // The one asking a signed-out phone to sign in again leads to the bare
    // inbox; the worker opens it in the app's window already open.
    for (const site of ["same-origin", "none", "cross-site"]) {
      for (const path of ["/notifications", "/notifications?before=x"]) {
        for (const kept of [undefined, "/lists"]) {
          const response = await visit(path, {
            headers: { ...NAVIGATE, "sec-fetch-site": site },
            kept,
          });
          expect(door(response), `${site} ${path}`).toBe("/enter");
          expect(keptBy(response), `${site} ${path}`).toMatchObject(
            keeps("/notifications"),
          );
        }
      }
    }
    // A page under the inbox, from the app's own, is a page like any other.
    const settings = await visit("/notifications/settings", {
      headers: { ...NAVIGATE, "sec-fetch-site": "same-origin" },
      kept: "/lists",
    });
    expect(door(settings)).toBe("/enter");
    expect(settings.headers.get("set-cookie")).toBeNull();
  });

  it("is kept from a link in another app, an address typed and the same site's other address", async () => {
    for (const site of ["none", "same-site"]) {
      const response = await visit(WEEK, {
        headers: { ...NAVIGATE, "sec-fetch-site": site },
      });
      expect(keptBy(response), site).toMatchObject(keeps(WEEK));
    }
  });

  it("is left as it was by a page the app's own sent there, as a tab left open after its session ended reloads", async () => {
    // The last person's chat, reloaded by its tab after they signed out:
    // kept, the next person to sign in on the device would land on it.
    const SAME = { ...NAVIGATE, "sec-fetch-site": "same-origin" };
    for (const path of [
      "/chat/00000000-0000-4000-8000-0000000000bb",
      "/chat/with/00000000-0000-4000-8000-0000000000cc",
      WEEK,
      // Nor does one that can't be kept forget a link someone followed in.
      "/home",
      "/admin",
    ]) {
      for (const kept of [undefined, "/lists"]) {
        const response = await visit(path, { headers: SAME, kept });
        expect(door(response), path).toBe("/enter");
        expect(response.headers.get("set-cookie"), path).toBeNull();
      }
    }
  });

  it("keeps nothing for a page that isn't kept, and forgets one kept before", async () => {
    for (const path of [
      "/home",
      "/admin",
      "/admin/businesses/x",
      "/photos/u/f.webp",
      "/chat-files/a/b/c",
      "/document-files/download",
      "/clock/pay/export?month=2026-10",
      "/clock/code/issue",
      "/schedule/..%2F..%2Fadmin",
      `/lists?q=${"a".repeat(600)}`,
    ]) {
      const none = await visit(path);
      expect(door(none), path).toBe("/enter");
      expect(keptBy(none), path).toBeUndefined();
      expect(none.headers.get("set-cookie"), path).toBeNull();
      const before = await visit(path, { kept: WEEK });
      expect(door(before), path).toBe("/enter");
      expect(keptBy(before), path).toMatchObject({
        value: "",
        path: "/",
        expires: new Date(0),
      });
    }
  });

  it("is left as it was by the router's own fetches, a prefetch, an image and a POST", async () => {
    const requests: { method?: string; headers?: Record<string, string> }[] = [
      { headers: { rsc: "1" } },
      { headers: { rsc: "1", "next-router-prefetch": "1" } },
      { headers: { rsc: "1", "next-router-segment-prefetch": "/_tree" } },
      { headers: { "next-action": "abc" } },
      { headers: { ...NAVIGATE, "sec-purpose": "prefetch" } },
      { headers: { ...NAVIGATE, "sec-fetch-dest": "image" } },
      { headers: { ...NAVIGATE, "sec-fetch-mode": "cors" } },
      { method: "POST" },
    ];
    for (const request of requests) {
      const label = JSON.stringify(request);
      for (const kept of [undefined, "/lists"]) {
        const response = await visit(WEEK, { ...request, kept });
        expect(door(response), label).toBe("/enter");
        expect(response.headers.get("set-cookie"), label).toBeNull();
      }
    }
    for (const kept of [undefined, "/lists"]) {
      const response = await visit(`${WEEK}&_rsc=x`, { kept });
      expect(door(response)).toBe("/enter");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("is never touched for someone signed in", async () => {
    mocks.userId = USER;
    for (const kept of [undefined, "/lists"]) {
      const response = await visit(WEEK, { kept });
      expect(door(response)).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
      for (const path of ["/enter", "/sign-in"]) {
        const home = await visit(path, { kept });
        expect(door(home), path).toBe("/home");
        expect(home.headers.get("set-cookie"), path).toBeNull();
      }
    }
  });

  it("is left as it was by the doors themselves, and the closed door's hop", async () => {
    for (const path of ["/enter", "/sign-in"]) {
      const response = await visit(path, { kept: WEEK });
      expect(door(response), path).toBeNull();
      expect(response.headers.get("set-cookie"), path).toBeNull();
    }
    vi.stubEnv("DEMO_DOOR", "off");
    const hop = await visit("/enter", { kept: WEEK });
    expect(door(hop)).toBe("/sign-in");
    expect(hop.headers.get("set-cookie")).toBeNull();
  });
});
