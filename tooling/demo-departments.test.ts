import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A demo person names the departments they are in by key ("departments":
// ["kitchen"]), and the reset puts them in the departments their business's
// template has. A key the template doesn't have is skipped without a word, so
// a misspelt one would leave the person out of every list sent there. This
// keeps the keys of supabase/seed.sql and supabase/hosted-demo.sql in the
// templates' departments, as the latest migration that writes them says.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Each template's department keys, from the migrations in their order. */
function templateDepartments(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const dir = "supabase/migrations";
  for (const file of readdirSync(join(root, dir)).sort()) {
    const sql = read(`${dir}/${file}`);
    // The rows of `update public.templates ... from (values (key, departments,
    // listTemplates))`: a key, then the departments, as JSON or '[]'.
    const rows = sql.matchAll(
      /\('([a-z][a-z0-9-]*)', (?:\$json\$([\s\S]*?)\$json\$|'(\[\])')::jsonb, \$json\$/g,
    );
    for (const [, key = "", json, empty] of rows) {
      const departments = JSON.parse(json ?? empty ?? "[]") as {
        key: string;
      }[];
      found.set(
        key,
        departments.map((d) => d.key),
      );
    }
  }
  return found;
}

type Definition = {
  template: string;
  people: { name: string; departments?: string[] }[];
};

/** The demo businesses' definitions in a seed file. */
function definitions(path: string): Definition[] {
  return [...read(path).matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
    ([, json = "{}"]) => JSON.parse(json) as Definition,
  );
}

describe("demo businesses and departments", () => {
  const templates = templateDepartments();

  it("know every template's departments", () => {
    expect([...templates.keys()].sort()).toEqual(
      ["cafe-bar", "general", "restaurant", "retail"].sort(),
    );
    expect(templates.get("restaurant")).toContain("kitchen");
  });

  for (const path of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
    it(`put the people of ${path} only in departments their template has`, () => {
      const demos = definitions(path);
      expect(demos.length).toBeGreaterThan(0);
      for (const demo of demos) {
        const known = templates.get(demo.template) ?? [];
        for (const person of demo.people) {
          for (const key of person.departments ?? []) {
            expect(known, `${person.name}: ${key}`).toContain(key);
          }
        }
      }
      // Each business has someone in a department, or lists have nobody to go to.
      for (const demo of demos) {
        expect(
          demo.people.some((person) => (person.departments ?? []).length > 0),
          demo.template,
        ).toBe(true);
      }
    });
  }
});
