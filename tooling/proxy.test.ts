import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("guards the profile", () => {
    expect(source).toContain('"/me",');
    expect(source).toContain('"/me/:path*"');
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

  it("guards every module screen", () => {
    for (const m of manifests) {
      if (!m.nav) continue;
      expect(source).toContain(`"${m.nav.href}",`);
      expect(source).toContain(`"${m.nav.href}/:path*"`);
    }
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
    for (const path of ["/chat-sync", "/chat-sync/x", "/push/inbox"]) {
      expect(listed.filter((pattern) => matches(pattern, path))).toEqual([]);
    }
    expect(listed.some((pattern) => matches(pattern, "/chat"))).toBe(true);
    expect(listed.some((pattern) => matches(pattern, "/chat/x"))).toBe(true);
    expect(
      listed.some((pattern) => matches(pattern, "/chat-files/a/b/c.webp")),
    ).toBe(true);
    expect(source).not.toContain('"/chat-sync');
  });
});
