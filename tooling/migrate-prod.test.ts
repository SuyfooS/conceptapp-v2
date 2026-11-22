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

// The workflow that applies migrations to conceptapp-prod, the project of
// real businesses (docs/production.md, B3). Read as text, as GitHub reads it:
// it never adds the demo or any SQL file, starts only by hand, runs only in
// the protected environment (main alone, Orel's approval, its two secrets),
// keeps those secrets in the one step that connects, checks the project
// holds no demo business and shows what would run before it applies, and
// stays apart from the development project's workflow.

const prod = readRepoFile(".github/workflows/migrate-prod.yml");
const dev = readRepoFile(".github/workflows/migrate-dev.yml");

const SECRET = /\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g;
const PROTECTED = /^ {4}environment: conceptapp-prod$/m;
const FROM_MAIN = /^ {4}if: github\.ref == 'refs\/heads\/main'$/m;
const ON_APPLY = /^ {8}if: inputs\.apply\b/m;

const allSteps = jobs(prod).flatMap((job) => steps(job.body));

describe("Migrate conceptapp-prod", () => {
  it("never adds the demo or runs a SQL file", () => {
    // Comments included: not even a word on how to.
    for (const banned of [
      "hosted-demo",
      "seed.sql",
      "supabase/seed",
      "--include-seed",
      "db reset",
    ]) {
      expect(prod, banned).not.toContain(banned);
    }
    expect(prod).not.toMatch(/psql[^\n]*\s(-f|--file)\b/);
    expect(prod).not.toMatch(/\\i\s/);
    expect(prod).not.toMatch(/\\include/);
    const inputs = blocks(topLevel(prod, "on"), 4).find(
      (b) => b.key === "inputs",
    );
    expect(inputs).toBeDefined();
    expect(blocks(inputs?.body ?? "", 6).map((b) => b.key)).toEqual(["apply"]);
  });

  it("runs by hand only", () => {
    expect(blocks(topLevel(prod, "on"), 2).map((b) => b.key)).toEqual([
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
      expect(withoutComments(prod), trigger).not.toContain(trigger);
    }
  });

  it("runs every job from main, in the protected environment", () => {
    expect(jobs(prod).length).toBeGreaterThan(0);
    for (const job of jobs(prod)) {
      expect(job.body, job.key).toMatch(FROM_MAIN);
      expect(job.body, job.key).toMatch(PROTECTED);
    }
  });

  it("keeps the two secrets in that job, in the step that connects", () => {
    const named = [...prod.matchAll(SECRET)].map(([, name]) => name);
    expect([...new Set(named)].sort()).toEqual([
      "SUPABASE_DB_PASSWORD",
      "SUPABASE_PROJECT_REF",
    ]);
    let inSteps = 0;
    for (const job of jobs(prod)) {
      for (const step of steps(job.body)) {
        const here = [...step.matchAll(SECRET)].length;
        if (here === 0) continue;
        expect(stepName(step), job.key).toBe("Find the connection");
        expect(job.body, job.key).toMatch(PROTECTED);
        inSteps += here;
      }
    }
    // Every one is inside that step: none at the job's level or the
    // workflow's.
    expect(inSteps).toBe(named.length);
    expect(prod).not.toContain("secrets: inherit");
    expect(topLevel(prod, "env")).toBe("");
    for (const job of jobs(prod)) {
      expect(job.body, job.key).not.toMatch(/^ {4}env:/m);
    }
  });

  it("checks the project and shows what would run before it applies", () => {
    const names = allSteps.map(stepName);
    const at = (name: string) => names.indexOf(name);
    const step = (name: string) => allSteps[at(name)] ?? "";
    for (const name of [
      "Find the connection",
      "Not the demo's project",
      "What would run",
      "Apply",
      "What the project has after",
    ]) {
      expect(at(name), name).toBeGreaterThanOrEqual(0);
    }
    expect(at("Find the connection")).toBeLessThan(
      at("Not the demo's project"),
    );
    expect(at("Not the demo's project")).toBeLessThan(at("What would run"));
    expect(at("What would run")).toBeLessThan(at("Apply"));
    expect(at("Apply")).toBeLessThan(at("What the project has after"));

    expect(step("Not the demo's project")).toContain("private.demo_businesses");
    expect(step("Not the demo's project")).toContain("exit 1");
    expect(step("Not the demo's project")).not.toMatch(ON_APPLY);
    expect(step("What would run")).toContain("db push");
    expect(step("What would run")).toContain("--dry-run");
    // Whatever changes the project waits for "apply".
    for (const each of allSteps) {
      if (!each.includes("db push") || each.includes("--dry-run")) continue;
      expect(each, stepName(each)).toMatch(ON_APPLY);
    }
    expect(step("Apply")).toMatch(ON_APPLY);
    expect(step("What the project has after")).toMatch(ON_APPLY);
  });

  it("reads the code and nothing more, with every action pinned", () => {
    expect(topLevel(prod, "permissions").trim()).toBe(
      "permissions:\n  contents: read",
    );
    for (const job of jobs(prod)) {
      expect(job.body, job.key).not.toMatch(/^ {4}permissions:/m);
    }
    const uses = [...withoutComments(prod).matchAll(/uses: (\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(3);
    for (const [line, action = "", version = ""] of uses) {
      expect(action, line).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(version, line).toMatch(/^ # v\d+\.\d+\.\d+$/);
    }
    const checkout = allSteps.find((s) => s.includes("actions/checkout@"));
    expect(checkout).toMatch(/^ {10}persist-credentials: false$/m);
  });

  it("stays apart from the development project's workflow", () => {
    // docs/production.md names it so, and Orel finds it by this name.
    expect(topLevel(prod, "name").trim()).toBe("name: Migrate conceptapp-prod");
    expect(dev).not.toContain("conceptapp-prod");
    const group = (text: string) =>
      /^ {2}group: (\S+)$/m.exec(topLevel(text, "concurrency"))?.[1];
    expect(group(prod)).toBe("migrate-prod");
    expect(group(dev)).toBeDefined();
    expect(group(dev)).not.toBe(group(prod));
  });
});
