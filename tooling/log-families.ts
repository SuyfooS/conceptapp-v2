import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, migrationFiles, withoutComments } from "./role-checks";

/**
 * The activity log is read by area (the roles plan's R7, critique 7): a
 * row's family, `clock` of `clock.in`, names in `private.log_perm` the
 * permission its readers hold besides manage.view, and a family it doesn't
 * name is read by no one through it (it fails closed). The pay rows
 * (`private.is_pay_action`) and documents' have the pay holders' side of the
 * policies instead. So each family a migration writes to the log needs a
 * place in one of them, or its rows show to nobody but pay holders: this
 * reads the families the migrations write and the ones the policies place.
 */

/** Families the log's policies give to the pay holders by a test of their own: documents'. */
export const OWN_SIDE = ["document"] as const;

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
