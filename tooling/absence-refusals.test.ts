import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { absenceFailureOf } from "@domain/absences";
import { describe, expect, it } from "vitest";

// Days away (20261127000700_absences.sql): the screen says why a write was
// refused from the error's code and hint (`absenceFailureOf`). A hint renamed
// or added in a later migration without its case in the domain would quietly
// fall to "ההיעדרות לא נשמרה. בדקו את החיבור ונסו שוב.", which sends the
// person to check a connection that is fine. This keeps the two equal.
const root = join(__dirname, "..");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();

/** The body of the newest `create [or replace] function <name>(` in the migrations. */
function newest(name: string): string {
  const head = new RegExp(
    `create (?:or replace )?function ${name.replace(".", "\\.")}\\(`,
  );
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

// The four writers, and the check of a record's values they share.
const FUNCTIONS = [
  "private.absence_note_of",
  "public.record_absence",
  "public.change_absence",
  "public.remove_absence",
  "public.restore_absence",
];

type Raise = { fn: string; code: string; hint: string | null };

const RAISE = /using errcode = '(\w+)'(?:,\s*hint = '(\w+)')?/g;

const raises: Raise[] = FUNCTIONS.flatMap((fn) =>
  [...newest(fn).matchAll(RAISE)].map((match) => ({
    fn,
    code: match[1] ?? "",
    hint: match[2] ?? null,
  })),
);

describe("the days away's refusals", () => {
  it("are read from every function that writes them", () => {
    for (const fn of FUNCTIONS) {
      expect(newest(fn), fn).not.toBe("");
      expect(
        raises.some((one) => one.fn === fn),
        fn,
      ).toBe(true);
    }
  });

  it("each carry a hint where the code alone says nothing", () => {
    // 22023 (a value) and 55000 (the record's state) are said by their hint
    // alone; 23P01 is the constraint's, 42501 without a hint is no access.
    for (const one of raises) {
      if (one.code === "22023" || one.code === "55000") {
        expect(one.hint, `${one.fn} ${one.code}`).not.toBeNull();
      }
    }
  });

  it("each have their own words on the screen", () => {
    for (const one of raises.filter((raise) => raise.hint !== null)) {
      expect(
        absenceFailureOf(one.code, one.hint),
        `${one.fn} ${one.code} ${one.hint}`,
      ).not.toBe("failed");
    }
  });

  it("are the twelve the screen says, so one dropped or added is seen here", () => {
    const raised = new Set(
      raises.flatMap((one) => (one.hint ? [`${one.code} ${one.hint}`] : [])),
    );
    expect([...raised].sort()).toEqual(
      [
        "22023 dates",
        "22023 kind",
        "22023 note",
        "22023 order",
        "22023 too_far",
        "22023 too_long",
        "42501 own",
        "55000 month_closed",
        "55000 not_on_staff",
        "55000 not_removed",
        "55000 removed",
        "55000 too_late",
      ].sort(),
    );
  });
});
