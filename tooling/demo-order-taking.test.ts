import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Taking orders opens on for the demo restaurant, locally for the browser
// tests and in the hosted demo since Orel approved the screens on 21 November
// 2026 (his decision of 20 November said: off until he does). The shop, and
// every other business, keeps it off. The definition's
// flag is what switches it on at every reset (private.seed_demo_order_taking,
// since 20261120000100_order_taking_screens.sql; the newest migration that
// writes it is read).
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

  it("is on in the hosted demo's restaurant, and only it", () => {
    const found = definitions("supabase/hosted-demo.sql");
    expect(found.length).toBe(2);
    expect(
      found.map((definition) => [definition.slug, definition.orderTaking]),
    ).toEqual([
      ["demo-restaurant", true],
      ["demo-shop", undefined],
    ]);
  });

  it("starts the hosted restaurant again while its module is still off", () => {
    const sql = read("supabase/hosted-demo.sql");
    expect(sql).toContain("d.definition -> 'orderTaking' = 'true'::jsonb");
    expect(sql).toMatch(
      /and not exists \(\s*select 1 from public\.business_modules bm[\s\S]*?and bm\.enabled\s*\)/,
    );
  });

  it("is switched on by the definition's flag at every reset", () => {
    const newest = readdirSync(join(root, "supabase/migrations"))
      .filter((file) =>
        /function private\.seed_demo_order_taking\(/.test(
          read(`supabase/migrations/${file}`),
        ),
      )
      .sort()
      .at(-1);
    expect(newest).toBeDefined();
    const sql = read(`supabase/migrations/${newest}`);
    const start = sql.lastIndexOf(
      "function private.seed_demo_order_taking(business",
    );
    const body = sql.slice(start, sql.indexOf("\n$$;", start));
    expect(body).toContain("d.definition -> 'orderTaking' = 'true'::jsonb");
  });
});
