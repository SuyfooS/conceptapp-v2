import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTeamName, TEAM_NAME_MAX } from "@domain/team";
import { beforeAll, describe, expect, it } from "vitest";

// One rule for a name, in the app and in the database. public.claim_invite
// reads an invite's name and the person's own with private.team_name
// (20261127000500_invite_names.sql), which lists by code point what
// parseTeamName (@domain/team) finds with Unicode's classes: Postgres has
// none. Every code point goes through parseTeamName here and is sorted by
// what it does to a name, and each list in the newest private.team_name must
// hold exactly those. A character added on one side only, or a Node with a
// newer Unicode, fails here, rather than as a name the claim and the screens
// read apart (a row for someone's own name, or an old one left in place).

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

/** One item of a bracket: a `\x` escape, or a range of two. */
const ITEM = /\\x([0-9A-F]+)(?:-\\x([0-9A-F]+))?/g;

/** The code points a bracket of `\x` escapes and their ranges holds. */
function codePoints(bracket: string): number[] {
  const inside = bracket.slice(1, -1);
  // Nothing in it but escapes, so no character hides in the source.
  expect(inside.replace(ITEM, "")).toBe("");
  const out: number[] = [];
  for (const [, from, to] of inside.matchAll(ITEM)) {
    const first = Number.parseInt(from ?? "", 16);
    const last = to ? Number.parseInt(to, 16) : first;
    expect(last).toBeGreaterThanOrEqual(first);
    for (let cp = first; cp <= last; cp++) out.push(cp);
  }
  return out.sort((a, b) => a - b);
}

/** The bracket a pattern of the rule holds, found by what surrounds it. */
function bracketOf(rule: string, around: RegExp): number[] {
  const found = rule.match(around)?.[1];
  expect(found, String(around)).toBeDefined();
  return codePoints(found ?? "[]");
}

type Sorted = {
  /** Dropped wherever it is. */
  dropped: number[];
  /** A space, collapsed with the spaces around it. */
  spaces: number[];
  /** Dropped at a word's start, where it joins nothing. */
  lead: number[];
  /** Dropped at a word's end. */
  trail: number[];
  /** Anything that does more than stay (with its letters composed): none. */
  odd: number[];
};

/**
 * Every code point as parseTeamName treats it, between two marks that
 * compose with nothing ("#"). U+0000 is left out, as no text in Postgres
 * holds it, and so are the surrogates, which no text holds alone.
 */
function sortCodePoints(): Sorted {
  const sorted: Sorted = {
    dropped: [],
    spaces: [],
    lead: [],
    trail: [],
    odd: [],
  };
  const kept = (text: string) => {
    const name = parseTeamName(text);
    return name.ok ? name.name : null;
  };
  for (let cp = 1; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const c = String.fromCodePoint(cp);
    const between = kept(`#${c}#`);
    if (between === "##") {
      sorted.dropped.push(cp);
      continue;
    }
    if (between === "# #") {
      sorted.spaces.push(cp);
      continue;
    }
    const n = c.normalize("NFC");
    if (between !== `#${n}#`) sorted.odd.push(cp);
    // At the start of the second word, then at the end of the third.
    const edges = kept(`# ${c}# #${c} #`);
    const atStart = edges === `# # #${n} #` || edges === "# # # #";
    const atEnd = edges === `# ${n}# # #` || edges === "# # # #";
    if (atStart) sorted.lead.push(cp);
    if (atEnd) sorted.trail.push(cp);
    if (!atStart && !atEnd && edges !== `# ${n}# #${n} #`) sorted.odd.push(cp);
  }
  return sorted;
}

describe("a name as the database keeps one (private.team_name)", () => {
  const rule = newest("private\\.team_name");
  let app: Sorted;

  beforeAll(() => {
    app = sortCodePoints();
  }, 60_000);

  it("is defined, and the app's rule sorts every code point plainly", () => {
    expect(rule).not.toBe("");
    expect(app.odd).toEqual([]);
    // The ones the review found, as a check on the sorting itself.
    expect(app.dropped).toContain(0x200f);
    expect(app.dropped).toContain(0x7);
    expect(app.spaces).toContain(0xa0);
    expect(app.lead).toContain(0xfe0f);
    expect(app.trail).toEqual([0x200c, 0x200d]);
  });

  it("drops what the app drops, before anything else", () => {
    expect(rule).toMatch(
      /normalize\(\s*regexp_replace\(\s*coalesce\(value, ''::text\),\s*'\[/,
    );
    expect(
      bracketOf(
        rule,
        /coalesce\(value, ''::text\),\s*'(\[[^']*\])',\s*''::text, 'g'/,
      ),
    ).toEqual(app.dropped);
  });

  it("then composes letters, and collapses every space the app splits on", () => {
    expect(rule).toMatch(/\),\s*NFC\s*\),\s*'\[/);
    expect(bracketOf(rule, /'(\[[^']*\])\+',\s*' '::text, 'g'/)).toEqual(
      app.spaces,
    );
  });

  it("then drops a joiner or a selector at a word's start, and a joiner at its end", () => {
    expect(
      bracketOf(rule, /'\(\^\| \)(\[[^']*\])\+',\s*'\\1'::text, 'g'/),
    ).toEqual(app.lead);
    expect(
      bracketOf(rule, /'(\[[^']*\])\+\( \|\$\)',\s*'\\1'::text, 'g'/),
    ).toEqual(app.trail);
  });

  it("keeps a name of 1 to TEAM_NAME_MAX characters, as the app does", () => {
    expect(rule).toContain(`between 1 and ${TEAM_NAME_MAX} then`);
  });

  it("is how the claim reads the invite's name and the person's own", () => {
    const claim = newest("public\\.claim_invite");
    expect(claim).toContain("kept := private.team_name(inv.full_name);");
    expect(claim).toContain("select private.team_name(p.full_name)");
  });
});
