import { TEMPLATE_KEYS, validateTemplate } from "@domain/templates";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifests } from "./registry";

/**
 * The templates as they are in the database, checked against the real
 * manifests, and applied to a fresh business to prove the result is a
 * complete, valid business. Needs the local database (`pnpm db:start`);
 * run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

type Template = { key: string; version: number; definition: unknown };

const templates = () =>
  sql<
    Template[]
  >`select key, version, definition from public.templates order by key`;

/** The business as a template definition, from its rows. */
async function businessAsTemplate(
  tx: postgres.Sql | postgres.TransactionSql,
  businessId: string,
) {
  const modules = await tx<
    {
      module_key: string;
      enabled: boolean;
      settings: Record<string, unknown>;
    }[]
  >`select module_key, enabled, settings from public.business_modules
    where business_id = ${businessId}`;
  const [business] = await tx<
    {
      template_key: string | null;
      template_version: number | null;
      opening_hours: unknown;
    }[]
  >`select template_key, template_version, opening_hours from public.businesses
    where id = ${businessId}`;
  return {
    business,
    definition: {
      modules: Object.fromEntries(
        modules.map((m) => [
          m.module_key,
          { enabled: m.enabled, settings: m.settings },
        ]),
      ),
      openingHours: business?.opening_hours,
    },
  };
}

class Rollback extends Error {}

describe("templates in the database", () => {
  it("holds exactly the known templates", async () => {
    const rows = await templates();
    expect(rows.map((t) => t.key).sort()).toEqual([...TEMPLATE_KEYS].sort());
  });

  it("has templates that are valid against the manifests", async () => {
    for (const template of await templates()) {
      expect(
        () => validateTemplate(manifests, template.definition),
        template.key,
      ).not.toThrow();
    }
  });

  it("turns an empty business into a complete, valid one", async () => {
    for (const template of await templates()) {
      await sql
        .begin(async (tx) => {
          const [created] = await tx<{ id: string }[]>`
            insert into public.businesses (slug, name)
            values (${`template-check-${template.key}`}, 'Template check')
            returning id`;
          const id = created?.id ?? "";
          await tx`set local role service_role`;
          await tx`select public.apply_template(${id}, ${template.key})`;

          const { business, definition } = await businessAsTemplate(tx, id);
          expect(business?.template_key).toBe(template.key);
          expect(business?.template_version).toBe(template.version);
          const applied = validateTemplate(manifests, definition);
          expect(applied).toEqual(
            validateTemplate(manifests, template.definition),
          );
          throw new Rollback();
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error;
        });
    }
  });

  it.each([
    ["demo-restaurant", "restaurant"],
    ["demo-shop", "retail"],
  ])("set up the seeded %s from the %s template", async (slug, key) => {
    const [demo] = await sql<{ id: string }[]>`
      select id from public.businesses where slug = ${slug}`;
    const { business, definition } = await businessAsTemplate(
      sql,
      demo?.id ?? "",
    );
    expect(business?.template_key).toBe(key);
    expect(() => validateTemplate(manifests, definition)).not.toThrow();
  });
});
