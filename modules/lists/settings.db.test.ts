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
});
