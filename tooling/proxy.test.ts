import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { manifests } from "../modules/registry";

// proxy.ts lists the signed-in screens twice (redirect list and matcher,
// which Next.js needs as literals). Every module screen and the console
// must be in both, or a signed-out visitor would reach it without a session
// refresh.
const source = readFileSync(join(__dirname, "..", "proxy.ts"), "utf8");

describe("proxy", () => {
  it("guards the team screens", () => {
    expect(source).toContain('"/team",');
    expect(source).toContain('"/team/:path*"');
  });

  it("guards the management screens", () => {
    expect(source).toContain('"/manage",');
    expect(source).toContain('"/manage/:path*"');
  });

  it("guards the notifications, which have no tab", () => {
    expect(source).toContain('"/notifications",');
    expect(source).toContain('"/notifications/:path*"');
  });

  it("guards the orders screens, which have no tab", () => {
    // Taking orders' screens: the menu (waiter mode P2) and the mode's own
    // (P4), which has no tab of the app's.
    expect(source).toContain('"/orders",');
    expect(source).toContain('"/orders/:path*"');
  });

  it("guards the profile", () => {
    expect(source).toContain('"/me",');
    expect(source).toContain('"/me/:path*"');
  });

  it("guards a former worker's old file, under the profile", () => {
    // /me/past/<business> (profile H5c) is outside the app's frame: a
    // signed-out visitor still goes to sign-in, and the session is renewed.
    const path = "/me/past/00000000-0000-4000-b000-000000000001";
    const privateBlock =
      /export const PRIVATE = \[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
    const guarded = [...privateBlock.matchAll(/"(\/[^"]*)"/g)].map(
      ([, p = ""]) => p,
    );
    expect(guarded.some((p) => path.startsWith(`${p}/`))).toBe(true);
    const block = /matcher: \[([\s\S]*?)\],/.exec(source)?.[1] ?? "";
    const matcher = [...block.matchAll(/^\s+"([^"]+)",$/gm)].map(
      ([, pattern = ""]) => pattern,
    );
    expect(
      unstable_doesMiddlewareMatch({ config: { matcher }, url: path }),
    ).toBe(true);
  });

  it("guards the photos", () => {
    expect(source).toContain('"/photos",');
    expect(source).toContain('"/photos/:path*"');
  });

  it("guards the list photos", () => {
    expect(source).toContain('"/list-photos",');
    expect(source).toContain('"/list-photos/:path*"');
  });

  it("guards the files sent in chat", () => {
    // /chat-files serves a message's picture under the reader's session
    // (C4), as /list-photos does: a signed-out visitor goes to sign-in.
    expect(source).toContain('"/chat-files",');
    expect(source).toContain('"/chat-files/:path*"');
  });

  it("guards the official documents' files", () => {
    // /document-files serves a document's file or sample, and the office's
    // download of them all (C7), under the reader's session: a signed-out
    // visitor goes to sign-in, and the route itself answers nobody else.
    expect(source).toContain('"/document-files",');
    expect(source).toContain('"/document-files/:path*"');
  });

  it("guards every module screen, and every mode's", () => {
    for (const m of manifests) {
      for (const href of [m.nav?.href, m.mode?.href]) {
        if (!href) continue;
        expect(source).toContain(`"${href}",`);
        expect(source).toContain(`"${href}/:path*"`);
      }
    }
  });

  it("guards every module's own page, under a screen it guards already", () => {
    // A module with no tab keeps its screen under one (the hiring file's
    // /me/file, profile H5a), so the matcher's `/:path*` holds it.
    const pages = manifests.flatMap((m) => (m.page ? [m.page.href] : []));
    expect(pages).toEqual(["/me/file"]);
    const privateBlock =
      /export const PRIVATE = \[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
    const guarded = [...privateBlock.matchAll(/"(\/[^"]*)"/g)].map(
      ([, path = ""]) => path,
    );
    for (const page of pages) {
      const under = guarded.find((path) => page.startsWith(`${path}/`));
      expect(under, page).toBeDefined();
      expect(source).toContain(`"${under}/:path*"`);
    }
  });

  it("refreshes a session left on a station, without guarding it, but never on its poll and writes", () => {
    // /station is for a device with nobody signed in, so never PRIVATE; in
    // the matcher, a session left on it is renewed and seen as one, and
    // nothing shows beside it. The kitchen's and the till's poll and writes
    // (waiter mode P8a) stay out: asked every five seconds, each would run
    // the proxy too, and each refuses any session itself.
    const block = /matcher: \[([\s\S]*?)\],/.exec(source)?.[1] ?? "";
    const matcher = [...block.matchAll(/^\s+"([^"]+)",$/gm)].map(
      ([, pattern = ""]) => pattern,
    );
    expect(matcher.length).toBeGreaterThan(10);
    const runs = (url: string) =>
      unstable_doesMiddlewareMatch({ config: { matcher }, url });
    for (const path of [
      "/station",
      "/station/code",
      "/station/manifest.webmanifest",
    ]) {
      expect(runs(path), path).toBe(true);
    }
    for (const path of [
      "/station/tickets",
      "/station/tickets?v=1&m=2",
      "/station/write",
    ]) {
      expect(runs(path), path).toBe(false);
    }
    expect(runs("/orders/prep")).toBe(true);
    expect(runs("/chat-sync")).toBe(false);
    const privateBlock = /export const PRIVATE = \[([\s\S]*?)\];/.exec(
      source,
    )?.[1];
    expect(privateBlock).toBeDefined();
    expect(privateBlock).not.toContain('"/station');
  });

  it("guards the admin console", () => {
    expect(source).toContain(`"/admin",`);
    expect(source).toContain(`"/admin/:path*"`);
  });

  it("leaves chat's sync out, as the push routes are", () => {
    // /chat-sync is asked every few seconds while a chat is on screen: in the
    // matcher, each ask would run the proxy too. It renews the session itself
    // and answers a signed-out caller 401, never a redirect.
    // Every path proxy.ts lists, in PRIVATE and in the matcher.
    const listed = [...source.matchAll(/^\s+"(\/[^"]*)",$/gm)].map(
      ([, pattern = ""]) => pattern,
    );
    expect(listed).toContain("/chat/:path*");
    // Each entry as Next.js reads it: a literal path, or one with
    // `/:path*`, which is the path itself or anything under it.
    const matches = (pattern: string, path: string) =>
      pattern.endsWith("/:path*")
        ? path === pattern.slice(0, -"/:path*".length) ||
          path.startsWith(pattern.slice(0, -":path*".length))
        : path === pattern;
    // The mode's sync and send (P4) too: asked every 15 seconds, and sent
    // with keepalive; each answers a signed-out caller 401.
    for (const path of [
      "/chat-sync",
      "/chat-sync/x",
      "/push/inbox",
      "/orders-sync",
      "/orders-send",
    ]) {
      expect(listed.filter((pattern) => matches(pattern, path))).toEqual([]);
    }
    expect(listed.some((pattern) => matches(pattern, "/chat"))).toBe(true);
    expect(listed.some((pattern) => matches(pattern, "/chat/x"))).toBe(true);
    expect(
      listed.some((pattern) => matches(pattern, "/chat-files/a/b/c.webp")),
    ).toBe(true);
    expect(
      listed.some((pattern) => matches(pattern, "/document-files/a/b")),
    ).toBe(true);
    expect(
      listed.some((pattern) => matches(pattern, "/document-files/download")),
    ).toBe(true);
    expect(source).not.toContain('"/chat-sync');
    expect(source).not.toContain('"/orders-s');
    expect(listed.some((pattern) => matches(pattern, "/orders/mine"))).toBe(
      true,
    );
  });

  it("leaves the health check out", () => {
    // /health is for an uptime monitor (app/health/route.ts): no session
    // read or renewed, no cookie set, never a redirect.
    const block = /matcher: \[([\s\S]*?)\],/.exec(source)?.[1] ?? "";
    const matcher = [...block.matchAll(/^\s+"([^"]+)",$/gm)].map(
      ([, pattern = ""]) => pattern,
    );
    for (const path of ["/health", "/health/"]) {
      expect(
        unstable_doesMiddlewareMatch({ config: { matcher }, url: path }),
        path,
      ).toBe(false);
    }
    const privateBlock =
      /export const PRIVATE = \[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
    expect(privateBlock).not.toContain('"/health');
    expect(source).not.toContain('"/health');
  });
});
