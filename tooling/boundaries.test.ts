import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  crossModuleImports,
  crossModuleViolations,
  importSpecifiers,
} from "./boundaries";

const root = join(__dirname, "..");

describe("importSpecifiers", () => {
  it("finds static, type, re-export, side-effect and dynamic imports", () => {
    const source = [
      'import { a } from "./a";',
      'import type { B } from "@domain/b";',
      'export { c } from "../c";',
      'import "./side-effect.css";',
      'const d = await import("@modules/x/d");',
    ].join("\n");
    expect(importSpecifiers(source)).toEqual([
      "./a",
      "@domain/b",
      "../c",
      "./side-effect.css",
      "@modules/x/d",
    ]);
  });
});

describe("crossModuleImports", () => {
  const file = "modules/scheduling/views/week.ts";
  const check = (specifier: string) =>
    crossModuleImports(file, `import { x } from "${specifier}";`);

  it("allows the module's own files, shared packages and other manifests", () => {
    expect(check("./day")).toEqual([]);
    expect(check("../settings")).toEqual([]);
    expect(check("@domain/shabbat")).toEqual([]);
    expect(check("@modules/timeclock/manifest")).toEqual([]);
    expect(check("../../timeclock/manifest")).toEqual([]);
  });

  it("rejects another module's internals by alias or relative path", () => {
    expect(check("@modules/timeclock/punch")).toEqual([
      "@modules/timeclock/punch",
    ]);
    expect(check("../../timeclock/punch")).toEqual(["../../timeclock/punch"]);
    expect(
      crossModuleImports(
        "modules/scheduling/manifest.ts",
        'import { x } from "../timeclock/punch";',
      ),
    ).toEqual(["../timeclock/punch"]);
  });

  it("ignores files outside modules/", () => {
    expect(
      crossModuleImports(
        "app/page.tsx",
        'import { x } from "@modules/timeclock/punch";',
      ),
    ).toEqual([]);
  });

  it("finds no violations in the repository", () => {
    expect(crossModuleViolations(root)).toEqual([]);
  });
});

// Biome applies per-folder overrides only to files on disk, so each case is a
// throwaway probe file placed in the folder whose rule it exercises.
const cases: { path: string; from: string; blocked: boolean }[] = [
  { path: "packages/domain", from: "@ui/button", blocked: true },
  { path: "packages/domain", from: "@db/client", blocked: true },
  { path: "packages/domain", from: "react", blocked: true },
  { path: "packages/domain", from: "next/server", blocked: true },
  { path: "packages/domain", from: "./color", blocked: false },
  { path: "packages/ui", from: "@db/client", blocked: true },
  { path: "packages/ui", from: "@modules/scheduling/manifest", blocked: true },
  { path: "packages/ui", from: "@/app/layout", blocked: true },
  { path: "packages/ui", from: "@domain/color", blocked: false },
  { path: "packages/db", from: "@ui/button", blocked: true },
  { path: "packages/db", from: "react", blocked: true },
  { path: "packages/db", from: "@domain/phone", blocked: false },
  { path: "modules/probe", from: "@modules/other/internal", blocked: true },
  { path: "modules/probe", from: "@/app/layout", blocked: true },
  { path: "modules/probe", from: "@modules/other/manifest", blocked: false },
  { path: "modules/probe", from: "@domain/phone", blocked: false },
];

describe("Biome layer rules", () => {
  const written: string[] = [];
  afterAll(() => {
    for (const file of written) rmSync(file, { force: true });
    rmSync(join(root, "modules/probe"), { recursive: true, force: true });
  });

  it("blocks every forbidden import and allows the permitted ones", () => {
    const files = cases.map((c, i) => {
      const file = join(root, c.path, `__boundary_probe_${i}__.ts`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `import { x } from "${c.from}";\nexport const y = x;\n`,
      );
      written.push(file);
      return file;
    });

    // The GitHub reporter prints one stable line per diagnostic:
    // ::error title=<rule>,file=<path>,line=…::<message>
    let output = "";
    try {
      output = execFileSync(
        join(root, "node_modules/.bin/biome"),
        ["lint", "--reporter=github", "--max-diagnostics=none", ...files],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    const blocked = output
      .split("\n")
      .filter((line) => line.includes("title=lint/style/noRestrictedImports,"))
      .map((line) => /file=([^,]+),/.exec(line)?.[1] ?? "");

    const result = cases.map((c, i) => ({
      ...c,
      blocked: blocked.some((file) =>
        file.endsWith(`__boundary_probe_${i}__.ts`),
      ),
    }));
    expect(result).toEqual(cases);
  });
});
