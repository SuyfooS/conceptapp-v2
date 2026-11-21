import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, migrationFiles, withoutComments } from "./role-checks";

/**
 * The activity log is read by area (the roles plan's R7, critique 7): a
 * row's family, `clock` of `clock.in`, names in `private.log_perm` the
 * permission its readers hold besides manage.view, and a family it doesn't
 * name is read by no one through it (it fails closed). The pay rows
 * (`private.is_pay_action`) and documents' have the pay holders' side of the
 * policies instead, and the hiring file's a side of its own. So each family
 * a migration writes to the log needs a place in one of them, or its rows
 * show to nobody but pay holders: this reads the families the migrations
 * write and the ones the policies place.
 */

/**
 * Families the log's policies give a side of their own: documents' to the pay
 * holders, and the hiring file's to holders of people.files (H4).
 */
export const OWN_SIDE = ["document", "employee"] as const;

/** A family of the log as a string names it: `'clock.station.add'` is `clock`. */
const ACTION = /'([a-z_]+)\.[a-z_.]+'/g;

/**
 * Every family a migration's text writes to the log: the family of each
 * action-shaped string (`'family.action'`) in an `insert into
 * public.audit_log` statement, comments left out. Strings in its details
 * count too, which can only ask more of `private.log_perm`, never less.
 */
export function familiesWritten(sql: string): string[] {
  const code = withoutComments(sql);
  const outsideStrings = withoutComments(sql, true);
  const found = new Set<string>();
  for (const insert of code.matchAll(
    /\binsert\s+into\s+public\.audit_log\b/gi,
  )) {
    const start = insert.index ?? 0;
    if (outsideStrings[start] !== code[start]) continue;
    const semicolon = outsideStrings.indexOf(";", start);
    const statement = code.slice(
      start,
      semicolon === -1 ? code.length : semicolon,
    );
    for (const match of statement.matchAll(ACTION)) {
      if (match[1]) found.add(match[1]);
    }
  }
  return [...found].sort();
}

/** The families a test of an action names: `what ~ '^(a|b)\.'` is a and b. */
function familiesOf(pattern: string): string[] {
  return pattern.replace(/^\(|\)$/g, "").split("|");
}

/** The body of a function's newest version among the migrations, comments left out. */
export function newestBody(name: string): string {
  let body = "";
  const created = new RegExp(
    `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+${name.replace(".", "\\.")}\\s*\\(`,
    "gi",
  );
  for (const file of migrationFiles()) {
    const code = withoutComments(readFileSync(join(MIGRATIONS, file), "utf8"));
    for (const match of code.matchAll(created)) {
      const open = code.indexOf("$$", match.index ?? 0);
      const close = code.indexOf("$$", open + 2);
      if (open !== -1 && close !== -1) body = code.slice(open + 2, close);
    }
  }
  return body;
}

/**
 * `private.log_perm`'s arms, from its body: each family with the permission
 * it is read at, and what it answers for a family none names (null for no
 * `else`).
 */
export function logPermArms(body: string): {
  families: Map<string, string>;
  otherwise: string | null;
} {
  const families = new Map<string, string>();
  const arm =
    /\bwhen\s+what\s*~\s*'\^(\([a-z_|]+\)|[a-z_]+)\\\.'\s+then\s+'([a-z_.]+)'/gi;
  for (const match of body.matchAll(arm)) {
    for (const family of familiesOf(match[1] ?? "")) {
      if (!families.has(family)) families.set(family, match[2] ?? "");
    }
  }
  const otherwise = /\belse\s+'([a-z_.]+)'/i.exec(body)?.[1] ?? null;
  return { families, otherwise };
}

/** The pay families, from `private.is_pay_action`'s body (`what ~ '^(wage|payroll)\.'`). */
export function payFamilies(body: string): string[] {
  const test = /\bwhat\s*~\s*'\^(\([a-z_|]+\)|[a-z_]+)\\\.'/i.exec(body);
  return test?.[1] ? familiesOf(test[1]) : [];
}

/**
 * The parts of `text` split at its top-level commas, from `from` up to the
 * `)` that closes the level it starts in, or to `stop`. `shape` is the same
 * text with its strings blanked, so a comma or a bracket inside one counts
 * for nothing.
 */
function topLevelParts(
  text: string,
  shape: string,
  from: number,
  stop = shape.length,
): { parts: string[]; end: number } {
  const parts: string[] = [];
  let depth = 0;
  let start = from;
  for (let i = from; i < stop; i++) {
    const char = shape[i];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") {
      if (depth === 0) {
        parts.push(text.slice(start, i).trim());
        return { parts, end: i };
      }
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start, stop).trim());
  return { parts, end: stop };
}

/** Where a `select` list ends: its first `from` outside brackets, or `stop`. */
function selectListEnd(shape: string, from: number, stop: number): number {
  let depth = 0;
  for (let i = from; i < stop; i++) {
    const char = shape[i];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (
      depth === 0 &&
      /^from\b/i.test(shape.slice(i, i + 5)) &&
      !/[a-z0-9_]/i.test(shape[i - 1] ?? "")
    ) {
      return i;
    }
  }
  return stop;
}

/** An actor that is nobody: `null`, cast or not. */
const NO_ACTOR = /^null(?:\s*::\s*uuid)?$/i;

/**
 * The actions a migration's text writes to the log with no actor: each
 * `insert into public.audit_log` whose `actor_id` is a literal null, or is
 * left out of its columns (the column's default is null), with the action of
 * each row it writes, every arm of a `case` among them. Comments are left
 * out. An actor held in a variable is never counted: what it holds is the
 * function's business.
 */
export function actorlessActions(sql: string): string[] {
  const code = withoutComments(sql);
  const shape = withoutComments(sql, true);
  const found = new Set<string>();
  const insert = /\binsert\s+into\s+public\.audit_log\s*\(/gi;
  for (const match of shape.matchAll(insert)) {
    const open = (match.index ?? 0) + match[0].length;
    const columns = topLevelParts(code, shape, open);
    const names = columns.parts.map((name) => name.toLowerCase());
    const actorAt = names.indexOf("actor_id");
    const actionAt = names.indexOf("action");
    if (actionAt === -1) continue;
    const semicolon = shape.indexOf(";", columns.end);
    const stop = semicolon === -1 ? shape.length : semicolon;
    const rest = shape.slice(columns.end + 1, stop);
    const rows: string[][] = [];
    const values = /^\s*values\s*\(/i.exec(rest);
    if (values) {
      // Each tuple of `values (…), (…)`, and nothing after the last.
      let tuple = columns.end + values[0].length;
      while (tuple < stop) {
        const row = topLevelParts(code, shape, tuple + 1, stop);
        rows.push(row.parts);
        const next = /^\s*,\s*\(/.exec(shape.slice(row.end + 1, stop));
        if (!next) break;
        tuple = row.end + next[0].length;
      }
    } else {
      // `select a, b, … from …`: the list up to its top-level `from`.
      const select = /^\s*select\b/i.exec(rest);
      if (!select) continue;
      const listStart = columns.end + 1 + select[0].length;
      const listEnd = selectListEnd(shape, listStart, stop);
      rows.push(topLevelParts(code, shape, listStart, listEnd).parts);
    }
    for (const row of rows) {
      const actor = actorAt === -1 ? "null" : (row[actorAt] ?? "");
      if (!NO_ACTOR.test(actor)) continue;
      for (const action of (row[actionAt] ?? "").matchAll(
        /'([a-z_]+(?:\.[a-z_]+)+)'/g,
      )) {
        if (action[1]) found.add(action[1]);
      }
    }
  }
  return [...found].sort();
}

/** Every action the migrations write to the log with no actor. */
export function actorlessInMigrations(): string[] {
  const found = new Set<string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const action of actorlessActions(sql)) found.add(action);
  }
  return [...found].sort();
}

/** Every family the migrations write to the log, with the first file that does. */
export function familiesInMigrations(): Map<string, string> {
  const families = new Map<string, string>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const family of familiesWritten(sql)) {
      if (!families.has(family)) families.set(family, file);
    }
  }
  return families;
}
