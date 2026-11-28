import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pushSupport } from "@domain/push";
import { devices } from "@playwright/test";
import { describe, expect, it } from "vitest";
import config, { FIRST_DAY_SPEC } from "../playwright.config";
import { blocks, jobs, readRepoFile, stepName, steps } from "./workflows";

// A worker's first day in WebKit and at 320px (closing the pilot, PR 27):
// e2e/first-day.spec.ts runs in two Playwright projects of its own, WebKit
// as an iPhone draws it and Chromium as narrow as Android's largest font
// draws it, and in no other, so CI grows by one spec and none of the six
// shards waits for it. CI runs those two projects in a job of its own,
// `e2e (first day)`, set up step for step as the shards are, and the gate
// that skips a tested tree on main (.github/scripts/tested-tree.sh) waits
// for its record as for theirs. The check's name is in docs/production.md
// A1 step 4 (tooling/production-doc.test.ts holds that list whole).

const root = join(import.meta.dirname, "..");
const SIZES = ["phone", "tablet", "desktop"] as const;
const FIRST_DAY = ["webkit-390", "chromium-320"] as const;

const projects = new Map(
  (config.projects ?? []).map((project) => [project.name ?? "", project]),
);
const projectOf = (name: string) => {
  const project = projects.get(name);
  if (!project) throw new Error(`No project ${name} in playwright.config.ts`);
  return project;
};

/** The one RegExp a project's testMatch or testIgnore holds, or null. */
function patternOf(value: unknown): RegExp | null {
  if (value === undefined) return null;
  if (value instanceof RegExp) return value;
  throw new Error(`Expected a RegExp, not ${String(value)}`);
}

describe("the first day's projects", () => {
  const specs = readdirSync(join(root, "e2e"))
    .filter((file) => file.endsWith(".spec.ts"))
    .map((file) => join(root, "e2e", file));

  it("are the last two, after the three sizes", () => {
    expect([...projects.keys()]).toEqual([...SIZES, ...FIRST_DAY]);
  });

  it("run e2e/first-day.spec.ts alone, and the three sizes every spec but it", () => {
    expect(specs).toContain(join(root, "e2e", "first-day.spec.ts"));
    expect(specs.length).toBeGreaterThan(50);
    for (const file of specs) {
      const firstDay = file.endsWith(join("e2e", "first-day.spec.ts"));
      for (const name of SIZES) {
        const project = projectOf(name);
        // Playwright's own default: every spec.
        expect(project.testMatch, name).toBeUndefined();
        expect(
          patternOf(project.testIgnore)?.test(file),
          `${name}: ${file}`,
        ).toBe(firstDay);
      }
      for (const name of FIRST_DAY) {
        const project = projectOf(name);
        expect(project.testIgnore, name).toBeUndefined();
        expect(
          patternOf(project.testMatch)?.test(file),
          `${name}: ${file}`,
        ).toBe(firstDay);
      }
    }
    // A path as Windows writes it, and a name that only ends the same.
    expect(FIRST_DAY_SPEC.test("C:\\repo\\e2e\\first-day.spec.ts")).toBe(true);
    expect(FIRST_DAY_SPEC.test("/repo/e2e/my-first-day.spec.ts")).toBe(false);
    expect(FIRST_DAY_SPEC.test("/repo/e2e/first-day.spec.tsx")).toBe(false);
  });

  it("draw WebKit as an iPhone 14 on an iOS the app's notifications take", () => {
    const use = projectOf("webkit-390").use ?? {};
    expect(use.browserName).toBe("webkit");
    expect(use.viewport).toEqual({ width: 390, height: 664 });
    expect(use.isMobile).toBe(true);
    expect(use.hasTouch).toBe(true);
    // Never the Chromium a local run points at (PLAYWRIGHT_CHROMIUM_PATH).
    expect(use.launchOptions).toEqual({});
    // The descriptor's own user agent says iOS 16.0, too old for the push
    // switch; the project's says a current one, to be added to the home
    // screen first, as on a real iPhone in Safari.
    const facts = { maxTouchPoints: 5, standalone: false, canPush: true };
    expect(
      pushSupport({ ...facts, userAgent: devices["iPhone 14"].userAgent }),
    ).toBe("iosTooOld");
    expect(pushSupport({ ...facts, userAgent: use.userAgent ?? "" })).toBe(
      "installFirst",
    );
  });

  it("draw Chromium as the phone project's Pixel 7, at 320", () => {
    const narrow = projectOf("chromium-320").use ?? {};
    const phone = projectOf("phone").use ?? {};
    expect(narrow.browserName).toBeUndefined();
    expect(narrow.defaultBrowserType).toBe("chromium");
    expect(narrow.viewport).toEqual({ width: 320, height: 652 });
    expect(narrow.userAgent).toBe(phone.userAgent);
    expect(narrow.isMobile).toBe(true);
    expect(narrow.hasTouch).toBe(true);
    // The Chromium of the whole config, a local one too.
    expect("launchOptions" in narrow).toBe(false);
  });

  it("keep a photo and a trace of a failure, as every project does", () => {
    expect(config.use?.trace).toBe("retain-on-failure");
    for (const name of FIRST_DAY) {
      expect(projectOf(name).use?.screenshot, name).toBe("only-on-failure");
      expect(projectOf(name).use?.trace, name).toBeUndefined();
    }
  });
});

describe("CI's job for the first day", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  const byKey = new Map(jobs(ci).map((job) => [job.key, job.body]));
  const shards = byKey.get("e2e") ?? "";
  const day = byKey.get("e2e-first-day") ?? "";
  const field = (job: string, key: string) =>
    blocks(job, 4)
      .find((block) => block.key === key)
      ?.body.trimEnd();
  const stepsOf = (job: string) => steps(job).map((step) => step.trimEnd());
  const named = (job: string, name: string) =>
    stepsOf(job).find((step) => stepName(step) === name);

  it("is a job of its own, its check named `e2e (first day)`", () => {
    expect(day).not.toBe("");
    expect(field(day, "name")).toBe("    name: e2e (first day)");
    expect(field(day, "strategy")).toBeUndefined();
    expect(field(day, "runs-on")).toBe(field(shards, "runs-on"));
  });

  it("runs when the shards run: after check and database, never on a tree the gate found tested", () => {
    expect(field(day, "needs")).toBe("    needs: [gate, check, database]");
    expect(field(day, "needs")).toBe(field(shards, "needs"));
    expect(field(day, "if")).toBe(field(shards, "if"));
    expect(field(day, "if")).toContain("needs.gate.outputs.tested != 'yes'");
  });

  it("is set up step for step as the shards are, and builds the same app", () => {
    const ours = stepsOf(day);
    const theirs = stepsOf(shards);
    // Checkout, the ports kept, pnpm, Node and the install.
    expect(ours.slice(0, 5)).toEqual(theirs.slice(0, 5));
    expect(stepName(ours[1] ?? "")).toBe(
      "Keep the local stack's ports from outgoing connections",
    );
    for (const name of [
      "Point the app at local Supabase",
      "Build",
      "Record the tree this job passed on",
    ]) {
      expect(named(day, name), name).toBeDefined();
      expect(named(day, name), name).toBe(named(shards, name));
    }
  });

  it("starts the same local stack while it installs WebKit and Chromium", () => {
    const start = (job: string) =>
      stepsOf(job).find((step) => step.includes("supabase-start.sh start")) ??
      "";
    const stack = (step: string) =>
      step
        .split("\n")
        .filter((line) => /supabase-start\.sh start|^\s+-x /.test(line))
        .join("\n");
    expect(stack(start(day))).not.toBe("");
    expect(stack(start(day))).toBe(stack(start(shards)));
    expect(start(day)).toContain(
      "pnpm exec playwright install --with-deps webkit chromium",
    );
    expect(start(shards)).toContain(
      "pnpm exec playwright install --with-deps chromium",
    );
    expect(start(day)).toContain('wait "$supabase"');
  });

  it("runs the two projects whole, and the shards the three sizes", () => {
    const runs = stepsOf(day).filter((step) => step.includes("pnpm e2e"));
    expect(runs).toHaveLength(1);
    const run = /^ {8}run: (.+)$/m.exec(runs[0] ?? "")?.[1];
    expect(run).toBe(
      `pnpm e2e ${FIRST_DAY.map((name) => `--project=${name}`).join(" ")}`,
    );
    const matrix = /^ {8}project: \[([^\]]*)\]$/m.exec(shards)?.[1];
    expect(matrix?.split(",").map((name) => name.trim())).toEqual([...SIZES]);
  });

  it("uploads what it saw, whatever the outcome, without making that part of passing", () => {
    const upload = stepsOf(day).find((step) =>
      step.includes("name: playwright-results-first-day"),
    );
    expect(upload).toContain("if: always()");
    expect(upload).toContain("continue-on-error: true");
    expect(upload).toContain("path: test-results/");
  });

  it("leaves the record the gate waits for, as the shards do", () => {
    const record = (job: string) =>
      stepsOf(job).find((step) => step.includes("name: passed-"));
    // `github.job` is the job's id, so the record is
    // passed-e2e-first-day-<tree>, as the gate looks for it.
    expect(byKey.has("e2e-first-day")).toBe(true);
    expect(record(day)).toMatch(
      /name: passed-\$\{\{ github\.job \}\}-\$\{\{ steps\.passed\.outputs\.tree \}\}$/m,
    );
    const gate = readRepoFile(".github/scripts/tested-tree.sh");
    const waited = /^jobs="([^"]+)"$/m.exec(gate)?.[1]?.split(" ") ?? [];
    const expected = [
      "check",
      "database",
      ...SIZES.flatMap((size) => [`e2e-${size}-1`, `e2e-${size}-2`]),
      "e2e-first-day",
    ];
    expect([...waited].sort()).toEqual([...expected].sort());
    // Every one of them, counted.
    const count = /awk '\$1 == (\d+) \{/.exec(gate)?.[1];
    expect(Number(count)).toBe(waited.length);
  });
});
