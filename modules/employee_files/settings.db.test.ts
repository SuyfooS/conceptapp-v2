import { fileAsksOf, fileGroupsAsked } from "@domain/employee-file-settings";
import { readModuleSettings } from "@domain/modules";
import { checkSettingsChange } from "@domain/settings-form";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifest } from "./manifest";

/**
 * What the hiring file asks, as the database reads and saves it
 * (supabase/migrations/20261126000400_employee_files_settings.sql):
 * private.employee_files_settings defaults as the manifest does; the groups
 * the file counts (private.file_groups) follow askAddress and askBank as
 * readModuleSettings reads them, a stored value the manifest wouldn't take
 * read as its default; and public.set_module_settings takes exactly what
 * checkSettingsChange takes, as the manifest outputs it, and refuses what
 * it refuses. pgTAP can't read the manifest, so this asks SQL. Needs the
 * local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

/** A number no other test uses (050-078-xxxx). */
const TEAM_PHONE = "972500789901";

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
        values (${id}, 'employee_files', false, '{}')`;
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
    where bm.business_id = ${id} and bm.module_key = 'employee_files'`;
}

/** Each field's values as typed, the ones the manifest takes and the ones it doesn't. */
const TYPED: Record<string, unknown[]> = {
  askBank: [true, false, "true", "false", 0, 1, null],
  askAddress: [true, false, "false", null],
  askEmergencyContact: [true, false, "true", 1],
  askWorkLanguage: [true, false, "false", 0],
  form101: ["print", "link", "off", "paper", "PRINT", 1, null],
  form101Provider: [
    "",
    "משרד השכר",
    "  רווחים בצדדים  ",
    "א".repeat(60),
    "א".repeat(61),
    "שורה\nשנייה",
    "a\tb",
    5,
    null,
  ],
  payrollProvider: ["משרד רואי החשבון", "א".repeat(61), "a\rb"],
  employerName: ["מסעדת הדגמה בע״מ", "x\u0085y", ""],
  form101Link: [
    "",
    "https://101.example/a?b=1#c",
    "HTTPS://Malam.co.il/101",
    " https://101.example/noa ",
    "http://x.co",
    "https://",
    "https://x",
    "https://x.co/ש",
    "https://user@x.co",
    "javascript:alert(1)",
    "https://x.co/a b",
    `https://x.co/${"a".repeat(287)}`,
    `https://x.co/${"a".repeat(288)}`,
    5,
    null,
  ],
  employerPhone: [
    "",
    "03-123-4567",
    "+97231234567",
    "050-123-4567",
    "0501234567",
    "077-123-4567",
    "+97212345678",
    "12",
    5,
    null,
  ],
  deductionsFile: [
    "",
    "912345678",
    "9-1234-5678",
    "812345678",
    "91234567",
    "abc",
    912345678,
    null,
  ],
};

describe("the hiring file's settings", () => {
  it("default in the database as in the manifest", async () => {
    // An id no business has: no settings at all.
    const [row] = await sql<{ settings: unknown }[]>`
      select private.employee_files_settings(gen_random_uuid()) as settings`;
    expect(row?.settings).toEqual(manifest.settings.parse({}));
  });

  it("count the groups as the manifest reads the asks, field by field", async () => {
    // Each stored as JSON text, so the database reads it as it is.
    const values = ["true", "false", '"false"', "0", "null", "[true]"];
    await withBusiness("file-settings-check", async (tx, id) => {
      for (const address of [undefined, ...values]) {
        for (const bank of [undefined, ...values]) {
          const json = JSON.stringify({
            ...(address === undefined
              ? {}
              : { askAddress: JSON.parse(address) as unknown }),
            ...(bank === undefined
              ? {}
              : { askBank: JSON.parse(bank) as unknown }),
          });
          await store(tx, id, json);
          const [row] = await tx<{ groups: string[] }[]>`
            select private.file_groups(${id}) as groups`;
          expect(row?.groups, json).toEqual(
            fileGroupsAsked(
              fileAsksOf(readModuleSettings(manifest, JSON.parse(json))),
            ),
          );
        }
      }
    });
  });

  it("take in the database what the manifest takes, as it outputs it, and refuse what it refuses", async () => {
    await withBusiness("file-settings-save", async (tx, id) => {
      // Someone on the ConceptApp team, who may change every field.
      const [team] = await tx<{ id: string }[]>`
        insert into auth.users (id, aud, role, phone)
        values (gen_random_uuid(), 'authenticated', 'authenticated', ${TEAM_PHONE})
        returning id`;
      const actor = team?.id ?? "";
      await tx`
        insert into public.platform_staff (user_id, role)
        values (${actor}, 'onboarder')`;
      for (const [field, typed] of Object.entries(TYPED)) {
        for (const raw of typed) {
          const said = `${field} ${JSON.stringify(raw)}`;
          const checked = checkSettingsChange(
            manifest,
            {},
            { [field]: raw },
            "team",
          );
          if (checked.ok) {
            const stored = await tx
              .savepoint(async (sp) => {
                await sp`
                select public.set_module_settings(
                  ${actor}, ${id}, 'employee_files',
                  ${JSON.stringify(checked.patch)}::text::jsonb
                )`;
                const [row] = await sp<{ settings: Record<string, unknown> }[]>`
                select bm.settings from public.business_modules bm
                where bm.business_id = ${id} and bm.module_key = 'employee_files'`;
                throw Object.assign(new Rollback(), { stored: row?.settings });
              })
              .catch((error: unknown) => {
                if (error instanceof Rollback) {
                  return (error as Rollback & { stored: unknown }).stored;
                }
                throw error;
              });
            expect(stored, said).toEqual(checked.patch);
          } else {
            const refused = await tx
              .savepoint(async (sp) => {
                await sp`
                  select public.set_module_settings(
                    ${actor}, ${id}, 'employee_files',
                    ${JSON.stringify({ [field]: raw })}::text::jsonb
                  )`;
                return "none";
              })
              .catch((error: unknown) =>
                error && typeof error === "object" && "code" in error
                  ? String((error as { code: unknown }).code)
                  : "unknown",
              );
            expect(refused, said).toBe("22023");
          }
        }
      }
    });
  });
});
