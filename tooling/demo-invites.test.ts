import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A demo business takes invites only when its definition says
// `"invites": true` (supabase/migrations/20261108000300_sealed.sql). The local
// seed opens its demo businesses for the browser tests; the hosted ones must
// stay closed, since anyone at the demo door is their owner.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("demo businesses and invites", () => {
  it("never opens a hosted demo business to invites", () => {
    expect(read("supabase/hosted-demo.sql")).not.toMatch(/"invites"/);
  });

  it("opens the local seed's demo businesses, for the browser tests", () => {
    // Each definition: `"renews": …, "invites": true`.
    expect(
      read("supabase/seed.sql").match(
        /"renews": (?:true|false), "invites": true,/g,
      ),
    ).toHaveLength(2);
  });
});
