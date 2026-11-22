import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The hiring file's hygiene in code (profile H4; issue #82 §2.3): its sealing
 * and its reads stay on the server (`server-only`), log no value, never run
 * inside `"use cache"` (a cached answer would outlive the access check and
 * the log row), and its keys are never a browser's. The names are in
 * .env.example with no value.
 */

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        return entry.name === "node_modules" || entry.name.startsWith(".")
          ? []
          : files(path);
      }
      return /\.(ts|tsx|mts|mjs)$/.test(entry.name) ? [path] : [];
    },
  );
}

const SERVER_ONLY = [
  "packages/db/crypto.ts",
  "packages/db/employee-files.ts",
  "packages/db/audit-guard.ts",
];

const code = ["app", "packages", "modules", "tooling", "e2e"].flatMap(files);

describe("the hiring file's code", () => {
  it("starts on the server only, and logs no value", () => {
    for (const path of SERVER_ONLY) {
      const source = read(path);
      expect(source.startsWith('import "server-only";'), path).toBe(true);
      expect(source, path).not.toMatch(/console\.log/);
      expect(source, path).not.toMatch(/FormData/);
    }
  });

  it("is never read inside a cache", () => {
    const users = code.filter((path) =>
      /from\s+["']@db\/(employee-files|crypto|audit-guard)["']/.test(
        read(path),
      ),
    );
    for (const path of users) {
      expect(read(path), path).not.toMatch(/["']use cache/);
    }
  });

  it("draws the worker's own file with no cache and no value in a log", () => {
    // Profile H5a: the screens of /me/file and the profile's summary of it.
    const screens = [
      ...files("app/(app)/me/file"),
      "app/(app)/me/file-summary.tsx",
    ];
    expect(screens.length).toBeGreaterThan(5);
    for (const path of screens) {
      const source = read(path);
      expect(source, path).not.toMatch(/["']use cache/);
      if (!path.endsWith(".test.ts")) {
        expect(source, path).not.toMatch(/console\.log/);
      }
    }
    // A write logs what failed and its code, never what was typed: its
    // actions, and who may write (`fileWriter`, on the server only), whose
    // `logged` they and Today's route share.
    const writer = read("app/(app)/me/file/file-writer.ts");
    expect(writer.startsWith('import "server-only";')).toBe(true);
    const calls = [
      ...read("app/(app)/me/file/actions.ts").matchAll(
        /console\.\w+\(([^)]*)\)/g,
      ),
      ...writer.matchAll(/console\.\w+\(([^)]*)\)/g),
    ].map(([, args = ""]) => args);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      // Its words may name the bank; what it passes may not be typed.
      const args = call.replace(/"[^"]*"/g, "");
      expect(args).not.toMatch(
        /\b(input|parsed|details|bank|field|step|who)\b/,
      );
    }
  });

  it("draws Today's cards and lands someone who joined with no cache, and no value in a log", () => {
    // Profile H5b: Today reads what is missing and the account's change, and
    // /join reads the business's modules for where to land.
    for (const path of [
      "app/(app)/home/page.tsx",
      "app/(app)/home/today-file.ts",
      "app/(app)/home/today-file-card.tsx",
      "app/(app)/home/bank-change-card.tsx",
      "app/(app)/home/bank-seen/route.ts",
      "app/(app)/home/hide-request.ts",
      "app/(auth)/join/landing.ts",
      "app/(auth)/join/actions.ts",
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/["']use cache/);
      expect(source, path).not.toMatch(/console\.log/);
    }
    // The 101's link opens in a window that knows nothing of the app's, and
    // its route is the server's, from the business's settings.
    expect(read("app/(app)/me/file/steps/form101-step.tsx")).toMatch(
      /target="_blank"\s+rel="noopener noreferrer"/,
    );
    expect(read("app/(app)/me/file/actions.ts")).toMatch(/route: way \}/);
  });

  it("puts no value of a file in a URL", () => {
    // The page reads the step's name from its address, and nothing else;
    // the flow builds its addresses from a step's name alone.
    const page = read("app/(app)/me/file/page.tsx");
    expect(page).toMatch(/const \[\{ step \}, /);
    expect(page).not.toMatch(/searchParams\./);
    // Its addresses come from one place, a step's name and the twin's own
    // query (`keep`, its state and language); the done screen's way back is
    // the profile's.
    const flow = read("app/(app)/me/file/file-flow.tsx");
    const pushes = [...flow.matchAll(/router\.push\(\s*([\w.]+)/g)].map(
      ([, to = ""]) => to,
    );
    expect(pushes).toEqual(["stepHref", "kit.profileHref"]);
    expect(flow).toContain("/me/file?step=$" + "{next}");
  });

  it("draws a former worker's old file with no cache, and no value in a log", () => {
    // Profile H5c: the old file's screen, its reads and reveal, and the
    // list of previous jobs on the profile and on the screen of someone
    // with no business.
    const screens = [
      ...files("app/(account)"),
      "app/(app)/no-business.tsx",
      "app/(app)/departures.ts",
      "app/(app)/me/page.tsx",
    ];
    expect(screens.length).toBeGreaterThan(8);
    for (const path of screens) {
      const source = read(path);
      expect(source, path).not.toMatch(/["']use cache/);
      if (!path.endsWith(".test.ts")) {
        expect(source, path).not.toMatch(/console\.log/);
      }
    }
    // Its reads are the server's alone, and each logs a code and a kind:
    // the gate's, the list's and the reveal's, never what was read.
    const reads = read("app/(account)/me/past/past-file.ts");
    expect(reads.startsWith('import "server-only";')).toBe(true);
    const action = read("app/(account)/me/past/actions.ts");
    const calls = [
      ...reads.matchAll(/console\.\w+\(([^)]*)\)/g),
      ...action.matchAll(/console\.\w+\(([^)]*)\)/g),
      ...action.matchAll(/logged\(([^)]*)\)/g),
    ].map(([, args = ""]) => args);
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      const args = call.replace(/"[^"]*"/g, "");
      expect(args).not.toMatch(
        /\b(read|file|data|field|which|who|revealed|member|found|job|business)\b/,
      );
    }
  });

  it("puts no value of a former worker's file in a URL", () => {
    // The page reads the business's id from its address, and nothing else;
    // the list's rows lead there by that id alone.
    const page = read("app/(account)/me/past/[business]/page.tsx");
    expect(page).toMatch(/const \{ business \} = await params;/);
    expect(page).not.toMatch(/searchParams/);
    const jobs = read("app/(account)/me/past/past-jobs.tsx");
    expect(jobs).toContain("hrefOf = (id) => `/me/past/$" + "{id}`");
    expect([...jobs.matchAll(/href=/g)]).toHaveLength(1);
    expect(jobs).toContain("href={hrefOf(job.businessId)}");
  });

  it("keeps its keys off the browser", () => {
    const named = code.filter(
      (path) =>
        !path.endsWith("employee-files-guard.test.ts") &&
        /NEXT_PUBLIC_EMPLOYEE/.test(read(path)),
    );
    expect(named.map((path) => relative(root, join(root, path)))).toEqual([]);
  });

  it("lists its two settings in .env.example, with no value", () => {
    const example = read(".env.example");
    expect(example).toMatch(/^EMPLOYEE_DATA_KEKS=\r?$/m);
    expect(example).toMatch(/^EMPLOYEE_DATA_KEK_ACTIVE=\r?$/m);
    expect(example).not.toMatch(/NEXT_PUBLIC_EMPLOYEE/);
  });
});
