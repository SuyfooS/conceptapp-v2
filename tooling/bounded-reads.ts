import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PostgREST returns at most `max_rows` (1000, here and on hosted Supabase)
 * rows for one request, and past it cuts a read short with no error (bigger
 * teams, the first fixes; `@db/pages`). So in packages/db a read of a table
 * that grows with time or with everyone who ever joined, and every call of a
 * function that answers rows (`rowFunctions`: PostgREST cuts those the same
 * way), pages (`allPages`, `readAllPages`, `allPagesIn`: each asks with
 * `.range(`), asks for a few rows (`.limit(`, `.single()`, `.maybeSingle()`,
 * `head: true`), or says on its `.from(` or `.rpc(` line or one of the two
 * above why it can't pass the cap (`// bounded: …`). This finds the reads
 * that do none of these.
 */

/** Tables whose rows grow per person or per day. */
export const GROWING_TABLES: readonly string[] = [
  "memberships",
  "member_names",
  "member_wages",
  "member_payroll_details",
  "employment_periods",
  "invites",
  "department_members",
  "time_entries",
  "time_breaks",
  "absences",
  "audit_log",
  "documents",
  "document_recipients",
  "notifications",
  "chat_messages",
  "chat_acks",
  "lists",
  "list_items",
  "list_people",
  "list_templates",
  "list_template_items",
  "list_schedules",
  "list_item_changes",
  "list_reopens",
  "list_passes",
  "availability_submissions",
  "shift_swaps",
  "schedule_shifts",
  "profiles",
];

/** Files the task kept out, each with why: they are known issues. */
export const KEPT_OUT: Record<string, string> = {
  "packages/db/employee-files.ts":
    "the hiring file, kept out of the first fixes (ROADMAP's known issues)",
};

/** A read that can pass the cap: its line (from 1) and its table or function. */
export type UnboundedRead = { line: number; table: string };

const TABLE_READ = /\.from\(\s*"([a-z_]+)"\s*\)/g;
/** A call of a database function, its name maybe on the line after `.rpc(`. */
const FUNCTION_CALL = /\.rpc\(\s*"([a-z_0-9]+)"/g;
/**
 * Where a read's chain ends: the next `.from(` (not Array's or Buffer's) or
 * `.rpc(`, or the end of its top-level function (a line starting with `}`).
 */
const NEXT_READ = /(?<!Array|Buffer)\.from\(|\.rpc\(/;
const BOUNDS = [
  ".range(",
  ".limit(",
  ".single()",
  ".maybeSingle()",
  "head: true",
];
const MARKER = /\/\/\s*bounded:\s*\S/;
/**
 * A function's answer as rows: of its own columns (`returns table`, `setof` a
 * composite) or of a table (`setof` it). A `setof` a plain value reads in the
 * types as an array does (`string[]`), so those aren't told apart and aren't
 * asked about. On its own line or the entry's last on one line.
 */
const ROWS = /Returns: (\{[^}]*\}|Database\[[^;\n]*\]\["Row"\])\[\](;|\s*\})/;

/** Whether the `.from(` at `at` on line `index` is Storage's (`storage.from(`, maybe across a line). */
function onStorage(lines: readonly string[], index: number, at: number) {
  const before = (lines[index] ?? "").slice(0, at).trimEnd();
  if (before.endsWith("storage")) return true;
  if (before !== "") return false;
  return (lines[index - 1] ?? "").trimEnd().endsWith("storage");
}

/** The functions in database.types.ts (`types`) that answer rows, by name. */
export function rowFunctions(types: string): string[] {
  const names: string[] = [];
  const sections = types.replace(/\r\n/g, "\n").split(/^ {4}Functions: \{$/m);
  for (const section of sections.slice(1)) {
    // To the section's own closing line, at its depth.
    const body = section.split(/^ {4}\S/m)[0] ?? "";
    for (const entry of body.split(/^(?= {6}[a-z_0-9]+:)/m)) {
      const name = /^ {6}([a-z_0-9]+):/.exec(entry)?.[1];
      if (name && ROWS.test(entry)) names.push(name);
    }
  }
  return names;
}

/** A read's chain: line `index` from `at`, and the lines after it to the chain's end. */
function chainFrom(lines: readonly string[], index: number, at: number) {
  const segment = [(lines[index] ?? "").slice(at)];
  for (const line of lines.slice(index + 1)) {
    if (NEXT_READ.test(line) || line.startsWith("}")) break;
    segment.push(line);
  }
  return segment.join("\n");
}

/** Whether line `index` or one of the two above it says why its read is bounded. */
function saysWhy(lines: readonly string[], index: number) {
  return lines
    .slice(Math.max(0, index - 2), index + 1)
    .some((line) => MARKER.test(line));
}

/** The line (from 0) and column of `offset` in `source`. */
function placeOf(source: string, offset: number) {
  const before = source.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, column: offset - (before.lastIndexOf("\n") + 1) };
}

/**
 * The reads in `source` that neither page nor say why not: of the growing
 * tables, and calls of `functions` (from `rowFunctions`).
 */
export function unboundedReads(
  source: string,
  functions: readonly string[] = [],
): UnboundedRead[] {
  const lines = source.split("\n");
  const found: UnboundedRead[] = [];
  lines.forEach((text, index) => {
    for (const match of text.matchAll(TABLE_READ)) {
      const table = match[1] ?? "";
      if (!GROWING_TABLES.includes(table)) continue;
      if (onStorage(lines, index, match.index)) continue;
      const chain = chainFrom(lines, index, match.index + match[0].length);
      if (!chain.includes(".select(")) continue;
      if (BOUNDS.some((bound) => chain.includes(bound))) continue;
      if (saysWhy(lines, index)) continue;
      found.push({ line: index + 1, table });
    }
  });
  // Over the whole source, as a call's name often goes on the next line.
  for (const match of source.matchAll(FUNCTION_CALL)) {
    const name = match[1] ?? "";
    if (!functions.includes(name)) continue;
    const call = placeOf(source, match.index).line;
    const end = placeOf(source, match.index + match[0].length);
    const chain = chainFrom(lines, end.line, end.column);
    if (BOUNDS.some((bound) => chain.includes(bound))) continue;
    if (saysWhy(lines, call)) continue;
    found.push({ line: call + 1, table: name });
  }
  return found.sort((a, b) => a.line - b.line);
}

/** Every unbounded read in packages/db, as `file:line (table or function)`. */
export function unboundedReadViolations(root: string): string[] {
  const dir = join(root, "packages", "db");
  const functions = rowFunctions(
    readFileSync(join(dir, "database.types.ts"), "utf8"),
  );
  return readdirSync(dir)
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        !name.endsWith(".test.ts") &&
        name !== "database.types.ts",
    )
    .map((name) => `packages/db/${name}`)
    .filter((path) => !(path in KEPT_OUT))
    .flatMap((path) =>
      unboundedReads(readFileSync(join(root, path), "utf8"), functions).map(
        (read) => `${path}:${read.line} (${read.table})`,
      ),
    );
}
