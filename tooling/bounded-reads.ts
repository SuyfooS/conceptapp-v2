import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PostgREST returns at most `max_rows` (1000, here and on hosted Supabase)
 * rows for one request, and past it cuts a read short with no error (bigger
 * teams, the first fixes; `@db/pages`). So in packages/db a read of a table
 * that grows with time or with everyone who ever joined pages
 * (`allPages`, `readAllPages`, `allPagesIn`: each asks with `.range(`), asks
 * for a few rows (`.limit(`, `.single()`, `.maybeSingle()`, `head: true`),
 * or says on its `.from(` line or one of the two above why it can't pass the
 * cap (`// bounded: …`). This finds the reads that do none of these.
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
  "packages/db/order-taking.ts":
    "taking orders is a restaurant's module, kept out of the first fixes (ROADMAP's known issues)",
  "packages/db/orders.ts":
    "taking orders is a restaurant's module, kept out of the first fixes (ROADMAP's known issues)",
  "packages/db/order-stations.ts":
    "taking orders is a restaurant's module, kept out of the first fixes (ROADMAP's known issues)",
  "packages/db/employee-files.ts":
    "the hiring file, kept out of the first fixes (ROADMAP's known issues)",
};

/** A read that can pass the cap: its line (from 1) and its table. */
export type UnboundedRead = { line: number; table: string };

const TABLE_READ = /\.from\(\s*"([a-z_]+)"\s*\)/g;
/**
 * Where a read's chain ends: the next `.from(` (not Array's or Buffer's), or
 * the end of its top-level function (a line starting with `}`).
 */
const NEXT_FROM = /(?<!Array|Buffer)\.from\(/;
const BOUNDS = [
  ".range(",
  ".limit(",
  ".single()",
  ".maybeSingle()",
  "head: true",
];
const MARKER = /\/\/\s*bounded:\s*\S/;

/** Whether the `.from(` at `at` on line `index` is Storage's (`storage.from(`, maybe across a line). */
function onStorage(lines: readonly string[], index: number, at: number) {
  const before = (lines[index] ?? "").slice(0, at).trimEnd();
  if (before.endsWith("storage")) return true;
  if (before !== "") return false;
  return (lines[index - 1] ?? "").trimEnd().endsWith("storage");
}

/** The reads of growing tables in `source` that neither page nor say why not. */
export function unboundedReads(source: string): UnboundedRead[] {
  const lines = source.split("\n");
  const found: UnboundedRead[] = [];
  lines.forEach((text, index) => {
    for (const match of text.matchAll(TABLE_READ)) {
      const table = match[1] ?? "";
      if (!GROWING_TABLES.includes(table)) continue;
      if (onStorage(lines, index, match.index)) continue;
      const after = text.slice(match.index + match[0].length);
      const segment = [after];
      for (const line of lines.slice(index + 1)) {
        if (NEXT_FROM.test(line) || line.startsWith("}")) break;
        segment.push(line);
      }
      const chain = segment.join("\n");
      if (!chain.includes(".select(")) continue;
      if (BOUNDS.some((bound) => chain.includes(bound))) continue;
      const said = lines
        .slice(Math.max(0, index - 2), index + 1)
        .some((line) => MARKER.test(line));
      if (said) continue;
      found.push({ line: index + 1, table });
    }
  });
  return found;
}

/** Every unbounded read in packages/db, as `file:line (table)`. */
export function unboundedReadViolations(root: string): string[] {
  const dir = join(root, "packages", "db");
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
      unboundedReads(readFileSync(join(root, path), "utf8")).map(
        (read) => `${path}:${read.line} (${read.table})`,
      ),
    );
}
