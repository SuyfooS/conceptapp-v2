import { choiceNames, orderedPicks, picksAgorot } from "@domain/order-screens";
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
 * the local database (`pnpm db:start`); run with `pnpm test:db`. The JSON
 * goes as text (`::text::jsonb`): a parameter typed jsonb, postgres.js would
 * encode the string again, and SQL would get a JSON string, not the groups.
 * Since P6 it asks the same of the five items the seed gives choices, and
 * sends a round of them as the owner (rolled back), whose lines freeze the
 * choices in the item's order at the price the screens showed.
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
          ${price}::integer,
          ${JSON.stringify(groups)}::text::jsonb,
          ${JSON.stringify(pick)}::text::jsonb
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

// The demo restaurant's choices as its seed writes them since P6
// (20261123000100_order_taking_choices.sql), with the picks a waiter makes
// and those the send refuses.
const pick = (group: string, option: string): ChoicePick => ({
  group,
  option,
});
const SEEDED: Record<string, ChoicePick[][]> = {
  שניצל: [
    [pick("side", "fries")],
    [],
    [pick("side", "fries"), pick("side", "mash")],
  ],
  המבורגר: [
    [],
    [pick("doneness", "m")],
    [pick("doneness", "m"), pick("extras", "cheese")],
    [pick("extras", "cheese"), pick("doneness", "m")],
    [pick("doneness", "m"), pick("doneness", "wd")],
    [pick("doneness", "wd"), pick("extras", "egg"), pick("extras", "cheese")],
    [pick("doneness", "m"), pick("extras", "egg"), pick("extras", "egg")],
    [pick("doneness", "m"), pick("extras", "bacon")],
  ],
  קפה: [
    [pick("size", "regular")],
    [pick("size", "large")],
    [],
    [pick("size", "regular"), pick("size", "large")],
  ],
  "בירה מהחבית": [
    [pick("beer-size", "third")],
    [pick("beer-size", "half")],
    [],
  ],
  "סלט ירוק": [
    [],
    [pick("extras", "feta")],
    [pick("extras", "feta"), pick("extras", "egg")],
    [pick("extras", "egg"), pick("extras", "feta")],
  ],
};

class Rollback extends Error {}

/** The local seed's demo restaurant's owner (supabase/seed.sql). */
const OWNER = "00000000-0000-4000-a000-000000000001";
const ROUND_KEY = "e9000000-0000-4000-8000-0000000000d1";

type Seeded = { id: string; name: string; price: number; groups: unknown };

describe("a line's unit price with its choices, checked against the SQL's", () => {
  it("is the seeded items' and their picks' in the database as on the screens", async () => {
    const rows = await sql<Seeded[]>`
      select i.id, i.name, i.price_agorot as price, i.option_groups as groups
      from public.menu_items i
      where i.business_id = ${DEMO_RESTAURANT} and i.archived_at is null
        and i.name in ${sql(Object.keys(SEEDED))}`;
    expect(rows.map((row) => row.name).sort()).toEqual(
      Object.keys(SEEDED).sort(),
    );
    let fits = 0;
    for (const row of rows) {
      const item = {
        priceAgorot: row.price,
        optionGroups: optionGroups.parse(row.groups),
      };
      for (const picks of SEEDED[row.name] ?? []) {
        const [read] = await sql<{ agorot: number | null }[]>`
          select private.unit_agorot(
            ${row.price}::integer,
            ${JSON.stringify(item.optionGroups)}::text::jsonb,
            ${JSON.stringify(picks)}::text::jsonb
          ) as agorot`;
        const unit = unitAgorot(item, picks);
        expect(read?.agorot, `${row.name} ${JSON.stringify(picks)}`).toBe(unit);
        if (unit !== null) {
          fits += 1;
          // What the sheet shows while picking is the same once they fit.
          expect(picksAgorot(item, picks)).toBe(unit);
        }
      }
    }
    // Some fit and some don't, so both sides are asked.
    expect(fits).toBe(13);
  });

  it("freezes each line's choices in the item's order, at the price the screens showed", async () => {
    await sql
      .begin(async (tx) => {
        const items = await tx<Seeded[]>`
          select i.id, i.name, i.price_agorot as price, i.option_groups as groups
          from public.menu_items i
          where i.business_id = ${DEMO_RESTAURANT} and i.archived_at is null
            and i.name in ${tx(Object.keys(SEEDED))}`;
        const item = (name: string) => {
          const row = items.find((i) => i.name === name);
          return {
            id: row?.id ?? "",
            name,
            priceAgorot: row?.price ?? 0,
            optionGroups: optionGroups.parse(row?.groups ?? []),
          };
        };
        const [table] = await tx<{ id: string }[]>`
          select p.id from public.order_places p
          where p.business_id = ${DEMO_RESTAURANT} and p.name = '9'
            and p.archived_at is null`;
        const burger = item("המבורגר");
        const beer = item("בירה מהחבית");
        const salad = item("סלט ירוק");
        // The extras picked first: the send keeps them in the item's order.
        const sent = [
          {
            item: burger,
            picks: [pick("extras", "cheese"), pick("doneness", "m")],
          },
          { item: burger, picks: [pick("doneness", "wd")] },
          { item: beer, picks: [pick("beer-size", "half")] },
          {
            item: salad,
            picks: [pick("extras", "egg"), pick("extras", "feta")],
          },
        ];
        const round = sent.map((line) => ({
          item: line.item.id,
          quantity: 1,
          choices: line.picks,
        }));
        await tx`
          select public.send_order_round(
            ${OWNER}::uuid,
            ${DEMO_RESTAURANT}::uuid,
            ${ROUND_KEY}::uuid,
            ${JSON.stringify({ place: table?.id })}::text::jsonb,
            ${JSON.stringify(round)}::text::jsonb
          )`;
        const lines = await tx<
          {
            name: string;
            unit: number;
            choices: { group: string; optionName: string }[];
          }[]
        >`
          select l.name, l.unit_agorot as unit, l.choices
          from public.order_lines l
          join public.order_tickets t on t.id = l.ticket_id
          where t.round_id = ${ROUND_KEY}`;
        const read = lines
          .map((line) =>
            JSON.stringify([
              line.name,
              line.unit,
              line.choices.map((choice) => choice.optionName),
              line.choices.map((choice) => choice.group),
            ]),
          )
          .sort();
        const shown = sent
          .map(({ item: chosen, picks }) => {
            const ordered = orderedPicks(chosen, picks);
            return JSON.stringify([
              chosen.name,
              unitAgorot(chosen, picks),
              choiceNames(chosen, ordered),
              ordered.map((p) => p.group),
            ]);
          })
          .sort();
        expect(read).toEqual(shown);
        // The burger with its cheese: 74.00, "מדיום" before "גבינה".
        expect(shown).toContain(
          JSON.stringify([
            "המבורגר",
            7400,
            ["מדיום", "גבינה"],
            ["doneness", "extras"],
          ]),
        );
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
