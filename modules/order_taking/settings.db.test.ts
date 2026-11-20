import { readModuleSettings } from "@domain/modules";
import { orderDay } from "@domain/orders";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifest } from "./manifest";

/**
 * Taking orders' settings as the database reads them
 * (supabase/migrations/20261120000200_order_taking_takers.sql):
 * private.order_taking_settings defaults as the manifest does, and each
 * typed reader takes a stored value the manifest wouldn't as its default,
 * field by field, as readModuleSettings does; and the business day turns
 * where @domain/orders says it does. pgTAP can't read the manifest, so this
 * asks SQL. Needs the local database (`pnpm db:start`); run with
 * `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

/** Runs `check` against a business of its own, in a transaction rolled back. */
async function withBusiness(
  slug: string,
  check: (tx: postgres.TransactionSql, id: string) => Promise<void>,
) {
  await sql
    .begin(async (tx) => {
      const [business] = await tx<{ id: string }[]>`
        insert into public.businesses (slug, name, timezone)
        values (${slug}, ${slug}, 'Asia/Jerusalem')
        returning id`;
      const id = business?.id ?? "";
      await tx`
        insert into public.business_modules (business_id, module_key, enabled, settings)
        values (${id}, 'order_taking', false, '{}')`;
      await check(tx, id);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

async function store(tx: postgres.TransactionSql, id: string, json: string) {
  await tx`
    update public.business_modules bm
    set settings = ${json}::text::jsonb
    where bm.business_id = ${id} and bm.module_key = 'order_taking'`;
}

describe("taking orders' settings", () => {
  it("default in the database as in the manifest", async () => {
    // An id no business has: no settings at all.
    const [row] = await sql<{ settings: unknown }[]>`
      select private.order_taking_settings(gen_random_uuid()) as settings`;
    expect(row?.settings).toEqual(manifest.settings.parse({}));
  });

  it("let what a business set win, field by field", async () => {
    await withBusiness("order-settings-check", async (tx, id) => {
      await store(tx, id, '{"lateAfterMinutes": 30, "takeBackMinutes": 5}');
      const [row] = await tx<{ settings: unknown }[]>`
        select private.order_taking_settings(${id}) as settings`;
      expect(row?.settings).toEqual({
        ...manifest.settings.parse({}),
        lateAfterMinutes: 30,
        takeBackMinutes: 5,
      });
    });
  });

  it("read each field as readModuleSettings reads it, anything not offered as the default", async () => {
    // Each stored as JSON text, so the database reads it as it is (2.0
    // stays a number, "2" text).
    const cases: Record<string, string[]> = {
      takeBackMinutes: ["0", "2", "5", "2.0", "5.0", '"2"', "3", "null", "[2]"],
      takerDepartments: [
        '["floor", "bar"]',
        '["floor", "floor"]',
        '["Bad"]',
        JSON.stringify(Array.from({ length: 31 }, (_, n) => `d${n}`)),
        JSON.stringify(Array.from({ length: 30 }, (_, n) => `d${n}`)),
        '"floor"',
        "[]",
        "[1]",
      ],
      dayEndsAt: ['"04:30"', '"00:00"', '"24:00"', '"4:30"', "5", "null"],
      onlyOnTheClock: ["false", "true", '"false"', "0", "null"],
    };
    await withBusiness("order-settings-fields", async (tx, id) => {
      for (const [field, values] of Object.entries(cases)) {
        for (const value of [undefined, ...values]) {
          const json = value === undefined ? "{}" : `{"${field}": ${value}}`;
          await store(tx, id, json);
          const [row] = await tx<
            {
              take_back: number;
              takers: string[];
              day_ends: number;
              clock_rule: boolean;
            }[]
          >`
            select
              (extract(epoch from private.order_take_back(${id})) / 60)::integer as take_back,
              private.order_taker_keys(${id}) as takers,
              (extract(epoch from private.order_day_ends(${id})) / 60)::integer as day_ends,
              private.order_clock_rule(${id}) as clock_rule`;
          const read = readModuleSettings(manifest, JSON.parse(json));
          const [hours = 0, minutes = 0] = read.dayEndsAt
            .split(":")
            .map(Number);
          expect(row?.take_back, json).toBe(read.takeBackMinutes);
          expect(row?.takers, json).toEqual(read.takerDepartments);
          expect(row?.day_ends, json).toBe(hours * 60 + minutes);
          expect(row?.clock_rule, json).toBe(read.onlyOnTheClock);
        }
      }
    });
  });

  it("turn the business day where @domain/orders turns it, by the wall clock", async () => {
    // Around midnight and 05:00 local, and both changes of the clocks in
    // 2026 (27 March, 02:00 to 03:00; 25 October, 02:00 to 01:00).
    const instants = [
      "2026-11-20T21:59:00Z",
      "2026-11-20T22:00:00Z",
      "2026-11-21T02:59:00Z",
      "2026-11-21T03:00:00Z",
      "2026-03-26T23:30:00Z",
      "2026-03-27T00:30:00Z",
      "2026-03-27T01:59:00Z",
      "2026-03-27T02:00:00Z",
      "2026-10-24T22:30:00Z",
      "2026-10-24T23:30:00Z",
      "2026-10-25T02:59:00Z",
      "2026-10-25T03:00:00Z",
    ];
    await withBusiness("order-settings-day", async (tx, id) => {
      for (const dayEndsAt of ["05:00", "00:00"]) {
        await store(tx, id, JSON.stringify({ dayEndsAt }));
        for (const instant of instants) {
          const [row] = await tx<{ day: string }[]>`
            select private.order_business_day(${id}, ${instant}::timestamptz)::text as day`;
          expect(row?.day, `${instant} ${dayEndsAt}`).toBe(
            orderDay(new Date(instant), "Asia/Jerusalem", dayEndsAt),
          );
        }
      }
    });
  });
});
