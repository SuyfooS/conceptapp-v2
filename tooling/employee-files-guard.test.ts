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
    // A write logs what failed and its code, never what was typed.
    const calls = [
      ...read("app/(app)/me/file/actions.ts").matchAll(
        /console\.\w+\(([^)]*)\)/g,
      ),
    ].map(([, args = ""]) => args);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // Its words may name the bank; what it passes may not be typed.
      const args = call.replace(/"[^"]*"/g, "");
      expect(args).not.toMatch(
        /\b(input|parsed|details|bank|field|step|who)\b/,
      );
    }
  });

  it("puts no value of a file in a URL", () => {
    // The page reads the step's name from its address, and nothing else;
    // the flow builds its addresses from a step's name alone.
    const page = read("app/(app)/me/file/page.tsx");
    expect(page).toMatch(/const \[\{ step \}, /);
    expect(page).not.toMatch(/searchParams\./);
    const flow = read("app/(app)/me/file/file-flow.tsx");
    const pushes = [...flow.matchAll(/router\.push\(([^,]*),/g)].map(
      ([, to = ""]) => to.trim(),
    );
    expect(pushes).toEqual(["stepHref(next)"]);
    expect(flow).toContain("/me/file?step=$" + "{next}");
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
