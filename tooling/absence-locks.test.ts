import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Days away (20261127000700_absences.sql): each write locks the business,
// then the person's membership, then the record. A demo reset deletes the
// business and writes it again under the same id, so a write that waited on
// the reset's lock wakes to find no row: under READ COMMITTED the new one is
// not in its snapshot. Gone on, it would lock the new business's membership
// holding no lock on the business, and the next reset would deadlock with it
// (40P01). So each refuses there, before it locks anyone.
const root = join(__dirname, "..");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();

/** The body of the newest `create [or replace] function <name>(` in the migrations. */
function newest(name: string): string {
  const head = new RegExp(`create (?:or replace )?function ${name}\\(`);
  let found = "";
  for (const file of migrations) {
    const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
    const at = sql.search(head);
    if (at < 0) continue;
    const start = sql.indexOf("$$", at);
    const end = sql.indexOf("$$", start + 2);
    found = sql.slice(at, end + 2);
  }
  return found;
}

const BUSINESS_LOCK =
  /perform 1 from public\.businesses b where b\.id = (\w+) for key share;\s*if not found then\s*(?:--[^\n]*\n\s*)*raise exception '[^']+' using errcode = '(\w+)';\s*end if;/;

describe("the days away's writes", () => {
  it.each([
    // A new record: the phone sends again, asked afresh.
    ["record_absence", "business", "P0002"],
    // The reset took the record with the business: an unknown record.
    ["change_absence", "place", "42501"],
    ["remove_absence", "place", "42501"],
    ["restore_absence", "place", "42501"],
  ])(
    "%s refuses a business a reset replaced, before it locks the membership",
    (name, business, code) => {
      const body = newest(`public\\.${name}`);
      expect(body).not.toBe("");
      const lock = body.match(BUSINESS_LOCK);
      expect(lock?.[1]).toBe(business);
      expect(lock?.[2]).toBe(code);
      // The business, then the person, then the record (the header's locks).
      const member = body.search(
        /from public\.memberships m\s+where m\.business_id = \w+ and m\.user_id = person\s+for share;/,
      );
      expect(lock?.index ?? -1).toBeGreaterThanOrEqual(0);
      expect(member).toBeGreaterThan(lock?.index ?? Number.POSITIVE_INFINITY);
      const record = body.search(
        /from public\.absences ab where ab\.id = absence for update;/,
      );
      if (name !== "record_absence") expect(record).toBeGreaterThan(member);
    },
  );
});
