import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ChoicePick,
  checkPicks,
  type OptionGroup,
  optionGroups,
  unitAgorot,
} from "@domain/order-taking";
import { describe, expect, it } from "vitest";
import { orderDemoMenu } from "../app/design/order-taking/data";
import { twinMenu } from "../app/design/order-taking/real-menu";

// The demo restaurant's choices (waiter mode P6) are written twice: in the
// sample menu's seed (private.seed_demo_order_taking, newest migration
// wins) and in the twins' menu (app/design/order-taking/data.ts). This holds
// the two the same, group for group and id for id, so what Orel taps
// through at /design is what the demo restaurant has; and the sample
// orders' sizes (private.seed_demo_orders) fit the seed's groups, at the
// prices the orders had before.

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();

/** The newest body of a function, from the newest migration that writes it. */
function newestBody(name: string): string {
  const pattern = new RegExp(`function ${name.replace(".", "\\.")}\\(`);
  const newest = migrations
    .filter((file) => pattern.test(read(`supabase/migrations/${file}`)))
    .at(-1);
  if (!newest) throw new Error(`No migration writes ${name}`);
  const sql = read(`supabase/migrations/${newest}`);
  // Its definition, not the grants after it.
  const start = sql.lastIndexOf(`function ${name}(business`);
  return sql.slice(start, sql.indexOf("\n$$;", start));
}

/** A SQL string literal's text, its doubled apostrophes one again. */
const text = (literal: string) => literal.replaceAll("''", "'");

/** Each item the seed inserts with its groups, by name. */
function seededGroups(): Map<string, unknown> {
  const body = newestBody("private.seed_demo_order_taking");
  const rows = new Map<string, unknown>();
  for (const [, name = "", json = ""] of body.matchAll(
    /\(business, \w+, '((?:[^']|'')*)', \d+, \d+, '((?:[^']|'')*)'::jsonb\)/g,
  )) {
    rows.set(text(name), JSON.parse(text(json)));
  }
  return rows;
}

const seeded = seededGroups();
const twin = new Map(
  twinMenu({ menu: orderDemoMenu, soldOut: [] }, 1).items.map((item) => [
    item.name,
    item,
  ]),
);

describe("the demo restaurant's choices", () => {
  it("are read from the seed, an item each, every one as the database takes it", () => {
    // Twelve items in one insert; the fish of the day, sold out, on its own.
    expect(seeded.size).toBe(12);
    for (const [name, groups] of seeded) {
      expect(optionGroups.safeParse(groups).success, name).toBe(true);
    }
    expect(
      [...seeded].filter(([, groups]) => (groups as unknown[]).length > 0),
    ).toHaveLength(5);
  });

  it("are the twins' own, group for group and id for id", () => {
    for (const [name, groups] of seeded) {
      const item = twin.get(name);
      expect(item, name).toBeDefined();
      expect(item?.optionGroups, name).toEqual(groups);
    }
    // And no item of the twins has choices the seed doesn't.
    for (const [name, item] of twin) {
      if (item.optionGroups.length === 0) continue;
      expect(seeded.get(name), name).toEqual(item.optionGroups);
    }
  });

  it("fit the sample orders' sizes, at the prices those orders had", () => {
    const body = newestBody("private.seed_demo_orders");
    const picks = (name: string): ChoicePick[] => {
      const found = new RegExp(`${name} jsonb := '([^']*)'::jsonb`).exec(body);
      expect(found, name).not.toBeNull();
      return JSON.parse(found?.[1] ?? "[]") as ChoicePick[];
    };
    const at = (name: string) => ({
      priceAgorot: twin.get(name)?.priceAgorot ?? 0,
      optionGroups: seeded.get(name) as OptionGroup[],
    });
    const beer = at("בירה מהחבית");
    const coffee = at("קפה");
    expect(checkPicks(beer.optionGroups, picks("beer_picks"))).toEqual({
      ok: true,
    });
    expect(checkPicks(coffee.optionGroups, picks("coffee_picks"))).toEqual({
      ok: true,
    });
    // demo_reset.test.sql's units: 28.00 for a beer, 12.00 for a coffee.
    expect(unitAgorot(beer, picks("beer_picks"))).toBe(2800);
    expect(unitAgorot(coffee, picks("coffee_picks"))).toBe(1200);
  });
});
