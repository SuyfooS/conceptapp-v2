import { readFileSync } from "node:fs";
import { join } from "node:path";
import type postgres from "postgres";

/**
 * The seed's SQL, part by part (./sql/*.sql). A part is a file of steps, each
 * one statement after a `-- step: <name>` line, with no dollar quote and no
 * DO block, so each runs, fails and is timed on its own, and an error names
 * the part, the step and the line. A step reads its rows from `$1` (JSON,
 * sent in chunks when long) and the run's settings with
 * `current_setting('scale.…')`. A step that returns a `problem` column fails
 * with each problem it returns.
 */

export const PARTS = [
  "00-guard",
  "10-people",
  "20-business",
  "30-team",
  "40-weeks",
  "50-hours",
  "60-chat",
  "70-documents",
  "80-lines",
  "90-log",
  "95-waiting",
  "99-counts",
] as const;

export type PartName = (typeof PARTS)[number];

export type Step = {
  name: string;
  /** The line of its `-- step:` marker, 1-based. */
  line: number;
  text: string;
  takesRows: boolean;
};

const STEP = /^-- step: ([a-z_]+)\s*$/;

/** A part's steps, as written. Refuses what would make one step two. */
export function stepsOf(source: string, part: string): Step[] {
  if (source.includes("$$")) throw new Error(`${part}.sql has a dollar quote`);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const steps: Step[] = [];
  let current: { name: string; line: number; body: string[] } | null = null;
  const close = () => {
    if (!current) return;
    const text = current.body.join("\n").trim().replace(/;\s*$/, "");
    if (text === "")
      throw new Error(`${part}.sql, step ${current.name}, is empty`);
    const inner = text
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .some((l) => /;\s*(--.*)?$/.test(l));
    if (inner)
      throw new Error(
        `${part}.sql, step ${current.name}, holds two statements`,
      );
    if (/^do\b/i.test(text))
      throw new Error(`${part}.sql, step ${current.name}, is a DO block`);
    steps.push({
      name: current.name,
      line: current.line,
      text,
      takesRows: /\$1\b/.test(text),
    });
  };
  lines.forEach((line, i) => {
    const marker = STEP.exec(line);
    if (marker) {
      close();
      current = { name: marker[1] ?? "", line: i + 1, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  });
  close();
  const names = steps.map((s) => s.name);
  if (new Set(names).size !== names.length)
    throw new Error(`${part}.sql names a step twice`);
  return steps;
}

export function readPart(part: PartName): Step[] {
  return stepsOf(
    readFileSync(join(__dirname, "sql", `${part}.sql`), "utf8"),
    part,
  );
}

/** Rows a step takes: a list (written in chunks), one value, or nothing to do. */
export type StepRows = readonly unknown[] | Record<string, unknown> | null;

/** Rows a statement takes at once: a few megabytes of JSON. */
const CHUNK = 2000;

export type StepTime = { part: string; step: string; rows: number; ms: number };

type PgError = {
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
  where?: string;
  position?: string;
};

/** The line of the file a character of the step's text is on. */
function lineAt(step: Step, position: number): number {
  const before = step.text.slice(0, Math.max(0, position - 1));
  return step.line + 1 + (before.match(/\n/g)?.length ?? 0);
}

export function stepFailure(part: string, step: Step, error: unknown): Error {
  const e = (error ?? {}) as PgError;
  const where = e.position
    ? `line ${lineAt(step, Number(e.position))} of ${part}.sql`
    : `${part}.sql from line ${step.line}`;
  const lines = [
    `The scale seed stopped in ${part}, step ${step.name} (${where}): ${e.message ?? String(error)}`,
    e.code ? `code ${e.code}` : "",
    e.detail ? `detail: ${e.detail}` : "",
    e.hint ? `hint: ${e.hint}` : "",
    e.where ? `where: ${e.where}` : "",
  ].filter(Boolean);
  return new Error(lines.join("\n  "), { cause: error });
}

/**
 * Runs every step of a part with the rows `data` gives it by name. A step
 * that takes rows and is given none is a mistake in the seed; given an
 * empty list, it has nothing to do.
 */
export async function runPart(
  tx: postgres.TransactionSql,
  part: PartName,
  data: Record<string, StepRows>,
  times: StepTime[] = [],
): Promise<Record<string, Record<string, unknown>[]>> {
  const steps = readPart(part);
  const known = new Set(steps.map((s) => s.name));
  for (const name of Object.keys(data)) {
    if (!known.has(name)) throw new Error(`${part}.sql has no step ${name}`);
  }
  const results: Record<string, Record<string, unknown>[]> = {};
  for (const step of steps) {
    const given = data[step.name];
    if (step.takesRows && given === undefined) {
      throw new Error(`The seed gave ${part}, step ${step.name}, no rows`);
    }
    if (!step.takesRows && given !== undefined && given !== null) {
      throw new Error(`${part}, step ${step.name}, takes no rows`);
    }
    if (given === null || (Array.isArray(given) && given.length === 0))
      continue;
    const chunks: unknown[] = !step.takesRows
      ? [null]
      : Array.isArray(given)
        ? Array.from({ length: Math.ceil(given.length / CHUNK) }, (_, i) =>
            given.slice(i * CHUNK, (i + 1) * CHUNK),
          )
        : [given];
    const started = performance.now();
    const rows: Record<string, unknown>[] = [];
    for (const chunk of chunks) {
      try {
        const result = await tx.unsafe(
          step.text,
          step.takesRows ? [JSON.stringify(chunk)] : [],
        );
        rows.push(...(result as unknown as Record<string, unknown>[]));
      } catch (error) {
        throw stepFailure(part, step, error);
      }
    }
    const problems = rows
      .map((row) => row.problem)
      .filter((p): p is string => typeof p === "string" && p !== "");
    if (problems.length > 0) {
      throw new Error(
        `The scale seed stopped in ${part}, step ${step.name}:\n  ${problems.join("\n  ")}`,
      );
    }
    times.push({
      part,
      step: step.name,
      rows: Array.isArray(given) ? given.length : 1,
      ms: Math.round(performance.now() - started),
    });
    results[step.name] = rows;
  }
  return results;
}
