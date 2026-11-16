import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Who may do what moves from the role (owner, manager, worker) to the
 * permission an area's key gives (roles and permissions, step 4b; the roles
 * plan's guard, in R1). A rule written by rank in a new migration would undo
 * that move, so this finds, in SQL, the five ways a rule names managers by
 * rank: `has_role(`, `role in ('owner', 'manager')`, `is_viewing(…,
 * 'manager')`, `members_in(…, '{owner,manager}')` (or its array) and a
 * notification's audience, `notify(…, 'manager')` (its seventh argument or
 * `audience =>`), which the notifications' read policy checks by rank unless
 * the line is for those who hold a permission (`holders_of =>`, its
 * thirteenth argument, from the roles plan's R3), which it checks instead. A new
 * migration may use them only inside a function or policy that `FIXED` or
 * `NOT_YET_MOVED` names: rules that stay by role for good, and those of the
 * areas the plan has yet to move, which shrink as each area's phase moves its
 * own. An owner-only rule (`has_role(…, 'owner')`) stays by role and needs no
 * entry; pay is a permission already (`clock.payroll`), so none of its rules
 * is written these ways.
 */

export const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

/** The guard's own migration: the migrations after it are checked. */
export const CHECKED_AFTER = "20261115000700";

/** Rules that stay by role for good, each with why. */
export const FIXED: Record<string, string> = {
  'policy "people read their own notifications" on public.notifications':
    "a line's audience is a rank (audience_role) for lines no permission addresses (audience_perm, since R3)",
};

/**
 * The rules by role of the areas the plan has yet to move, each with the
 * phase that moves it. A phase takes out the entries it moves: the test fails
 * while an entry names a function or policy with no such rule left in its
 * newest version, and while one with a rule left isn't named here.
 */
export const NOT_YET_MOVED: Record<string, string> = {
  // Time clock (R4) and team (R6), beside scheduling's lines, which R3 moved.
  "private.notify_for": "R4 and R6: clock.confirm and team.joined, by area",
  "private.run_business_reminders": "R4: clock.overdue, by area",
  // Time clock (R4).
  "private.can_edit_clock": "R4: who corrects and confirms hours",
  "private.seed_demo_hours":
    "R4: the demo's correction is made by someone who may correct",
  'policy "people read their own entries, managers and pay holders the business\'s" on public.time_entries':
    "R4: the team's hours, to the clock's editors",
  'policy "breaks are read like the entries they belong to" on public.time_breaks':
    "R4: the team's breaks, to the clock's editors",
  'policy "managers read the business\'s stations" on public.clock_stations':
    "R4: the clock's stations, to its editors",
  // Lists (R5).
  "private.can_manage_lists": "R5: who edits templates and every list",
  "private.can_send_lists": "R5: who sends lists",
  "private.list_managers": "R5: who hears of late lists",
  "private.sees_list": "R5: who reads every list",
  "private.can_read_list_photo": "R5: who reads a list's photos",
  "private.seed_demo_lists":
    "R5: the demo's lists are sent by someone who may send them",
  'policy "members read their business\'s list templates" on public.list_templates':
    "R5: every template, to the lists' editors",
  'policy "list managers read the schedules" on public.list_schedules':
    "R5: the lists' times, to their editors",
  'policy "people read the lists they see" on public.lists':
    "R5: every list, to a view at lists edit",
  // Team (R6).
  "public.team_phones": "R6: everyone's numbers, to the team's viewers",
  "public.team_youth":
    "R6: minors' details, to the team's viewers and the schedule's builders (critique 14); only the team screen reads them",
  'policy "managers read their business\'s invites" on public.invites':
    "R6: invites, to the team's viewers",
  'policy "the team reads invites when viewing as a manager" on public.invites':
    "R6: invites, to a view at team view",
};

/** Where a check sits: a function's or a policy's name, or the file's top level. */
export type RoleCheck = { line: number; check: string; where: string };

/**
 * The text with its comments blanked, offsets kept; strings stay (the checks
 * name roles in them) unless `strings` blanks them too.
 */
export function withoutComments(sql: string, strings = false): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      const literal = sql.slice(i, j + 1);
      out += strings ? literal.replace(/[^\n]/g, " ") : literal;
      i = j + 1;
    } else if (sql[i] === '"') {
      // A quoted name (a policy's, which may hold an apostrophe), as it is.
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/**
 * The arguments of the call whose `(` is at `open`, split at its top-level
 * commas: none inside a nested call or an array's brackets.
 */
function callArguments(code: string, open: number): string[] {
  const args: string[] = [];
  let parens = 0;
  let brackets = 0;
  let quoted = false;
  let start = open + 1;
  for (let i = open; i < code.length; i++) {
    const char = code[i];
    if (char === "'") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") parens += 1;
    else if (char === "[") brackets += 1;
    else if (char === "]") brackets -= 1;
    else if (char === ")") {
      parens -= 1;
      if (parens === 0) {
        args.push(code.slice(start, i).trim());
        return args;
      }
    } else if (char === "," && parens === 1 && brackets === 0) {
      args.push(code.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

/** A role named in SQL, with or without its cast. */
const role = (name: string) => `'${name}'(?:::public\\.member_role)?`;
const MANAGER = new RegExp(`^${role("manager")}$`, "i");
const OWNER = new RegExp(`^${role("owner")}$`, "i");
const OWNER_AND_MANAGER = new RegExp(
  `'\\{\\s*(?:owner\\s*,\\s*manager|manager\\s*,\\s*owner)\\s*\\}'|array\\s*\\[\\s*(?:${role("owner")}\\s*,\\s*${role("manager")}|${role("manager")}\\s*,\\s*${role("owner")})`,
  "i",
);
const ROLE_IN =
  /\brole\s+in\s*\(\s*'(owner|manager)'(?:::public\.member_role)?\s*,\s*'(owner|manager)'(?:::public\.member_role)?\s*\)/gi;
/** A named argument of a call, `audience => …` or `audience := …`. */
const AUDIENCE = /^audience\s*(?:=>|:=)\s*/i;
/** A line for those who hold a permission, `holders_of => …`. */
const HOLDERS = /^holders_of\s*(?:=>|:=)\s*/i;
/** Any named argument of a call. */
const NAMED = /^[a-z_][a-z0-9_]*\s*(?:=>|:=)/i;
/** A call, not the function's own name where it is created, dropped or granted. */
const call = (name: string) =>
  new RegExp(
    `(?<!function\\s+(?:if\\s+exists\\s+)?(?:private\\.|public\\.)?)\\b${name}\\s*\\(`,
    "gi",
  );

/** Each check by rank in `code` (comments blanked), where it starts; none inside a string. */
function checksIn(code: string): { at: number; check: string }[] {
  const outsideStrings = withoutComments(code, true);
  const found: { at: number; check: string }[] = [];
  for (const match of code.matchAll(call("has_role"))) {
    const at = match.index ?? 0;
    const args = callArguments(code, at + match[0].length - 1);
    // An owner-only rule stays by role for good (the plan's "never data").
    if (!OWNER.test(args[1] ?? "")) found.push({ at, check: "has_role(" });
  }
  for (const match of code.matchAll(ROLE_IN)) {
    if (match[1]?.toLowerCase() !== match[2]?.toLowerCase()) {
      found.push({
        at: match.index ?? 0,
        check: "role in ('owner', 'manager')",
      });
    }
  }
  for (const match of code.matchAll(call("is_viewing"))) {
    const at = match.index ?? 0;
    const args = callArguments(code, at + match[0].length - 1);
    if (MANAGER.test(args[1] ?? "")) {
      found.push({ at, check: "is_viewing(…, 'manager')" });
    }
  }
  for (const match of code.matchAll(call("members_in"))) {
    const at = match.index ?? 0;
    const args = callArguments(code, at + match[0].length - 1);
    if (args.slice(1).some((arg) => OWNER_AND_MANAGER.test(arg))) {
      found.push({ at, check: "members_in(…, '{owner,manager}')" });
    }
  }
  // A line's audience (private.notify's seventh argument): the read policy
  // shows it only to those at that rank or above, unless the line is for
  // those who hold a permission (its thirteenth, `holders_of`), which the
  // policy asks instead.
  for (const match of code.matchAll(call("notify"))) {
    const at = match.index ?? 0;
    const args = callArguments(code, at + match[0].length - 1);
    const holders = args.find((arg) => HOLDERS.test(arg));
    // Named arguments come last: the thirteenth by position is before them.
    const positional = args.filter((arg) => !NAMED.test(arg));
    const perm = holders ? holders.replace(HOLDERS, "") : positional[12];
    if (perm !== undefined && !/^null\b/i.test(perm)) continue;
    const named = args.find((arg) => AUDIENCE.test(arg));
    const audience = named ? named.replace(AUDIENCE, "") : args[6];
    if (MANAGER.test(audience ?? "")) {
      found.push({ at, check: "notify(…, audience 'manager')" });
    }
  }
  return found
    .filter(({ at }) => outsideStrings[at] === code[at])
    .sort((a, b) => a.at - b.at);
}

/** The functions and policies `code` creates, by name, with where each starts and ends. */
function objectsIn(
  code: string,
): { name: string; start: number; end: number }[] {
  const objects: { name: string; start: number; end: number }[] = [];
  const outsideStrings = withoutComments(code, true);
  const fn =
    /\bcreate\s+(?:or\s+replace\s+)?function\s+([a-z_]+\.[a-z_]+)\s*\(/gi;
  for (const match of code.matchAll(fn)) {
    const start = match.index ?? 0;
    // The body, from its `as $tag$` to the same tag again (`$$`, `$fn$`…),
    // opened before the statement's first `;`; a body that isn't
    // dollar-quoted ends with its statement.
    const semicolon = outsideStrings.indexOf(";", start);
    let end = semicolon === -1 ? code.length : semicolon + 1;
    const body = /\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)/gi;
    body.lastIndex = start;
    const opened = body.exec(code);
    if (opened?.[1] && opened.index < end) {
      const tag = opened[1];
      const close = code.indexOf(tag, opened.index + opened[0].length);
      end = close === -1 ? code.length : close + tag.length;
    }
    objects.push({ name: (match[1] ?? "").toLowerCase(), start, end });
  }
  const policy =
    /\b(?:create|alter)\s+policy\s+"([^"]+)"\s+on\s+([a-z_]+\.[a-z_]+)/gi;
  for (const match of code.matchAll(policy)) {
    const start = match.index ?? 0;
    const close = code.indexOf(";", start);
    const end = close === -1 ? code.length : close + 1;
    objects.push({
      name: `policy "${match[1]}" on ${(match[2] ?? "").toLowerCase()}`,
      start,
      end,
    });
  }
  return objects;
}

/** Every check by rank in a migration's text, each with the function or policy it is in. */
export function roleChecks(sql: string): RoleCheck[] {
  const code = withoutComments(sql);
  const objects = objectsIn(code);
  return checksIn(code).map(({ at, check }) => ({
    line: code.slice(0, at).split("\n").length,
    check,
    where:
      objects.find((object) => object.start <= at && at < object.end)?.name ??
      "top level",
  }));
}

/** A migration's file name and text. */
export type Migration = { name: string; sql: string };

/** What may still hold a rule by rank: `FIXED` and `NOT_YET_MOVED`, by name. */
export const ALLOWED: ReadonlySet<string> = new Set([
  ...Object.keys(FIXED),
  ...Object.keys(NOT_YET_MOVED),
]);

/**
 * Each rule by rank written in a migration after the guard's own
 * (`CHECKED_AFTER`) outside a function or policy `allowed` names, as
 * `file:line check in where`.
 */
export function violations(
  migrations: readonly Migration[],
  allowed: ReadonlySet<string> = ALLOWED,
): string[] {
  return migrations
    .filter(({ name }) => name.slice(0, CHECKED_AFTER.length) > CHECKED_AFTER)
    .flatMap(({ name, sql }) =>
      roleChecks(sql)
        .filter((check) => !allowed.has(check.where))
        .map(
          (check) => `${name}:${check.line} ${check.check} in ${check.where}`,
        ),
    );
}

/** The migrations, oldest first. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * Each function's and policy's newest version among the migrations, by name,
 * with the checks by rank it holds; dropped ones go.
 */
export function newestChecks(): Map<string, RoleCheck[]> {
  const newest = new Map<string, RoleCheck[]>();
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const code = withoutComments(sql);
    const dropped =
      /\bdrop\s+(?:function|policy)\s+(?:if\s+exists\s+)?(?:"([^"]+)"\s+on\s+([a-z_]+\.[a-z_]+)|([a-z_]+\.[a-z_]+))/gi;
    const events: { at: number; name: string; checks: RoleCheck[] | null }[] =
      [];
    for (const match of code.matchAll(dropped)) {
      const name = match[3]
        ? match[3].toLowerCase()
        : `policy "${match[1]}" on ${(match[2] ?? "").toLowerCase()}`;
      events.push({ at: match.index ?? 0, name, checks: null });
    }
    const checks = roleChecks(sql);
    for (const object of objectsIn(code)) {
      const startLine = code.slice(0, object.start).split("\n").length;
      const endLine = code.slice(0, object.end).split("\n").length;
      events.push({
        at: object.start,
        name: object.name,
        checks: checks.filter(
          (c) =>
            c.where === object.name && c.line >= startLine && c.line <= endLine,
        ),
      });
    }
    for (const event of events.sort((a, b) => a.at - b.at)) {
      if (event.checks === null) newest.delete(event.name);
      else newest.set(event.name, event.checks);
    }
  }
  return newest;
}
