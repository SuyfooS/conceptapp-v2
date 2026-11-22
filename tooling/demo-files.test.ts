import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBankAccount } from "@domain/bank-account";
import { normalizeIsraeliId } from "@domain/israeli-id";
import { describe, expect, it } from "vitest";

// The demo businesses' hiring files (profile H4,
// 20261126000200_employee_files.sql): made-up values in the demo format, the
// module off and writes closed in both hosted, until Orel approves the
// screens (anyone at the door is any demo person, and the next visitor would
// read what they typed); locally the restaurant takes writes for the browser
// tests of the worker's own file (H5a). The definition's "files" cases are
// each a person of that business and a case private.seed_demo_files knows,
// and the values the seed writes check as real ones would.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

type Definition = {
  slug: string;
  fileWrites?: unknown;
  files?: { cases: { user_id: string; case: string }[] };
  people: { user_id: string; role: string }[];
};

const definitions = (sql: string): Definition[] =>
  [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
    ([, json = "{}"]) => JSON.parse(json) as Definition,
  );

const CASES = [
  "no_file",
  "no_bank",
  "bank_new",
  "bank_warned",
  "passport",
  "direct_pension",
  "form101_missing",
  "form101_returned",
  "form101_change_due",
  "emergency",
];

/** The newest migration's body of private.seed_demo_files. */
function seedBody(): string {
  const dir = join(root, "supabase/migrations");
  const newest = readdirSync(dir)
    .filter((file) =>
      /function private\.seed_demo_files\(/.test(
        read(`supabase/migrations/${file}`),
      ),
    )
    .sort()
    .at(-1);
  expect(newest).toBeDefined();
  const sql = read(`supabase/migrations/${newest}`);
  const start = sql.lastIndexOf("function private.seed_demo_files(business");
  return sql.slice(start, sql.indexOf("\n$$;", start));
}

/** A text[] literal the seed declares by name: `name text[] := array[...]`. */
function arrayOf(body: string, name: string): string[] {
  const found = new RegExp(`${name} text\\[\\] := array\\[([^\\]]*)\\]`).exec(
    body,
  );
  expect(found, name).not.toBeNull();
  return [...(found?.[1] ?? "").matchAll(/'([^']*)'/g)].map(([, v = ""]) => v);
}

describe("the demo's hiring files", () => {
  it("stay off, and closed but for the local restaurant's", () => {
    for (const file of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
      const sql = read(file);
      // Nothing switches the module on: no definition, and no statement,
      // names it (the comments name the migration). The browser tests of
      // the worker's own file switch it on and off themselves (H5a).
      expect(sql, file).not.toMatch(/["']employee_files["']/);
      for (const definition of definitions(sql)) {
        expect(JSON.stringify(definition), definition.slug).not.toContain(
          "employee_files",
        );
      }
    }
    // Hosted, anyone at the door is any demo person, and the next visitor
    // would read what they typed: closed there, always.
    const hosted = read("supabase/hosted-demo.sql");
    expect(hosted).not.toContain('"fileWrites"');
    for (const definition of definitions(hosted)) {
      expect(definition.fileWrites, definition.slug).toBeUndefined();
    }
    // Locally, the restaurant takes writes for e2e/employee-file.spec.ts;
    // the shop stays closed, as the hosted ones are.
    const local = Object.fromEntries(
      definitions(read("supabase/seed.sql")).map((d) => [d.slug, d]),
    );
    expect(local["demo-restaurant"]?.fileWrites).toBe(true);
    expect(local["demo-shop"]?.fileWrites).toBeUndefined();
  });

  it("name a person of their own business and a case the seed knows", () => {
    for (const file of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
      const found = definitions(read(file));
      expect(found.map((d) => d.slug)).toEqual([
        "demo-restaurant",
        "demo-shop",
      ]);
      for (const definition of found) {
        const staff = new Set(
          definition.people
            .filter((p) => p.role === "manager" || p.role === "worker")
            .map((p) => p.user_id),
        );
        expect(definition.files?.cases.length, definition.slug).toBeGreaterThan(
          0,
        );
        for (const one of definition.files?.cases ?? []) {
          expect(
            staff.has(one.user_id),
            `${definition.slug} ${one.user_id}`,
          ).toBe(true);
          expect(CASES).toContain(one.case);
        }
      }
    }
  });

  it("have the same cases hosted as the migration wrote, on the same people", () => {
    const hosted = definitions(read("supabase/hosted-demo.sql"));
    const migration = read(
      "supabase/migrations/20261126000200_employee_files.sql",
    );
    const patched = [...migration.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
      ([, json = "{}"]) =>
        (JSON.parse(json) as { files: Definition["files"] }).files,
    );
    expect(patched).toEqual(hosted.map((d) => d.files));
  });

  it("use valid Israeli IDs from the test range", () => {
    const ids = arrayOf(seedBody(), "demo_ids");
    expect(ids.length).toBeGreaterThanOrEqual(9);
    for (const id of ids) {
      expect(id).toMatch(/^0000000\d\d$/);
      expect(normalizeIsraeliId(id), id).toBe(id);
    }
  });

  it("use accounts that check valid, and one that warns", () => {
    const body = seedBody();
    expect(body).toContain("12 end");
    expect(body).toContain("600 end");
    for (const account of arrayOf(body, "demo_accounts")) {
      expect(
        checkBankAccount({ bank: 12, branch: 600, account }, "2026-11-26")
          .status,
        account,
      ).toBe("valid");
    }
    const warned = /warned_account text := '(\d+)'/.exec(body)?.[1] ?? "";
    expect(
      checkBankAccount(
        { bank: 12, branch: 600, account: warned },
        "2026-11-26",
      ),
    ).toMatchObject({ status: "warning" });
  });

  it("give emails at a domain that can't receive mail, and a demo's phone", () => {
    const body = seedBody();
    expect(body).toContain("'@demo.conceptapp.invalid'");
    expect(body).not.toMatch(/@(?!demo\.conceptapp\.invalid)[a-z]/);
    expect(body).toContain("'+972500000999'");
  });
});
