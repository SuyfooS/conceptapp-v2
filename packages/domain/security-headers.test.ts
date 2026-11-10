import { describe, expect, it } from "vitest";
import {
  headerRules,
  NOINDEX,
  OUT_OF_SEARCH,
  PERMISSIONS_POLICY,
  SECURITY_HEADERS,
} from "./security-headers";

const header = (key: string) =>
  SECURITY_HEADERS.find((h) => h.key === key)?.value;

/** Each feature of the Permissions-Policy, with who may use it. */
const policy = new Map(
  PERMISSIONS_POLICY.split(", ").map((entry) => {
    const [feature, allow] = entry.split("=");
    return [feature, allow];
  }),
);

describe("security headers", () => {
  it("lets no other site frame the app", () => {
    expect(header("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(header("X-Frame-Options")).toBe("DENY");
  });

  it("stops type sniffing and keeps paths from other sites", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("allows the camera, the wake lock and full screen on the app's own pages", () => {
    expect(policy.get("camera")).toBe("(self)");
    expect(policy.get("screen-wake-lock")).toBe("(self)");
    expect(policy.get("fullscreen")).toBe("(self)");
  });

  it("turns off what the app never asks for", () => {
    for (const feature of ["microphone", "geolocation", "payment", "usb"]) {
      expect(policy.get(feature), feature).toBe("()");
    }
  });

  it("names each feature once, in the header's own syntax", () => {
    const entries = PERMISSIONS_POLICY.split(", ");
    expect(new Set(entries.map((e) => e.split("=")[0])).size).toBe(
      entries.length,
    );
    for (const entry of entries) {
      expect(entry).toMatch(/^[a-z-]+=\((self)?\)$/);
    }
  });
});

describe("header rules", () => {
  const rules = headerRules();

  it("puts the security headers on every path", () => {
    expect(rules[0]).toEqual({
      source: "/:path*",
      headers: [...SECURITY_HEADERS],
    });
  });

  it("marks the design gallery and invite links noindex", () => {
    expect(OUT_OF_SEARCH).toEqual(["/design", "/join"]);
    for (const path of OUT_OF_SEARCH) {
      expect(rules).toContainEqual({
        source: `${path}/:path*`,
        headers: [NOINDEX],
      });
    }
  });

  it("keeps the service worker's own content policy, after the pages' one", () => {
    const last = rules.at(-1);
    expect(last?.source).toBe("/sw.js");
    expect(last?.headers).toContainEqual({
      key: "Content-Security-Policy",
      value: "default-src 'self'; script-src 'self'",
    });
    expect(last?.headers).toContainEqual({
      key: "Cache-Control",
      value: "no-cache, no-store, must-revalidate",
    });
  });
});
