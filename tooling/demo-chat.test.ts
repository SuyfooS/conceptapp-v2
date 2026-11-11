import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The demo's conversations (private.seed_demo_chat, chat C2) are written by
// the people the demo definitions name, picked by role in the order each
// definition lists them: the first owner, the first manager, the first two
// workers, and the first worker's first department. Nothing in SQL says when
// a definition no longer has them: the part they write is skipped with only a
// warning in the Postgres log. This keeps both definitions, supabase/seed.sql
// and supabase/hosted-demo.sql, holding everyone the seed needs, with an
// account, in a department their template has: the restaurant's kitchen and
// the shop's checkout (§13 of the chat plan).
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();

/** Each template's department keys, from the migrations in their order. */
function templateDepartments(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of migrations) {
    const sql = read(`supabase/migrations/${file}`);
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

/** Who the seed picks, as it picks them. */
function picked(demo: Definition) {
  const byRole = (role: string) => demo.people.filter((p) => p.role === role);
  const [owner] = byRole("owner");
  const manager = byRole("manager")[0] ?? owner;
  const [workerOne, workerTwo] = byRole("worker");
  return { owner, manager, workerOne, workerTwo };
}

/** The newest migration that writes the seed. */
function seedSource(): string {
  const defining = migrations.filter((file) =>
    /function private\.seed_demo_chat\(/.test(
      read(`supabase/migrations/${file}`),
    ),
  );
  const newest = defining.at(-1);
  if (!newest) throw new Error("No migration writes private.seed_demo_chat");
  const sql = read(`supabase/migrations/${newest}`);
  const start = sql.indexOf("function private.seed_demo_chat(");
  return sql.slice(start, sql.indexOf("\n$$;", start));
}

describe("the demo's conversations", () => {
  const templates = templateDepartments();
  const expected: Record<string, string> = {
    "demo-restaurant": "kitchen",
    "demo-shop": "checkout",
  };

  it("are written through the chat functions, as the demo's own", () => {
    const seed = seedSource();
    expect(seed).toContain("language plpgsql");
    expect(seed).toContain("public.send_chat_message(");
    expect(seed).toContain("public.read_chat(");
    // No announcement before C3, whose "קראתי" settles it: one now would wait
    // in the bell and on the Chat tab for a press nothing offers.
    expect(seed).not.toContain("confirm_announcement");
    expect(seed).not.toMatch(/insert into public\.chat_messages/);
    expect(seed).toMatch(/set seeded = true/);
    // By role, in the order the definition names them.
    for (const role of ["owner", "manager", "worker"]) {
      expect(seed).toContain(`'${role}'::public.member_role`);
    }
    expect(seed).toContain("order by person.ordinality");
  });

  for (const path of ["supabase/seed.sql", "supabase/hosted-demo.sql"]) {
    it(`have everyone they need in ${path}`, () => {
      const source = read(path);
      const demos = definitions(source);
      expect(demos.map((d) => d.slug).sort()).toEqual(
        ["demo-restaurant", "demo-shop"].sort(),
      );
      for (const demo of demos) {
        const { owner, manager, workerOne, workerTwo } = picked(demo);
        const who = `${path} ${demo.slug}`;
        expect(owner, `${who}: an owner`).toBeDefined();
        expect(
          demo.people.some((p) => p.role === "manager"),
          `${who}: a manager, who writes the morning's messages`,
        ).toBe(true);
        expect(workerOne, `${who}: a worker`).toBeDefined();
        expect(
          workerTwo,
          `${who}: a second worker, who reads the team's group`,
        ).toBeDefined();
        expect(workerOne?.user_id).not.toBe(manager?.user_id);

        // Each of them has an account in the same file: the reset leaves out
        // a person without one, and the seed would pick someone else.
        for (const person of [owner, manager, workerOne, workerTwo]) {
          if (!person) continue;
          const mentions = source.split(person.user_id).length - 1;
          expect(
            mentions,
            `${who}: ${person.name} has an account`,
          ).toBeGreaterThan(1);
        }

        // The first worker's first department the template has: the group
        // the seed writes in.
        const known = templates.get(demo.template) ?? [];
        const department = (workerOne?.departments ?? []).find((key) =>
          known.includes(key),
        );
        expect(department, `${who}: the first worker's department`).toBe(
          expected[demo.slug],
        );
      }
    });
  }

  it("are the same people in both definitions, by role and name", () => {
    const names = (path: string) =>
      Object.fromEntries(
        definitions(read(path)).map((demo) => {
          const { owner, manager, workerOne, workerTwo } = picked(demo);
          return [
            demo.slug,
            [owner, manager, workerOne, workerTwo].map((p) => p?.name),
          ];
        }),
      );
    expect(names("supabase/hosted-demo.sql")).toEqual(
      names("supabase/seed.sql"),
    );
  });
});
