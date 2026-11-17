import {
  type ChoicePick,
  type OptionGroup,
  optionGroups,
  unitAgorot,
} from "@domain/order-taking";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A line's unit price is one number in the database (`private.unit_agorot`,
 * which the orders' send will freeze on each line) and on the screens
 * (`unitAgorot` in @domain/order-taking). pgTAP can't read TypeScript, so
 * this asks SQL for the demo restaurant's schnitzel, as its seed writes it
 * (supabase/migrations/20261117000500_order_taking_menu.sql), with the
 * choices a later phase gives it, for every kind of pick: fitting, a
 * required group left out, too many, one twice, one it doesn't have. Needs
 * the local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

/** The local seed's demo restaurant (supabase/seed.sql). */
const DEMO_RESTAURANT = "00000000-0000-4000-b000-000000000001";

const groups: OptionGroup[] = [
  {
    id: "side",
    name: "תוספת",
    min: 1,
    max: 1,
    options: [
      { id: "fries", name: "צ'יפס", priceAgorot: 0 },
      { id: "mash", name: "פירה", priceAgorot: 0 },
      { id: "salad", name: "סלט", priceAgorot: 500 },
    ],
  },
  {
    id: "extras",
    name: "תוספות",
    min: 0,
    max: 2,
    options: [
      { id: "egg", name: "ביצה", priceAgorot: 600 },
      { id: "cheese", name: "גבינה", priceAgorot: 600 },
      { id: "sauce", name: "רוטב", priceAgorot: 250 },
    ],
  },
];

const picks: ChoicePick[][] = [
  [{ group: "side", option: "fries" }],
  [{ group: "side", option: "salad" }],
  [
    { group: "side", option: "salad" },
    { group: "extras", option: "egg" },
    { group: "extras", option: "sauce" },
  ],
  [],
  [{ group: "extras", option: "egg" }],
  [
    { group: "side", option: "fries" },
    { group: "side", option: "mash" },
  ],
  [
    { group: "side", option: "mash" },
    { group: "extras", option: "egg" },
    { group: "extras", option: "cheese" },
    { group: "extras", option: "sauce" },
  ],
  [
    { group: "side", option: "mash" },
    { group: "extras", option: "egg" },
    { group: "extras", option: "egg" },
  ],
  [{ group: "side", option: "rice" }],
  [{ group: "drink", option: "cola" }],
];

describe("a line's unit price", () => {
  it("is the demo's schnitzel and its picks in the database as on the screens", async () => {
    expect(optionGroups.safeParse(groups).success).toBe(true);
    const [item] = await sql<{ price: number }[]>`
      select i.price_agorot as price
      from public.menu_items i
      where i.business_id = ${DEMO_RESTAURANT} and i.name = 'שניצל'`;
    expect(item?.price).toBe(6200);
    const price = item?.price ?? 0;
    for (const pick of picks) {
      const [row] = await sql<{ agorot: number | null }[]>`
        select private.unit_agorot(
          ${price}::integer, ${JSON.stringify(groups)}::jsonb, ${JSON.stringify(pick)}::jsonb
        ) as agorot`;
      expect(row?.agorot, JSON.stringify(pick)).toBe(
        unitAgorot({ priceAgorot: price, optionGroups: groups }, pick),
      );
    }
    // Some fit and some don't, so both sides are asked.
    expect(
      picks.map((pick) =>
        unitAgorot({ priceAgorot: price, optionGroups: groups }, pick),
      ),
    ).toEqual([6200, 6700, 7550, null, null, null, null, null, null, null]);
  });
});
