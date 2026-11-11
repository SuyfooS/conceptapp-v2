import {
  DEFAULT_DOCUMENT_SPACE_MB,
  DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_DIRECTIONS,
  DOCUMENT_REMOVE_REASONS,
  DOCUMENT_SAMPLES,
  DOCUMENT_SPACE_MB,
  DOCUMENTS_GUARD_BYTES,
} from "@domain/documents";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import he from "../../messages/he.json";

/**
 * Official documents (chat C6) as the database keeps them are the ones
 * @domain/documents names: its categories, ways, samples and the reasons a
 * file is removed with (the checks on public.documents), the words a demo's
 * document is titled with (private.document_title, the screens' own
 * app.chat.documents.categories), the 980 MB guard, and the space each
 * `documentSpaceMb` gives (private.document_space_bytes). pgTAP can't read
 * either side's TypeScript, so this asks SQL; tooling/documents.test.ts reads
 * the migrations for the same without a database. Needs the local database
 * (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

/** The words a check on public.documents allows for `column`, in its order. */
async function allowed(column: string): Promise<string[]> {
  const rows = await sql<{ definition: string }[]>`
    select pg_get_constraintdef(c.oid) as definition
    from pg_constraint c
    where c.conrelid = 'public.documents'::regclass
      and c.contype = 'c'`;
  const own = rows
    .map((row) => row.definition)
    .find((definition) =>
      new RegExp(`^CHECK \\(\\(${column} = ANY \\(ARRAY\\[`).test(definition),
    );
  if (!own) throw new Error(`No check of its own on ${column}`);
  return [...own.matchAll(/'([^']*)'::text/g)].map(([, word = ""]) => word);
}

describe("documents in the database", () => {
  it("take the categories, ways, samples and reasons @domain/documents names", async () => {
    expect(await allowed("category")).toEqual([...DOCUMENT_CATEGORY_KEYS]);
    expect(await allowed("direction")).toEqual([...DOCUMENT_DIRECTIONS]);
    expect(await allowed("sample")).toEqual([...DOCUMENT_SAMPLES]);
    expect(await allowed("removed_reason")).toEqual([
      ...DOCUMENT_REMOVE_REASONS,
    ]);
  });

  it("title a demo's document with its category's words, as the screens say them", async () => {
    const rows = await sql<{ category: string; title: string | null }[]>`
      select c.category, private.document_title(c.category) as title
      from unnest(${sql.array([...DOCUMENT_CATEGORY_KEYS])}::text[]) as c (category)`;
    expect(
      Object.fromEntries(rows.map((row) => [row.category, row.title])),
    ).toEqual(he.app.chat.documents.categories);
  });

  it("stop at 980 MB of Storage", async () => {
    const [row] = await sql<{ bytes: string }[]>`
      select private.documents_guard_bytes()::text as bytes`;
    expect(Number(row?.bytes)).toBe(DOCUMENTS_GUARD_BYTES);
  });

  it("give a business the space its documentSpaceMb says, 50 MB for anything else", async () => {
    const [none] = await sql<{ bytes: string }[]>`
      select private.document_space_bytes(gen_random_uuid())::text as bytes`;
    expect(Number(none?.bytes)).toBe(DEFAULT_DOCUMENT_SPACE_MB * 1024 * 1024);
    await sql
      .begin(async (tx) => {
        const [business] = await tx<{ id: string }[]>`
          insert into public.businesses (slug, name)
          values ('document-space-check', 'Document space check')
          returning id`;
        const id = business?.id ?? "";
        await tx`
          insert into public.business_modules (business_id, module_key, enabled, settings)
          values (${id}, 'chat', false, '{}')`;
        for (const mb of [...DOCUMENT_SPACE_MB, 75]) {
          await tx`
            update public.business_modules
            set settings = jsonb_build_object('documentSpaceMb', ${mb}::integer)
            where business_id = ${id} and module_key = 'chat'`;
          const [row] = await tx<{ bytes: string }[]>`
            select private.document_space_bytes(${id})::text as bytes`;
          const expected = (DOCUMENT_SPACE_MB as readonly number[]).includes(mb)
            ? mb
            : DEFAULT_DOCUMENT_SPACE_MB;
          expect(Number(row?.bytes), String(mb)).toBe(expected * 1024 * 1024);
        }
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});
