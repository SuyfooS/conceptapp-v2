import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The workflows in .github/workflows read as text, as the checks that hold
 * them need (tooling/migrate-prod.test.ts, tooling/demo-door.test.ts): the
 * blocks under a key, a job's steps and a step's name. Only for the shape
 * these files have, two spaces a level and steps as `- ` entries; not a YAML
 * parser.
 */

const root = join(__dirname, "..");

/** A file of the repo, with Windows line ends made plain. */
export function readRepoFile(path: string): string {
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

/** The workflow without its whole-line comments: what GitHub runs. */
export function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

export type Block = { key: string; body: string };

/** The keys at `indent` spaces in `text`, each with the lines under it. */
export function blocks(text: string, indent: number): Block[] {
  const head = new RegExp(`^ {${indent}}([A-Za-z0-9_-]+):`);
  const deeper = new RegExp(`^ {${indent + 1},}\\S`);
  const found: Block[] = [];
  let open = false;
  for (const line of text.split("\n")) {
    const key = head.exec(line)?.[1];
    const last = found.at(-1);
    if (key) {
      found.push({ key, body: `${line}\n` });
      open = true;
    } else if (open && last && (deeper.test(line) || /^\s*$/.test(line))) {
      last.body += `${line}\n`;
    } else {
      open = false;
    }
  }
  return found;
}

/** The top-level block `key` of a workflow, comments left out, or "". */
export function topLevel(text: string, key: string): string {
  return (
    blocks(withoutComments(text), 0).find((b) => b.key === key)?.body ?? ""
  );
}

/** A workflow's jobs, by their ids. */
export function jobs(text: string): Block[] {
  return blocks(topLevel(text, "jobs"), 2);
}

/** A job's steps, each the lines of one `- ` entry under `steps:`. */
export function steps(job: string): string[] {
  const found: string[] = [];
  let open = false;
  for (const line of job.split("\n")) {
    if (/^ {6}- /.test(line)) {
      found.push(`${line}\n`);
      open = true;
    } else if (open && (/^ {8,}\S/.test(line) || /^\s*$/.test(line))) {
      found[found.length - 1] += `${line}\n`;
    } else {
      open = false;
    }
  }
  return found;
}

/** A step's `name:`, or undefined for one without. */
export function stepName(step: string): string | undefined {
  return (
    /^ {6}- name: (.+)$/m.exec(step)?.[1] ?? /^ {8}name: (.+)$/m.exec(step)?.[1]
  );
}
