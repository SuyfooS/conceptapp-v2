import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A demo business lets its people set a photo (and, from H2, write about
// themselves) only when its definition says `"profiles": true`
// (supabase/migrations/20261109000100_profile_photo_demo.sql). The local seed
// opens its restaurant for the browser tests and keeps the shop closed, so
// the refusal is tested too; the hosted ones must stay closed, since anyone
// at the demo door is any of their people and the next visitor would see it.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("demo businesses and profiles", () => {
  it("never opens a hosted demo business to profile changes", () => {
    expect(read("supabase/hosted-demo.sql")).not.toMatch(/"profiles"/);
  });

  it("opens only the local seed's restaurant, for the browser tests", () => {
    const seed = read("supabase/seed.sql");
    // Each definition's line: `…, "invites": true, "profiles": true,`.
    expect(seed.match(/"invites": true, "profiles": true,/g)).toHaveLength(1);
    expect(
      seed.match(/"template": "restaurant", [^\n]*"profiles": true,/g),
    ).toHaveLength(1);
  });
});
