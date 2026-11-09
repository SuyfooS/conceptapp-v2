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
  // Its live departments and lists, in the template's own shape: departments
  // and shifts by key, times as "HH:MM" for the day and minutes for a shift.
  const [departments] = await tx<{ value: unknown }[]>`
    select coalesce(
      jsonb_agg(jsonb_build_object('key', d.key, 'name', d.name) order by d.position),
      '[]'::jsonb
    ) as value
    from public.departments d
    where d.business_id = ${businessId} and d.archived_at is null`;
  const [listTemplates] = await tx<{ value: unknown }[]>`
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'key', t.key,
      'name', t.name,
      'note', t.note,
      'recipient', case t.recipient_kind
        when 'department' then jsonb_build_object('kind', 'department', 'department', rd.key)
        when 'shift' then jsonb_build_object('kind', 'shift', 'shift', t.recipient_shift)
        when 'role' then jsonb_build_object('kind', 'role', 'role', t.recipient_role)
      end,
      'fromDepartment', fd.key,
      'asksQuantities', t.asks_quantities,
      'items', (
        select jsonb_agg(jsonb_build_object(
          'kind', i.kind, 'label', i.label, 'hint', i.hint, 'required', i.required,
          'unit', i.unit, 'min', i.min_value, 'max', i.max_value,
          'defaultQuantity', i.default_quantity
        ) order by i.position)
        from public.list_template_items i where i.template_id = t.id
      ),
      'schedules', coalesce((
        select jsonb_agg(jsonb_build_object(
          'days', to_jsonb(s.days),
          'anchor', s.anchor,
          'shift', s.shift_key,
          'opens', case when s.anchor = 'day'
            then to_jsonb(lpad((s.opens_offset / 60)::text, 2, '0') || ':'
              || lpad((s.opens_offset % 60)::text, 2, '0'))
            else to_jsonb(s.opens_offset) end,
          'dueAfterMinutes', s.due_offset - s.opens_offset,
          'recipient', case s.recipient_kind
            when 'department' then jsonb_build_object('kind', 'department', 'department', sd.key)
            when 'shift' then jsonb_build_object('kind', 'shift', 'shift', s.recipient_shift)
            when 'role' then jsonb_build_object('kind', 'role', 'role', s.recipient_role)
          end
        ) order by s.position)
        from public.list_schedules s
        left join public.departments sd on sd.id = s.recipient_department
        where s.template_id = t.id
      ), '[]'::jsonb)
    )) order by t.position), '[]'::jsonb) as value
    from public.list_templates t
    left join public.departments rd on rd.id = t.recipient_department
    left join public.departments fd on fd.id = t.from_department
    where t.business_id = ${businessId} and t.archived_at is null`;
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
      departments: departments?.value,
      listTemplates: listTemplates?.value,
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
