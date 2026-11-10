import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { manifestFor } from "../modules/registry";

// The money estimate is on in the demo businesses at once, and in a real
// business only once an accountant confirms the engine's readings (Orel, 10
// November 2026): a team-level setting, off by default. The demo definitions
// switch it on, in the local seed and the hosted twin alike, and no template
// does, so no real business starts with it.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

type Definition = {
  slug: string;
  settings?: { time_clock?: { payEstimate?: unknown } };
};

const definitions = (path: string): Definition[] =>
  [...read(path).matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
    ([, json = "{}"]) => JSON.parse(json) as Definition,
  );

describe("the pay estimate", () => {
  it("is off unless switched on", () => {
    expect(manifestFor("time_clock").settings.parse({}).payEstimate).toBe(
      false,
    );
  });

  for (const path of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
    it(`is on in every demo business of ${path}`, () => {
      const found = definitions(path);
      expect(found.length).toBe(2);
      for (const definition of found) {
        expect(
          definition.settings?.time_clock?.payEstimate,
          definition.slug,
        ).toBe(true);
      }
    });
  }

  it("is switched on by no migration but the one for the demo", () => {
    const dir = "supabase/migrations";
    const naming = readdirSync(join(root, dir))
      .filter((file) => read(`${dir}/${file}`).includes("payEstimate"))
      .sort();
    expect(naming).toEqual(["20261110000700_pay_rules.sql"]);
  });
});
