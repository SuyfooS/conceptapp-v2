import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_PEOPLE, demoEmailOf } from "@domain/passive-sign-in";
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
  it("has an account for every person at the door, locally and hosted", () => {
    for (const file of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
      const sql = read(file);
      for (const person of DEMO_PEOPLE) {
        expect(sql, `${person} in ${file}`).toContain(
          `'${demoEmailOf(person)}'`,
        );
      }
    }
  });

  it("puts each accountant in no department: they are off the staff", () => {
    for (const file of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
      const accountants = read(file)
        .split(/\r?\n/)
        .filter((line) => line.includes('"role": "accountant"'));
      expect(accountants.length, file).toBeGreaterThan(0);
      for (const line of accountants) expect(line).not.toMatch(/"departments"/);
    }
  });

  // One login in two businesses (payroll P3b): the door offers Galit in both,
  // and each business's reset puts her back in it.
  it("has one accountant in both demo businesses, locally and hosted", () => {
    for (const file of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
      const accountants = read(file)
        .split(/\r?\n/)
        .filter((line) => line.includes('"role": "accountant"'));
      expect(accountants, file).toHaveLength(2);
      const ids = accountants.map((line) => /"user_id": "([^"]+)"/.exec(line));
      expect(new Set(ids.map((id) => id?.[1])).size, file).toBe(1);
    }
  });

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
