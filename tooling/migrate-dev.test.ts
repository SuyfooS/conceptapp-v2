import { describe, expect, it } from "vitest";
import {
  blocks,
  jobs,
  readRepoFile,
  stepName,
  steps,
  topLevel,
  withoutComments,
} from "./workflows";

// The workflow that applies migrations to conceptapp-dev, the demo's project
// (supabase/README.md). Read as text, as GitHub reads it: it starts only by
// hand, runs in the GitHub environment conceptapp-dev, which Orel limits to
// main so that only main reaches the database's password (docs/production.md,
// A1), keeps the two secrets in the one step that connects, shows what would
// run before anything changes, and applies or adds the demo only with its
// switch on and from main. Putting it in the environment (closing the pilot,
// PR 10) changed where it runs and nothing it does: its steps, inputs and
// limits are held here as they were.

const dev = readRepoFile(".github/workflows/migrate-dev.yml");
const prod = readRepoFile(".github/workflows/migrate-prod.yml");

const SECRET = /\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g;
/** The secrets a workflow reads, each once, sorted. */
const secretsOf = (text: string) =>
  [...new Set([...text.matchAll(SECRET)].map(([, name = ""]) => name))].sort();
const ENVIRONMENT = /^ {4}environment: (\S+)$/m;
const FROM_MAIN = "github.ref == 'refs/heads/main'";

const allJobs = jobs(dev);
const allSteps = allJobs.flatMap((job) => steps(job.body));

/**
 * A step as the list below names it: its name, or its first line with an
 * action's pinned commit left out, so Dependabot's bumps don't touch it.
 */
const shapeOf = (step: string) =>
  stepName(step) ??
  (step.split("\n")[0] ?? "").trim().replace(/@[0-9a-f]{40}.*$/, "");

describe("Migrate conceptapp-dev", () => {
  it("runs by hand only, with its two switches", () => {
    expect(blocks(topLevel(dev, "on"), 2).map((b) => b.key)).toEqual([
      "workflow_dispatch",
    ]);
    for (const trigger of [
      "push:",
      "pull_request",
      "schedule:",
      "workflow_run",
      "repository_dispatch",
      "workflow_call",
    ]) {
      expect(withoutComments(dev), trigger).not.toContain(trigger);
    }
    const inputs = blocks(topLevel(dev, "on"), 4).find(
      (b) => b.key === "inputs",
    );
    const switches = blocks(inputs?.body ?? "", 6);
    expect(switches.map((b) => b.key)).toEqual(["apply", "demo"]);
    for (const { key, body } of switches) {
      expect(body, key).toMatch(/^ {8}type: boolean$/m);
      expect(body, key).toMatch(/^ {8}default: false$/m);
    }
  });

  it("runs its one job in the environment conceptapp-dev", () => {
    expect(allJobs.map((job) => job.key)).toEqual(["migrate"]);
    for (const job of allJobs) {
      expect(ENVIRONMENT.exec(job.body)?.[1], job.key).toBe("conceptapp-dev");
    }
    // Never production's: its own workflow, environment and approval.
    expect(dev).not.toContain("conceptapp-prod");
    const prodEnvironments = jobs(prod).map(
      ({ body }) => ENVIRONMENT.exec(body)?.[1],
    );
    expect(prodEnvironments).toEqual(["conceptapp-prod"]);
  });

  it("leaves branches to the environment's rule, as before it", () => {
    // No job-level `if`: until Orel limits the environment to main, a run
    // from another branch still shows what would run, as it always did; from
    // then on the environment refuses it before the first step.
    for (const job of allJobs) {
      expect(job.body, job.key).not.toMatch(/^ {4}if:/m);
      expect(job.body, job.key).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
      expect(job.body, job.key).toMatch(/^ {4}timeout-minutes: 10$/m);
    }
    expect(topLevel(dev, "concurrency").trim()).toBe(
      "concurrency:\n  group: migrate-dev\n  cancel-in-progress: false",
    );
  });

  it("does what it did before its environment, step by step", () => {
    expect(allSteps.map(shapeOf)).toEqual([
      "- uses: actions/checkout",
      "- uses: pnpm/action-setup",
      "- uses: actions/setup-node",
      "- run: pnpm install --frozen-lockfile",
      "Find the connection",
      "What the project has now",
      "What would run",
      "Apply",
      "What the project has after",
      "The demo businesses",
    ]);
  });

  it("keeps the two secrets in the step that connects", () => {
    const named = [...dev.matchAll(SECRET)].map(([, name]) => name);
    expect(secretsOf(dev)).toEqual([
      "SUPABASE_DB_PASSWORD",
      "SUPABASE_PROJECT_REF",
    ]);
    let inSteps = 0;
    for (const step of allSteps) {
      const here = [...step.matchAll(SECRET)].length;
      if (here === 0) continue;
      expect(stepName(step)).toBe("Find the connection");
      inSteps += here;
    }
    // None at the job's level or the workflow's, and none handed on.
    expect(inSteps).toBe(named.length);
    expect(dev).not.toContain("secrets: inherit");
    expect(topLevel(dev, "env")).toBe("");
    for (const job of allJobs) {
      expect(job.body, job.key).not.toMatch(/^ {4}env:/m);
    }
  });

  it("shows what would run before anything changes, and changes it only from main with its switch on", () => {
    const names = allSteps.map(stepName);
    const at = (name: string) => names.indexOf(name);
    const step = (name: string) => allSteps[at(name)] ?? "";
    const order = [
      "Find the connection",
      "What the project has now",
      "What would run",
      "Apply",
      "What the project has after",
      "The demo businesses",
    ];
    for (const [i, name] of order.entries()) {
      expect(at(name), name).toBeGreaterThanOrEqual(0);
      if (i > 0) expect(at(order[i - 1] ?? ""), name).toBeLessThan(at(name));
    }
    expect(step("What would run")).toContain("db push");
    expect(step("What would run")).toContain("--dry-run");
    expect(step("What would run")).not.toMatch(/^ {8}if:/m);
    // Whatever writes to the project waits for its switch and for main.
    for (const each of allSteps) {
      const writes =
        (each.includes("db push") && !each.includes("--dry-run")) ||
        /\bpsql\b/.test(each);
      if (!writes) continue;
      expect(each, stepName(each)).toMatch(
        /^ {8}if: inputs\.(apply|demo) && github\.ref == 'refs\/heads\/main'$/m,
      );
    }
    expect(step("Apply")).toContain(`if: inputs.apply && ${FROM_MAIN}`);
    expect(step("What the project has after")).toContain(
      `if: inputs.apply && ${FROM_MAIN}`,
    );
    expect(step("The demo businesses")).toContain(
      `if: inputs.demo && ${FROM_MAIN}`,
    );
    expect(step("The demo businesses")).toContain("supabase/hosted-demo.sql");
  });

  it("reads the code and nothing more, with every action pinned", () => {
    expect(topLevel(dev, "permissions").trim()).toBe(
      "permissions:\n  contents: read",
    );
    for (const job of allJobs) {
      expect(job.body, job.key).not.toMatch(/^ {4}permissions:/m);
    }
    const uses = [...withoutComments(dev).matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBe(3);
    for (const [line, action = "", version = ""] of uses) {
      expect(action, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(version, line).toMatch(/^ # v\d+\.\d+\.\d+$/);
    }
  });
});
