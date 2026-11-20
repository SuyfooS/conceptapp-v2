import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Taking orders opens on for the local seed's demo restaurant, for the browser
// tests of the menu's screens, and stays off in the hosted demo until Orel
// approves the screens (his decision of 20 November 2026). The definition's
// flag is what switches it on at every reset
// (private.seed_demo_order_taking, 20261120000100_order_taking_screens.sql).
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

type Definition = { slug: string; template: string; orderTaking?: unknown };

const definitions = (path: string): Definition[] =>
  [...read(path).matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
    ([, json = "{}"]) => JSON.parse(json) as Definition,
  );

describe("taking orders in the demo", () => {
  it("is on for the local seed's restaurant, and only it", () => {
    const found = definitions("supabase/seed.sql");
    expect(found.length).toBe(2);
    expect(
      found.map((definition) => [definition.slug, definition.orderTaking]),
    ).toEqual([
      ["demo-restaurant", true],
      ["demo-shop", undefined],
    ]);
  });

  it("is off in the hosted demo until Orel approves the screens", () => {
    const found = definitions("supabase/hosted-demo.sql");
    expect(found.length).toBe(2);
    for (const definition of found) {
      expect(definition.orderTaking, definition.slug).toBeUndefined();
    }
    expect(read("supabase/hosted-demo.sql")).not.toContain("orderTaking");
  });

  it("is switched on by the definition's flag at every reset", () => {
    const sql = read(
      "supabase/migrations/20261120000100_order_taking_screens.sql",
    );
    expect(sql).toContain("d.definition -> 'orderTaking' = 'true'::jsonb");
  });
});
