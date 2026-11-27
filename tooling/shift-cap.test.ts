import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_PEOPLE_ON_A_SHIFT } from "@domain/staffing";
import { describe, expect, it } from "vitest";

// At most 50 people on a shift, in the database too
// (20261128000500_shift_cap.sql): two statement-level triggers on
// public.shift_assignments count every shift a statement put more people on,
// after locking those shifts. pgTAP runs in one session and can't see two
// statements wait for each other, so this reads the lock and the count from
// the migrations, as tooling/running-week-edge.test.ts reads the week locks:
// the newest body of the function, and the triggers as created.
const dir = join(__dirname, "..", "supabase/migrations");
const migrations = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(dir, file), "utf8"));

const NAME = "private.refuse_crowded_shifts";

/** The function's newest body (between its `$$`), or null once dropped. */
function newestBody(): string | null {
  let body: string | null = null;
  const statement =
    /\b(?:create (?:or replace )?function|drop function(?: if exists)?) ([a-z_]+\.[a-z_]+)\(/g;
  for (const sql of migrations) {
    for (const match of sql.matchAll(statement)) {
      if (match[1] !== NAME) continue;
      if (match[0].startsWith("drop")) {
        body = null;
        continue;
      }
      const start = sql.indexOf("$$", match.index);
      const end = sql.indexOf("$$", start + 2);
      body = sql.slice(start + 2, end);
    }
  }
  return body;
}

/** The text without its `--` comments, its lines kept. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

const all = withoutComments(migrations.join("\n"));
const found = newestBody();
const body = withoutComments(found ?? "");

describe("the cap on the people on a shift", () => {
  it("is a trigger function the migrations keep", () => {
    expect(found).not.toBeNull();
    expect(all).toMatch(
      /revoke execute on function private\.refuse_crowded_shifts\(\)\s+from public, anon, authenticated;/,
    );
  });

  it("runs after every statement that inserts or updates, with the rows it touched", () => {
    expect(all).toMatch(
      /create trigger shift_assignments_at_most_50\s+after insert on public\.shift_assignments\s+referencing new table as new_rows\s+for each statement execute function private\.refuse_crowded_shifts\(\);/,
    );
    expect(all).toMatch(
      /create trigger shift_assignments_moved_at_most_50\s+after update on public\.shift_assignments\s+referencing old table as old_rows new table as new_rows\s+for each statement execute function private\.refuse_crowded_shifts\(\);/,
    );
    expect(all).not.toMatch(
      /drop trigger (if exists )?shift_assignments_(moved_)?at_most_50\b/,
    );
  });

  it("locks the shifts it counts first, in order, for no key update", () => {
    const lock = body.search(
      /perform 1\s+from public\.schedule_shifts s\s+where s\.id = any \(grown\)\s+order by s\.id\s+for no key update;/,
    );
    const count = body.indexOf("from public.shift_assignments a");
    expect(lock).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(lock);
    // Never for update: each insert holds a key share on its shift through
    // the foreign key, so two inserts would wait for each other's.
    expect(body).not.toMatch(/\bfor (update|share|key share)\b/);
    // No week row: the week locks' order stays the write's
    // (20261115000600_running_week_edge.sql).
    expect(body).not.toMatch(/public\.schedule_weeks/);
  });

  it("counts to the app's own cap", () => {
    const caps = [...body.matchAll(/having count\(\*\) > (\d+)/g)].map(
      (match) => Number(match[1]),
    );
    expect(caps).toEqual([MAX_PEOPLE_ON_A_SHIFT]);
    expect(body).toContain(
      `raise exception 'More than ${MAX_PEOPLE_ON_A_SHIFT} people on a shift'`,
    );
    expect(body).toMatch(
      /using errcode = '22023', hint = 'full', detail = crowded::text;/,
    );
  });
});
