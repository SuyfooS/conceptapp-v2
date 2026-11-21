import { createHash } from "node:crypto";
import {
  stationMenuSchema,
  stationPrepSchema,
  stationTillSchema,
} from "@domain/order-stations";
import { orderTillSchema, type TillLine } from "@domain/orders";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The kitchen's screen and the till (waiter mode P8a) read by their secret
 * (`public.station_order_prep`, `station_order_menu`, `station_order_till`)
 * answer in the shapes @domain/order-stations reads, strictly, so no price,
 * label or person reaches them; and the till's lists are `public.order_till`'s
 * but for who sent each round. pgTAP can't read TypeScript, so this locks a
 * kitchen's screen and a till of the local seed's demo restaurant as its
 * owner, reads all three, and reads `order_till` signed in as the owner, in
 * a transaction rolled back. Needs the local database (`pnpm db:start`); run
 * with `pnpm test:db`.
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

const hash = (key: string) =>
  createHash("sha256").update(key, "utf8").digest("hex");

const keyOf = (line: TillLine) =>
  JSON.stringify([line.name, line.choices, line.unitAgorot, line.comped]);
const sorted = (lines: readonly TillLine[]) =>
  [...lines].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));

describe("the stations' reads", () => {
  it("parse strictly, and the till's lists are order_till's but for the senders", async () => {
    await sql
      .begin(async (tx) => {
        const lock = async (key: string, shows: "prep" | "till") => {
          await tx`select public.start_station_pairing(
            ${hash(`${key}-p`)}, ${hash(`${key}-s`)}, ${hash(key)})`;
          await tx`select public.lock_order_station(
            ${OWNER}::uuid, ${DEMO_RESTAURANT}::uuid, ${key}, ${shows},
            null, ${hash(`${key}-p`)})`;
        };
        await lock("stations-db-kitchen", "prep");
        await lock("stations-db-till", "till");

        const [read] = await tx<
          { prep: unknown; menu: unknown; till: unknown }[]
        >`
          select public.station_order_prep(${hash("stations-db-kitchen")}) as prep,
            public.station_order_menu(${hash("stations-db-kitchen")}) as menu,
            public.station_order_till(${hash("stations-db-till")}) as till`;
        const prep = stationPrepSchema.parse(read?.prep);
        const menu = stationMenuSchema.parse(read?.menu);
        const till = stationTillSchema.parse(read?.till);
        expect(prep.tickets.length).toBeGreaterThan(0);
        expect(menu.items.length).toBeGreaterThan(0);
        expect(till.orders.length).toBeGreaterThan(0);

        // Signed in as the owner, as the phones read the till.
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: OWNER, role: "authenticated" })}, true)`;
        await tx`select set_config('role', 'authenticated', true)`;
        for (const order of till.orders) {
          const [row] = await tx<{ till: unknown }[]>`
            select public.order_till(${order.id}::uuid) as till`;
          const phone = orderTillSchema.parse(row?.till);
          expect(sorted(order.byItem), order.id).toEqual(sorted(phone.byItem));
          expect(
            order.byRound.map((round) => ({
              ...round,
              lines: sorted(round.lines),
            })),
            order.id,
          ).toEqual(
            phone.byRound.map(({ sentBy: _sentBy, ...round }) => ({
              ...round,
              lines: sorted(round.lines),
            })),
          );
        }
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
