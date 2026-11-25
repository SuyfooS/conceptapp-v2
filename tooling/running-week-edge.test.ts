import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The locks on a week's row (20261115000600_running_week_edge.sql, the
// running-week plan's X): a save or a publish locks the weeks either side of
// its own as its first statement, every function that locks weeks takes them
// in ascending order of their first day, and none takes one after anything
// else, so a save, a publish, a team change and a write of a week next door
// never wait for each other in a circle. After them, a write locks the
// requests taken next door, so an approval of one and the write take turns.
// pgTAP runs in one session and can't
// see two of them wait, so this reads the newest definition of each function
// among the migrations, as tooling/chat-pdfs.test.ts reads its locks.
const root = join(__dirname, "..");
const dir = join(root, "supabase/migrations");
const migrations = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

/** Every function's newest body (between its `$$`), by name; dropped ones go. */
function newestBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  const statement =
    /\b(?:create (?:or replace )?function|drop function(?: if exists)?) ([a-z_]+\.[a-z_]+)\(/g;
  for (const file of migrations) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const match of sql.matchAll(statement)) {
      const name = match[1] ?? "";
      if (match[0].startsWith("drop")) {
        bodies.delete(name);
        continue;
      }
      const start = sql.indexOf("$$", match.index);
      const end = sql.indexOf("$$", start + 2);
      bodies.set(name, sql.slice(start + 2, end));
    }
  }
  return bodies;
}

const bodies = newestBodies();

function body(name: string): string {
  const found = bodies.get(name);
  if (found === undefined) throw new Error(`No function ${name}`);
  return found;
}

/** The text without its `--` comments, its lines kept. */
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

/** A plpgsql body's first statement after its `begin`, comments left out. */
function firstStatement(sql: string): string {
  const code = withoutComments(sql);
  const begin = code.search(/\nbegin\n/);
  const rest = code.slice(begin + "\nbegin\n".length).trimStart();
  return rest.slice(0, rest.indexOf(";") + 1);
}

/** The locks on a week's row in `sql` (in a statement reading schedule_weeks), by strength. */
function weekLocks(sql: string): string[] {
  const lock =
    /from public\.schedule_weeks[^;]*\bfor (update|share|no key update|key share)\b/g;
  return [...sql.matchAll(lock)].map((found) => found[1] ?? "");
}

describe("the locks on a week's row", () => {
  it("are a save's first statement and a publish's first lock, the weeks either side with their own", () => {
    expect(firstStatement(body("public.save_week_schedule"))).toBe(
      "perform private.lock_week_edges(week);",
    );
    // A publish asks who may publish before anything else (the roles plan's
    // R3, critique 23): its week's business read plainly, and the check, with
    // no lock and nothing read for update before the helper.
    const publish = withoutComments(body("public.publish_week_schedule"));
    const locked = publish.indexOf("perform private.lock_week_edges(week);");
    const before = publish.slice(0, locked);
    expect(firstStatement(body("public.publish_week_schedule"))).toMatch(
      /^select wk\.business_id into week_business\s+from public\.schedule_weeks wk\s+where wk\.id = week;$/,
    );
    expect(before).toContain(
      "private.publishes_schedule(week_business, actor)",
    );
    expect(before).not.toMatch(
      /\bfor (update|share|no key update|key share)\b/,
    );
    expect(before).not.toMatch(/\block_week_edges\b/);
  });

  it("are taken one at a time in ascending order, the week's own for update and the others for share", () => {
    const edges = withoutComments(body("private.lock_week_edges"));
    expect(edges).toMatch(/order by nw\.starts_on\n\s+loop/);
    expect(edges).not.toMatch(/order by nw\.starts_on desc/);
    expect(edges).toContain("between own.starts_on - 7 and own.starts_on + 7");
    expect(weekLocks(edges)).toEqual(["update", "share"]);
  });

  it("come before the write's lock of the requests taken next door, a statement of its own after the week's own", () => {
    const write = withoutComments(body("private.write_week_schedule"));
    const own = write.search(
      /where s\.week_id = w\.id and sw\.status in \('open', 'taken'\)\s+for update of sw;/,
    );
    const nextDoor = write.search(
      /perform 1\s+from public\.shift_swaps sw\s+join public\.schedule_shifts o on o\.id = sw\.shift_id\s+join public\.schedule_weeks nw on nw\.id = o\.week_id\s+where nw\.business_id = w\.business_id\s+and nw\.id <> w\.id\s+and nw\.starts_on between w\.starts_on - 7 and w\.starts_on \+ 7\s+and o\.day between w\.starts_on - 1 and w\.starts_on \+ 7\s+and sw\.status = 'taken'\s+for update of sw;/,
    );
    expect(own).toBeGreaterThan(0);
    expect(nextDoor).toBeGreaterThan(own);
    // Before the check across the edges, which then reads what an approval
    // under way put in place.
    expect(nextDoor).toBeLessThan(write.indexOf("into edge_clashes"));
    expect(weekLocks(write)).toEqual([]);
  });

  it("are taken ascending by a team change too, before its requests", () => {
    const leave = withoutComments(body("private.leave_staff"));
    const weeks = leave.search(
      /from public\.schedule_weeks w\s+where w\.business_id = business and w\.starts_on >= local_today - 7\s+order by w\.starts_on\s+for update;/,
    );
    expect(weeks).toBeGreaterThan(0);
    expect(weeks).toBeLessThan(leave.indexOf("for update of sw"));
  });

  it("are the helper's in the demo's renewal, before its publish", () => {
    const renew = withoutComments(body("private.renew_demo_schedule"));
    const locked = renew.indexOf("perform private.lock_week_edges(week);");
    expect(locked).toBeGreaterThan(0);
    expect(locked).toBeLessThan(
      renew.indexOf("perform public.publish_week_schedule("),
    );
    expect(weekLocks(renew)).toEqual([]);
  });

  it("are next week's alone in the demo's sample availability, for share, after its business and before its first answer", () => {
    // 20261128000100_demo_sample_availability.sql: one week a business, read
    // to see it isn't published, after the business for key share, which a
    // save or a publish never locks more strongly. It waits for a publish
    // under way and then finds the week published; a publish waits for it as
    // for a write next door.
    const sample = withoutComments(body("public.renew_demo_availability"));
    expect(weekLocks(sample)).toEqual(["share"]);
    const week = sample.search(
      /from public\.schedule_weeks w\s+where w\.id = week and w\.schedule_published_at is null\s+for share;/,
    );
    expect(week).toBeGreaterThan(
      sample.search(/from public\.businesses b[^;]*for key share;/),
    );
    expect(week).toBeLessThan(
      sample.indexOf("insert into public.availability_submissions"),
    );
    expect(week).toBeLessThan(
      sample.indexOf("perform public.submit_availability("),
    );
  });

  it("are taken nowhere else, so a new one is ordered here first", () => {
    const locking = [...bodies]
      .filter(([, sql]) => weekLocks(withoutComments(sql)).length > 0)
      .map(([name]) => name)
      .sort();
    // The publish locks its week again after the helper, to read it: already held.
    expect(locking).toEqual([
      "private.leave_staff",
      "private.lock_week_edges",
      "public.publish_week_schedule",
      "public.renew_demo_availability",
    ]);
    const publish = withoutComments(body("public.publish_week_schedule"));
    expect(
      publish.indexOf("perform private.lock_week_edges(week);"),
    ).toBeLessThan(
      publish.search(/from public\.schedule_weeks[^;]*\bfor update\b/),
    );
    expect(weekLocks(publish)).toEqual(["update"]);
  });
});
