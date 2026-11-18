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
 * thirteenth argument, from the roles plan's R3), which it checks instead. A
 * new migration may use them only inside a function or policy that `FIXED`
 * or `NOT_YET_MOVED` names: rules that stay by role for good, and those of
 * the areas the plan has yet to move, which shrink as each area's phase moves
 * its own. Only the version that runs counts (from the roles plan's R4): a
 * rule goes once a later migration replaces its function (the same name and
 * input types) or drops it, or rewrites the part of its policy it is in
 * (`using`, `with check`), and it follows its function or policy through a
 * rename or a move to another schema. An owner-only rule (`has_role(…,
 * 'owner')`) stays by role and needs no entry; pay is a permission already
 * (`clock.payroll`), so none of its rules is written these ways.
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
  // None left: scheduling moved in R3, the time clock in R4, lists in R5,
  // the team (private.notify_for's last line among them) in R6 and the
  // management page in R7.
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

/** Where each check by rank in `code` (comments blanked) starts, with its line. */
function located(code: string): { at: number; line: number; check: string }[] {
  return checksIn(code).map(({ at, check }) => ({
    at,
    line: code.slice(0, at).split("\n").length,
    check,
  }));
}

/** Where the `)` that closes the `(` at `open` is; strings skipped. */
function closingParen(code: string, open: number): number {
  let depth = 0;
  let quoted = false;
  for (let i = open; i < code.length; i++) {
    const char = code[i];
    if (char === "'") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return code.length;
}

/** A name in SQL, and one with its schema. */
const NAME = "[a-z_][a-z0-9_]*";
const QUALIFIED = `${NAME}\\.${NAME}`;

/**
 * A name as Postgres keeps it: at most 63 bytes (NAMEDATALEN - 1), cut at a
 * character, so a longer one and its first 63 bytes are the same policy.
 */
function storedName(name: string): string {
  const encoder = new TextEncoder();
  let kept = "";
  let bytes = 0;
  for (const char of name) {
    bytes += encoder.encode(char).length;
    if (bytes > 63) break;
    kept += char;
  }
  return kept;
}

/** A policy as `where` names it: its stored name and its table. */
const policyName = (name: string, table: string) =>
  `policy "${storedName(name)}" on ${table.toLowerCase()}`;

/** Each way of writing a built-in type, by the name Postgres gives it. */
const TYPE_NAMES: Record<string, string> = {
  int: "integer",
  int4: "integer",
  int2: "smallint",
  int8: "bigint",
  bool: "boolean",
  float4: "real",
  float8: "double precision",
  decimal: "numeric",
  varchar: "character varying",
  char: "character",
  timestamptz: "timestamp with time zone",
  timestamp: "timestamp without time zone",
  timetz: "time with time zone",
  time: "time without time zone",
};

/** A type of more than one word, written without a parameter's name before it. */
const BARE_TYPE =
  /^(?:double precision|character varying|bit varying|(?:timestamp|time) with(?:out)? time zone)\b/;

/**
 * A function's input types, as its identity has them: each parameter's
 * name, default and modifier (`numeric(10, 2)`) left out, OUT parameters
 * too, the schema of a type in `public` or `pg_catalog` dropped, and each
 * built-in type by one name.
 */
function inputTypes(params: readonly string[]): string {
  const types: string[] = [];
  for (const param of params) {
    let type = param
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/ ?(?:\bdefault\b|=)[\s\S]*$/, "")
      .replace(/ ?\([\d ,]*\)/g, "")
      .replace(/ ?\[ ?\d* ?\]/g, "[]")
      .trim();
    if (type === "") continue;
    const mode = /^(in|out|inout|variadic) /.exec(type);
    if (mode?.[1] === "out") continue;
    if (mode) type = type.slice(mode[0].length);
    if (!BARE_TYPE.test(type) && type.includes(" ")) {
      type = type.slice(type.indexOf(" ") + 1);
    }
    const dims = (type.match(/\[\]/g) ?? []).length;
    const base = type
      .replace(/\[\]/g, "")
      .replace(/^(?:public|pg_catalog)\./, "");
    types.push((TYPE_NAMES[base] ?? base) + "[]".repeat(dims));
  }
  return types.join(",");
}

/** A part of a function or policy: a function's body, a policy's `using` or its `with check`. */
type Part = "body" | "using" | "check";

/** A statement that creates, changes, renames or moves a function or policy. */
type Statement = {
  kind: "function" | "policy";
  start: number;
  end: number;
  /** As `where` names it: the function, or the policy and its table. */
  name: string;
  /** Who it is to Postgres: a function by its name and input types, a policy by its stored name and table. */
  key: string;
  /** The parts it writes anew: all of a function or of a new policy, an `alter policy`'s `using` and `with check` when it has them. */
  writes: Part[];
  /** A policy's `with check`, where it is: the checks there are that part's, the others the `using`'s. */
  withCheck?: [number, number];
  /** Renamed, or moved to another schema: who it is from then on. */
  becomes?: { name: string; key: string };
};

/** The statements in `code` (comments blanked) that write, rename or move a function or policy, in order. */
function statementsIn(code: string): Statement[] {
  const statements: Statement[] = [];
  const outsideStrings = withoutComments(code, true);
  const inString = (at: number) => outsideStrings[at] !== code[at];

  const fn = new RegExp(
    `\\b(create(?:\\s+or\\s+replace)?|alter)\\s+function\\s+(${QUALIFIED})\\s*\\(`,
    "gi",
  );
  for (const match of code.matchAll(fn)) {
    const start = match.index ?? 0;
    if (inString(start)) continue;
    const name = (match[2] ?? "").toLowerCase();
    const open = start + match[0].length - 1;
    const close = closingParen(outsideStrings, open);
    const key = `${name}(${inputTypes(callArguments(code, open))})`;
    const semicolon = outsideStrings.indexOf(";", close);
    let end = semicolon === -1 ? code.length : semicolon + 1;
    if (/^create/i.test(match[1] ?? "")) {
      // The body, from its `as $tag$` to the same tag again (`$$`, `$fn$`…),
      // opened before the statement's first `;`; a body that isn't
      // dollar-quoted ends with its statement.
      const body = /\bas\s+(\$(?:[a-z_][a-z0-9_]*)?\$)/gi;
      body.lastIndex = close;
      const opened = body.exec(code);
      if (opened?.[1] && opened.index < end) {
        const tag = opened[1];
        const closed = code.indexOf(tag, opened.index + opened[0].length);
        end = closed === -1 ? code.length : closed + tag.length;
      }
      statements.push({
        kind: "function",
        start,
        end,
        name,
        key,
        writes: ["body"],
      });
      continue;
    }
    // `alter function`: only a rename or a new schema changes who it is.
    const rest = outsideStrings.slice(close + 1, end);
    const renamed = new RegExp(`^\\s*rename\\s+to\\s+(${NAME})`, "i").exec(
      rest,
    );
    const moved = new RegExp(`^\\s*set\\s+schema\\s+(${NAME})`, "i").exec(rest);
    const [schema, base] = name.split(".");
    const to = renamed?.[1]
      ? `${schema}.${renamed[1].toLowerCase()}`
      : moved?.[1]
        ? `${moved[1].toLowerCase()}.${base}`
        : null;
    statements.push({
      kind: "function",
      start,
      end,
      name,
      key,
      writes: [],
      ...(to
        ? { becomes: { name: to, key: to + key.slice(name.length) } }
        : {}),
    });
  }

  const policy = new RegExp(
    `\\b(create|alter)\\s+policy\\s+"([^"]+)"\\s+on\\s+(${QUALIFIED})`,
    "gi",
  );
  for (const match of code.matchAll(policy)) {
    const start = match.index ?? 0;
    if (inString(start)) continue;
    const table = match[3] ?? "";
    const name = policyName(match[2] ?? "", table);
    const after = start + match[0].length;
    const semicolon = outsideStrings.indexOf(";", after);
    const end = semicolon === -1 ? code.length : semicolon + 1;
    const rest = outsideStrings.slice(after, end);
    const clause = (pattern: RegExp): [number, number] | undefined => {
      const found = pattern.exec(rest);
      if (!found) return undefined;
      const open = after + found.index + found[0].length - 1;
      return [open, closingParen(outsideStrings, open) + 1];
    };
    const using = clause(/\busing\s*\(/i);
    const withCheck = clause(/\bwith\s+check\s*\(/i);
    const renamed = /^\s*rename\s+to\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i.exec(
      rest,
    );
    const writes: Part[] =
      (match[1] ?? "").toLowerCase() === "create"
        ? ["using", "check"]
        : [
            ...(using ? (["using"] as const) : []),
            ...(withCheck ? (["check"] as const) : []),
          ];
    const to = renamed
      ? policyName(renamed[1] ?? renamed[2] ?? "", table)
      : null;
    statements.push({
      kind: "policy",
      start,
      end,
      name,
      key: name,
      writes,
      ...(withCheck ? { withCheck } : {}),
      ...(to ? { becomes: { name: to, key: to } } : {}),
    });
  }
  return statements;
}

/** Every check by rank in a migration's text, each with the function or policy it is in. */
export function roleChecks(sql: string): RoleCheck[] {
  const code = withoutComments(sql);
  const statements = statementsIn(code);
  return located(code).map(({ at, line, check }) => ({
    line,
    check,
    where:
      statements.find(
        (statement) => statement.start <= at && at < statement.end,
      )?.name ?? "top level",
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
 * A function or policy a migration drops: a function by its name and input
 * types, or every one of that name when it gives none; a policy by its
 * stored name and table.
 */
type Drop = { at: number; name: string; key: string | null };

/** The functions and policies `code` (comments blanked) drops, in order. */
function dropsIn(code: string): Drop[] {
  const outsideStrings = withoutComments(code, true);
  const drops: Drop[] = [];
  const policy = new RegExp(
    `\\bdrop\\s+policy\\s+(?:if\\s+exists\\s+)?"([^"]+)"\\s+on\\s+(${QUALIFIED})`,
    "gi",
  );
  for (const match of code.matchAll(policy)) {
    const at = match.index ?? 0;
    if (outsideStrings[at] !== code[at]) continue;
    const name = policyName(match[1] ?? "", match[2] ?? "");
    drops.push({ at, name, key: name });
  }
  // `drop function a(…), b(…)`: each of the list.
  const item = new RegExp(`^\\s*(${QUALIFIED})\\s*`, "i");
  for (const match of code.matchAll(
    /\bdrop\s+function\s+(?:if\s+exists\s+)?/gi,
  )) {
    const at = match.index ?? 0;
    if (outsideStrings[at] !== code[at]) continue;
    let i = at + match[0].length;
    for (;;) {
      const found = item.exec(code.slice(i));
      if (!found) break;
      const name = (found[1] ?? "").toLowerCase();
      i += found[0].length;
      if (code[i] === "(") {
        drops.push({
          at,
          name,
          key: `${name}(${inputTypes(callArguments(code, i))})`,
        });
        i = closingParen(outsideStrings, i) + 1;
      } else {
        drops.push({ at, name, key: null });
      }
      const comma = /^\s*,/.exec(code.slice(i));
      if (!comma) break;
      i += comma[0].length;
    }
  }
  return drops;
}

/** Which part of `statement` the check at `at` is in. */
function partAt(statement: Statement, at: number): Part {
  if (statement.kind === "function") return "body";
  const [from, to] = statement.withCheck ?? [0, 0];
  return from <= at && at < to ? "check" : "using";
}

/**
 * A function or policy as it runs: what it is called now, and each part's
 * checks by rank with the migration that wrote that part.
 */
type Version = {
  name: string;
  parts: Map<Part, { migration: string; checks: RoleCheck[] }>;
};

/**
 * Each function and policy that runs once `migrations` have, oldest first,
 * by who it is to Postgres: a part a later migration writes again replaces
 * the earlier one, a drop ends it, and a rename or a move takes it along.
 */
function versionsAfter(migrations: readonly Migration[]): Map<string, Version> {
  const live = new Map<string, Version>();
  const ordered = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
  for (const { name: migration, sql } of ordered) {
    const code = withoutComments(sql);
    const checks = located(code);
    const events = [
      ...statementsIn(code).map((statement) => ({
        at: statement.start,
        statement,
      })),
      ...dropsIn(code).map((drop) => ({ at: drop.at, drop })),
    ].sort((a, b) => a.at - b.at);
    for (const event of events) {
      if ("drop" in event) {
        const { drop } = event;
        for (const [key, version] of [...live]) {
          if (
            drop.key === null ? version.name === drop.name : key === drop.key
          ) {
            live.delete(key);
          }
        }
        continue;
      }
      const { statement } = event;
      if (statement.writes.length > 0) {
        const version = live.get(statement.key) ?? {
          name: statement.name,
          parts: new Map(),
        };
        for (const part of statement.writes) {
          version.parts.set(part, {
            migration,
            checks: checks
              .filter(
                ({ at }) =>
                  statement.start <= at &&
                  at < statement.end &&
                  partAt(statement, at) === part,
              )
              .map(({ line, check }) => ({
                line,
                check,
                where: statement.name,
              })),
          });
        }
        live.set(statement.key, version);
      }
      const moving = statement.becomes && live.get(statement.key);
      if (statement.becomes && moving) {
        live.delete(statement.key);
        live.set(statement.becomes.key, {
          name: statement.becomes.name,
          parts: moving.parts,
        });
      }
    }
  }
  return live;
}

/** A migration after the guard's own, whose rules by rank are checked. */
const checked = (migration: string) =>
  migration.slice(0, CHECKED_AFTER.length) > CHECKED_AFTER;

/**
 * Each rule by rank written in a migration after the guard's own
 * (`CHECKED_AFTER`) that still runs outside a function or policy `allowed`
 * names, as `file:line check in where`, by file and line: at the top level,
 * or in the version of a function or policy that runs once every migration
 * has, under the name it has then. A version a later migration replaces or
 * drops, or a policy's part it rewrites, is history: an area's phase that
 * replaces a function a phase before it wrote (the clock's R4, over R3's
 * notifiers) leaves that version's rule where it was, and only the version
 * that runs counts. A rename alone or a policy's new roles replace nothing.
 */
export function violations(
  migrations: readonly Migration[],
  allowed: ReadonlySet<string> = ALLOWED,
): string[] {
  const found: { migration: string; line: number; text: string }[] = [];
  for (const { name, sql } of migrations) {
    if (!checked(name)) continue;
    for (const check of roleChecks(sql)) {
      if (check.where !== "top level") continue;
      found.push({
        migration: name,
        line: check.line,
        text: `${name}:${check.line} ${check.check} in top level`,
      });
    }
  }
  for (const version of versionsAfter(migrations).values()) {
    if (allowed.has(version.name)) continue;
    for (const { migration, checks } of version.parts.values()) {
      if (!checked(migration)) continue;
      for (const check of checks) {
        found.push({
          migration,
          line: check.line,
          text: `${migration}:${check.line} ${check.check} in ${version.name}`,
        });
      }
    }
  }
  return found
    .sort((a, b) => a.migration.localeCompare(b.migration) || a.line - b.line)
    .map(({ text }) => text);
}

/** The migrations, oldest first. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * Each function's and policy's version that runs once every migration has,
 * by its name then, with the checks by rank it holds (every overload of a
 * function together); dropped ones go.
 */
export function newestChecks(): Map<string, RoleCheck[]> {
  const migrations = migrationFiles().map((name) => ({
    name,
    sql: readFileSync(join(MIGRATIONS, name), "utf8"),
  }));
  const newest = new Map<string, RoleCheck[]>();
  for (const version of versionsAfter(migrations).values()) {
    const checks = [...version.parts.values()].flatMap((part) =>
      part.checks.map((check) => ({ ...check, where: version.name })),
    );
    newest.set(version.name, [...(newest.get(version.name) ?? []), ...checks]);
  }
  return newest;
}
