import {
  type OrderTill,
  orderDetailSchema,
  orderTill,
  orderTillSchema,
  type TillLine,
} from "@domain/orders";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The till's list is drawn on the phones from the order whole (`orderTill`
 * in @domain/orders, waiter mode P5), so it stays current with the mode's
 * sync, and on the till's station from `public.order_till` (P8). pgTAP can't
 * read TypeScript, so this sends a round to the demo restaurant's table 9
 * as its owner (two lemonades in two lines, a half beer, a hummus, and since
 * P6 three burgers: two with the same choices picked in other orders, which
 * the till rings up as one row, and one with others), cancels a
 * lemonade and gives the beer on the house, and reads both answers for it
 * and for the seed's tables 4 and 7, signed in as the owner, in a
 * transaction rolled back. The rows are the same; only their order inside
 * a round may differ when departments interleave (tickets one after
 * another here, lines by position there), so each list is compared sorted.
 * Needs the local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

/** The local seed's demo restaurant and its owner (supabase/seed.sql). */
const DEMO_RESTAURANT = "00000000-0000-4000-b000-000000000001";
const OWNER = "00000000-0000-4000-a000-000000000001";
const ROUND_KEY = "e7000000-0000-4000-8000-000000000001";

const keyOf = (line: TillLine) =>
  JSON.stringify([line.name, line.choices, line.unitAgorot, line.comped]);
const sorted = (lines: readonly TillLine[]) =>
  [...lines].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
/** A till with every list in one order, to hold two alike as sets of rows. */
const settled = (till: OrderTill) => ({
  ...till,
  byItem: sorted(till.byItem),
  byRound: till.byRound.map((round) => ({
    ...round,
    lines: sorted(round.lines),
  })),
});

describe("the till's list", () => {
  it("is the same from the order whole as public.order_till gives it", async () => {
    await sql
      .begin(async (tx) => {
        const item = async (name: string) => {
          const [row] = await tx<{ id: string }[]>`
            select i.id from public.menu_items i
            where i.business_id = ${DEMO_RESTAURANT} and i.name = ${name}
              and i.archived_at is null`;
          return row?.id ?? "";
        };
        const [table] = await tx<{ id: string }[]>`
          select p.id from public.order_places p
          where p.business_id = ${DEMO_RESTAURANT} and p.name = '9'
            and p.archived_at is null`;
        const lemonade = await item("לימונדה");
        const burger = await item("המבורגר");
        const lines = [
          { item: lemonade, quantity: 1 },
          { item: lemonade, quantity: 1 },
          // The beer has a size to choose since P6.
          {
            item: await item("בירה מהחבית"),
            quantity: 2,
            choices: [{ group: "beer-size", option: "half" }],
          },
          { item: await item("חומוס"), quantity: 1 },
          {
            item: burger,
            quantity: 1,
            choices: [
              { group: "extras", option: "cheese" },
              { group: "doneness", option: "m" },
            ],
          },
          {
            item: burger,
            quantity: 1,
            choices: [
              { group: "doneness", option: "m" },
              { group: "extras", option: "cheese" },
            ],
          },
          {
            item: burger,
            quantity: 1,
            choices: [{ group: "doneness", option: "wd" }],
          },
        ];
        const [sent] = await tx<{ round: { order: string } }[]>`
          select public.send_order_round(
            ${OWNER}::uuid,
            ${DEMO_RESTAURANT}::uuid,
            ${ROUND_KEY}::uuid,
            ${JSON.stringify({ place: table?.id })}::text::jsonb,
            ${JSON.stringify(lines)}::text::jsonb
          ) as round`;
        const order = sent?.round.order ?? "";
        const fixed = await tx<{ id: string; name: string }[]>`
          select l.id, l.name
          from public.order_lines l
          join public.order_tickets t on t.id = l.ticket_id
          where t.order_id = ${order}
          order by l.position`;
        const first = (name: string) =>
          fixed.find((line) => line.name === name)?.id ?? "";
        await tx`select public.cancel_order_line(${OWNER}::uuid, ${first("לימונדה")}::uuid, 'guest')`;
        await tx`select public.comp_order_line(${OWNER}::uuid, ${first("בירה מהחבית")}::uuid, 'make_good')`;
        const orders = await tx<{ id: string }[]>`
          select o.id from public.orders o
          join public.order_places p on p.id = o.place_id
          where o.business_id = ${DEMO_RESTAURANT} and o.status = 'open'
            and p.name in ('4', '7', '9')`;
        expect(orders.length).toBe(3);

        // Signed in as the owner, as the screens read.
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: OWNER, role: "authenticated" })}, true)`;
        await tx`select set_config('role', 'authenticated', true)`;
        for (const { id } of orders) {
          const [read] = await tx<{ detail: unknown; till: unknown }[]>`
            select public.order_detail(${id}::uuid) as detail,
              public.order_till(${id}::uuid) as till`;
          const fromDetail = orderTill(orderDetailSchema.parse(read?.detail));
          const fromTill = orderTillSchema.parse(read?.till);
          expect(settled(fromDetail), id).toEqual(settled(fromTill));
          if (id === order) {
            // Table 9: one lemonade left, the beer marked, nothing summed;
            // the burgers of the same choices one row, the other its own.
            const rows = (list: [string, string, number, number, boolean][]) =>
              list.map((row) => JSON.stringify(row)).sort();
            expect(
              rows(
                fromDetail.byItem.map((l) => [
                  l.name,
                  l.choices.join(" · "),
                  l.quantity,
                  l.unitAgorot,
                  l.comped,
                ]),
              ),
            ).toEqual(
              rows([
                ["לימונדה", "", 1, 1600, false],
                ["בירה מהחבית", "חצי", 2, 3600, true],
                ["חומוס", "", 1, 3200, false],
                ["המבורגר", "מדיום · גבינה", 2, 7400, false],
                ["המבורגר", "וול דאן", 1, 6800, false],
              ]),
            );
          }
        }
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
