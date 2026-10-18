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
});
