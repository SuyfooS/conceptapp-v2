import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The demo restaurant's sample orders (private.seed_demo_orders, waiter mode
// P3) are sent by the people the demo definitions name, picked by role in
// the order each definition lists them: the first manager, and the first
// worker in a department that takes orders (the restaurant template's
// takerDepartments). Nothing in SQL says when a definition no longer has
// them: the seed writes nothing, with only a warning in the Postgres log.
// This keeps both definitions, supabase/seed.sql and supabase/hosted-demo.sql,
// holding them, with an account, in departments the template has.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();

/** The departments a template names for taking orders, newest migration last. */
function takerDepartments(template: string): string[] {
  let found: string[] = [];
  const row = new RegExp(`\\('${template}', '(\\[[^']*\\])'::jsonb\\)`, "g");
  for (const file of migrations) {
    const sql = read(`supabase/migrations/${file}`);
    if (!sql.includes("'{modules,order_taking}'")) continue;
    for (const [, json = "[]"] of sql.matchAll(row)) {
      found = JSON.parse(json) as string[];
    }
  }
  return found;
}

type Person = {
  user_id: string;
  role: string;
  name: string;
  departments?: string[];
};
type Definition = { slug: string; template: string; people: Person[] };

/** The demo businesses' definitions in a seed file. */
function definitions(source: string): Definition[] {
  return [...source.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
    ([, json = "{}"]) => JSON.parse(json) as Definition,
  );
}

/** The newest migration that writes the seed, its body. */
function seedSource(): string {
  const defining = migrations.filter((file) =>
    /function private\.seed_demo_orders\(/.test(
      read(`supabase/migrations/${file}`),
    ),
  );
  const newest = defining.at(-1);
  if (!newest) throw new Error("No migration writes private.seed_demo_orders");
  const sql = read(`supabase/migrations/${newest}`);
  const start = sql.indexOf("function private.seed_demo_orders(");
  return sql.slice(start, sql.indexOf("\n$$;", start));
}

describe("the demo's sample orders", () => {
  const takers = takerDepartments("restaurant");

  it("come from the restaurant template's departments that take orders", () => {
    expect(takers).toEqual(["floor", "bar"]);
    const seed = seedSource();
    // By role, in the order the definition names them.
    expect(seed).toContain("'manager'::public.member_role");
    expect(seed).toContain("'worker'::public.member_role");
    expect(seed).toContain("private.in_taker_department(business, m.user_id)");
    expect(seed).toContain("order by person.ordinality");
    // Nothing in the log, and nothing that adds money up.
    expect(seed).not.toMatch(/insert into public\.audit_log/);
  });

  for (const path of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
    it(`have their two senders in ${path}`, () => {
      const source = read(path);
      const restaurant = definitions(source).find(
        (demo) => demo.slug === "demo-restaurant",
      );
      expect(restaurant?.template).toBe("restaurant");
      const people = restaurant?.people ?? [];
      const manager = people.find((p) => p.role === "manager");
      const worker = people.find(
        (p) =>
          p.role === "worker" &&
          (p.departments ?? []).some((key) => takers.includes(key)),
      );
      expect(manager, `${path}: a manager, who sends table 7`).toBeDefined();
      expect(
        worker,
        `${path}: a worker in a department that takes orders, who sends table 4`,
      ).toBeDefined();
      // Each has an account in the same file: the reset leaves out a person
      // without one, and the seed would pick someone else, or no one.
      for (const person of [manager, worker]) {
        if (!person) continue;
        expect(
          source.split(person.user_id).length - 1,
          `${path}: ${person.name} has an account`,
        ).toBeGreaterThan(1);
      }
    });
  }

  it("are sent by the same people in both definitions", () => {
    const senders = (path: string) => {
      const people =
        definitions(read(path)).find((demo) => demo.slug === "demo-restaurant")
          ?.people ?? [];
      return [
        people.find((p) => p.role === "manager")?.name,
        people.find(
          (p) =>
            p.role === "worker" &&
            (p.departments ?? []).some((key) => takers.includes(key)),
        )?.name,
      ];
    };
    expect(senders("supabase/hosted-demo.sql")).toEqual(
      senders("supabase/seed.sql"),
    );
  });
});
