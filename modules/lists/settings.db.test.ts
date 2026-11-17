import { readModuleSettings } from "@domain/modules";
import { describeSettings } from "@domain/settings-form";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifest } from "./manifest";

/**
 * The lists settings the database falls back to (private.list_settings, which
 * the finish and the notifications read) are the manifest's defaults, which
 * the screens show. pgTAP can't read the manifest, so this asks SQL. Needs the
 * local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

describe("lists settings", () => {
  it("default in the database as in the manifest", async () => {
    // An id no business has: no settings at all.
    const [row] = await sql<{ settings: unknown }[]>`
      select private.list_settings(gen_random_uuid()) as settings`;
    expect(row?.settings).toEqual(manifest.settings.parse({}));
  });

  it("let what a business set win, field by field", async () => {
    await sql
      .begin(async (tx) => {
        const [business] = await tx<{ id: string }[]>`
          insert into public.businesses (slug, name)
          values ('lists-settings-check', 'Lists settings check')
          returning id`;
        const id = business?.id ?? "";
        await tx`
          insert into public.business_modules (business_id, module_key, enabled, settings)
          values (${id}, 'lists', false, '{"lateAfterMinutes": 60}')`;
        const [row] = await tx<{ settings: unknown }[]>`
          select private.list_settings(${id}) as settings`;
        expect(row?.settings).toEqual({
          ...manifest.settings.parse({}),
          lateAfterMinutes: 60,
        });
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });

  it("give a fix the window readModuleSettings reads, anything not offered a day", async () => {
    // private.list_fix_hours (20261116000400_lists_fix_switch.sql) reads
    // fixHours as private.can_fix_list counts it: every value offered, and
    // values not offered as the default. Each stored as JSON text, so the
    // database reads it as it is (24.0 stays a number, "12" text).
    const field = describeSettings(manifest.settings).find(
      (f) => f.key === "fixHours",
    );
    const offered = field?.kind === "choice" ? field.options : [];
    expect(offered.length).toBeGreaterThan(0);
    const stored = [
      "{}",
      ...offered.map((hours) => `{"fixHours": ${hours}}`),
      '{"fixHours": 24.0}',
      '{"fixHours": 72.0}',
      '{"fixHours": "12"}',
      '{"fixHours": 48}',
      '{"fixHours": 2.5}',
      '{"fixHours": null}',
      '{"fixHours": [2]}',
    ];
    await sql
      .begin(async (tx) => {
        const [business] = await tx<{ id: string }[]>`
          insert into public.businesses (slug, name)
          values ('lists-fix-hours-check', 'Lists fix hours check')
          returning id`;
        const id = business?.id ?? "";
        await tx`
          insert into public.business_modules (business_id, module_key, enabled, settings)
          values (${id}, 'lists', true, '{}')`;
        for (const settings of stored) {
          await tx`
            update public.business_modules bm
            set settings = ${settings}::text::jsonb
            where bm.business_id = ${id} and bm.module_key = 'lists'`;
          const [row] = await tx<{ hours: number }[]>`
            select (extract(epoch from private.list_fix_hours(${id})) / 3600)::integer as hours`;
          expect(row?.hours, settings).toBe(
            readModuleSettings(manifest, JSON.parse(settings)).fixHours,
          );
        }
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
