import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  crossModuleImports,
  crossModuleViolations,
  importSpecifiers,
  sourceFiles,
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

// The measuring tools (measure/) read the app through its screens and the
// database; nothing the app ships may lean on them in turn.
describe("measure/", () => {
  it("is imported by nothing in app/, packages/ or modules/", () => {
    const leaning = ["app", "packages", "modules"].flatMap((dir) =>
      sourceFiles(dir, root).flatMap((file) =>
        importSpecifiers(readFileSync(join(root, file), "utf8"))
          .filter(
            (specifier) =>
              /(^|\/)measure(\/|$)/.test(specifier) &&
              (specifier.startsWith(".") || specifier.startsWith("@/")),
          )
          .map((specifier) => `${file}: ${specifier}`),
      ),
    );
    expect(leaning).toEqual([]);
  });
});

// The clock runs on workers' phones, so its browser files keep Zod out of the
// download: from @domain they take only files that import no Zod, and types
// (erased before the browser gets anything).
describe("the clock's browser files", () => {
  const read = (file: string) => readFileSync(join(root, file), "utf8");

  /** Each import or re-export with a `from`, its clause and its specifier. */
  const STATEMENT =
    /\b(import|export)\s+(type\s+)?([^"'`;]*?)\s*\bfrom\s*["']([^"']+)["']/g;

  /** Whether one statement brings in types only, so nothing reaches the browser. */
  function typeOnly(typeKeyword: string | undefined, clause: string): boolean {
    if (typeKeyword) return true;
    const inside = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
    if (inside === undefined) return false;
    const names = inside
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    return names.length > 0 && names.every((name) => name.startsWith("type "));
  }

  /**
   * Modules a file takes values from: every specifier `importSpecifiers` finds
   * (static, re-export, side-effect, dynamic), unless each statement naming it
   * brings in types only.
   */
  function valueImports(source: string): string[] {
    const typesOnly = new Map<string, boolean>();
    for (const [, , keyword, clause = "", specifier = ""] of source.matchAll(
      STATEMENT,
    )) {
      typesOnly.set(
        specifier,
        (typesOnly.get(specifier) ?? true) && typeOnly(keyword, clause),
      );
    }
    // A side-effect or dynamic import has no `from`: it is a value.
    return [...new Set(importSpecifiers(source))].filter(
      (specifier) => typesOnly.get(specifier) !== true,
    );
  }

  /** @domain modules a file takes values from. */
  const domainValues = (source: string) =>
    valueImports(source).filter((specifier) =>
      specifier.startsWith("@domain/"),
    );

  /** `import("…")`, `typeof import("…")` included: loaded when needed, if ever. */
  const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  /** Modules a file names only in `import(…)`, apart from the rest. */
  const split = (source: string) => ({
    lazy: [...new Set([...source.matchAll(DYNAMIC)].map((m) => m[1] ?? ""))],
    eager: source.replace(DYNAMIC, ""),
  });

  it("tells modules loaded on demand from the ones loaded with the page", () => {
    const { lazy, eager } = split(
      [
        'import { a } from "@domain/a";',
        'type B = typeof import("@domain/b");',
        'const c = () => import("@domain/c");',
      ].join("\n"),
    );
    expect(lazy).toEqual(["@domain/b", "@domain/c"]);
    expect(importSpecifiers(eager)).toEqual(["@domain/a"]);
  });

  it("tells value imports from type imports", () => {
    expect(
      domainValues(
        [
          'import type { A } from "@domain/a";',
          'import { type B, type C } from "@domain/b";',
          'import { type D, e } from "@domain/d";',
          'import { f } from "@domain/f";',
          'import G, { g } from "@domain/g";',
          'import * as h from "@domain/h";',
          'export { i } from "@domain/i";',
          'export type { J } from "@domain/j";',
          'export { type K } from "@domain/k";',
          'export * from "@domain/l";',
          'import "@domain/m";',
          'const n = await import("@domain/n");',
          // Types from one statement don't cover a value from another.
          'import type { O } from "@domain/o";',
          'import { o } from "@domain/o";',
          "import {",
          "  type P,",
          "  p,",
          '} from "@domain/p";',
        ].join("\n"),
      ),
    ).toEqual([
      "@domain/d",
      "@domain/f",
      "@domain/g",
      "@domain/h",
      "@domain/i",
      "@domain/l",
      "@domain/m",
      "@domain/n",
      "@domain/o",
      "@domain/p",
    ]);
  });

  /** What the clock's browser files may take values from, and what each may import. */
  const allowed: Record<string, string[]> = {
    "@domain/time-clock-format": [],
    "@domain/punch-code-format": [],
  };
  /**
   * Loaded only with `import()`, never with the page: the QR decoder, for a
   * phone without a reader of its own. It brings the decoder and nothing else.
   */
  const onDemand: Record<string, string[]> = {
    "@domain/qr-decode": ["qr/decode.js"],
  };

  /** The clock's browser files, and the packages/ui files only it uses. */
  const clockFiles = [
    "app/(app)/clock/clock-panel.tsx",
    // Whom to ask under a refusal (closing the pilot, PR 8): its chat
    // addresses come from the server, so it takes nothing from chat's files.
    "app/(app)/clock/ask-fix.tsx",
    "app/(app)/clock/punch-code-sheet.tsx",
    "app/(app)/clock/without-code-sheet.tsx",
    "app/(app)/clock/scan-punch.tsx",
    "packages/ui/use-qr-camera.ts",
    "packages/ui/qr-camera.ts",
    "packages/ui/scan-circle.tsx",
  ];

  it("import no Zod", () => {
    for (const [module, imports] of Object.entries({
      ...allowed,
      ...onDemand,
    })) {
      const file = `packages/domain/${module.slice("@domain/".length)}.ts`;
      expect(existsSync(join(root, file)), file).toBe(true);
      expect(importSpecifiers(read(file)), file).toEqual(imports);
    }
    /** Each file checked, with how many steps were followed from it. */
    const checked = new Map<string, number>();
    const check = (file: string, depth: number) => {
      if ((checked.get(file) ?? -1) >= depth) return;
      checked.set(file, depth);
      const source = read(file);
      const { lazy, eager } = split(source);
      expect(importSpecifiers(source), file).not.toContain("zod");
      // With the page: only the allowed.
      expect(
        domainValues(eager).filter((module) => !(module in allowed)),
        file,
      ).toEqual([]);
      // On demand: the allowed, or what is only ever loaded that way.
      expect(
        lazy.filter(
          (module) =>
            module.startsWith("@domain/") &&
            !(module in allowed) &&
            !(module in onDemand),
        ),
        file,
      ).toEqual([]);
      // Named in no statement, types included, so nothing brings it in with
      // the page.
      expect(
        importSpecifiers(eager).filter((module) => module in onDemand),
        file,
      ).toEqual([]);
      if (depth === 0) return;
      // One step into the files it takes values from: beside it, or in
      // packages/ui.
      for (const specifier of valueImports(eager)) {
        let base: string;
        if (specifier.startsWith(".")) base = join(dirname(file), specifier);
        else if (specifier.startsWith("@ui/")) {
          base = join("packages/ui", specifier.slice("@ui/".length));
        } else continue;
        const next = [`${base}.ts`, `${base}.tsx`].find((path) =>
          existsSync(join(root, path)),
        );
        if (next) check(next.replaceAll("\\", "/"), depth - 1);
      }
    };
    for (const file of clockFiles) {
      expect(existsSync(join(root, file)), file).toBe(true);
      check(file, 1);
    }
    // The steps reach packages/ui through its alias.
    expect([...checked.keys()]).toEqual(
      expect.arrayContaining([
        "packages/ui/button.tsx",
        "packages/ui/list-row.tsx",
      ]),
    );
  });

  it("load the QR decoder only on demand", () => {
    const file = "packages/ui/use-qr-camera.ts";
    const source = read(file);
    const { lazy, eager } = split(source);
    expect(lazy).toContain("@domain/qr-decode");
    expect(importSpecifiers(eager)).not.toContain("@domain/qr-decode");
    expect(
      [...source.matchAll(STATEMENT)].map(([, , , , specifier]) => specifier),
    ).not.toContain("@domain/qr-decode");
  });
});

// Biome applies per-folder overrides only to files on disk, so each case is a
// throwaway probe file placed in the folder whose rule it exercises. The
// probes are written outside the repository, into a folder of their own
// beside copies of biome.json and .gitignore (VCS is on, so Biome wants the
// ignore file): override paths are relative to the configuration, so
// `packages/ui/**` reaches <probes>/packages/ui. Inside the repository they
// raced the tests that walk app/, packages/ and modules/ in other workers,
// which listed a probe and found it gone, or read its forbidden import.
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
  { path: "measure/probe", from: "@/app/layout", blocked: true },
  { path: "measure/probe", from: "@db/client", blocked: true },
  { path: "measure/probe", from: "@ui/button", blocked: true },
  {
    path: "measure/probe",
    from: "@modules/scheduling/settings",
    blocked: true,
  },
  {
    path: "measure/probe",
    from: "@modules/scheduling/manifest",
    blocked: false,
  },
  { path: "measure/probe", from: "@domain/phone", blocked: false },
];

/** Biome configurations below `dir`, which the probes' copy would leave out. */
function nestedConfigs(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      if (entry.name === "node_modules") return [];
      const path = posix.join(dir, entry.name);
      if (entry.isDirectory()) return nestedConfigs(path);
      return /^biome\.jsonc?$/.test(entry.name) ? [path] : [];
    },
  );
}

describe("Biome layer rules", () => {
  let probes: string | undefined;
  afterAll(() => {
    if (probes) rmSync(probes, { recursive: true, force: true });
  });

  it("come from biome.json alone, so a copy of it is the whole picture", () => {
    expect([
      ...nestedConfigs("packages"),
      ...nestedConfigs("modules"),
      ...nestedConfigs("measure"),
    ]).toEqual([]);
  });

  it("blocks every forbidden import and allows the permitted ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "boundary-probes-"));
    probes = dir;
    for (const name of ["biome.json", ".gitignore"]) {
      copyFileSync(join(root, name), join(dir, name));
    }
    const files = cases.map((c, i) => {
      const file = join(dir, c.path, `__boundary_probe_${i}__.ts`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `import { x } from "${c.from}";\nexport const y = x;\n`,
      );
      return file;
    });

    // The GitHub reporter prints one stable line per diagnostic:
    // ::error title=<rule>,file=<path>,line=…::<message>
    // Biome's JavaScript entry runs through Node, because node_modules/.bin/biome
    // is a shell shim that Windows can't execute directly.
    let output = "";
    try {
      output = execFileSync(
        process.execPath,
        [
          join(root, "node_modules/@biomejs/biome/bin/biome"),
          "lint",
          "--reporter=github",
          "--max-diagnostics=none",
          ...files,
        ],
        { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (error) {
      // Biome exits non-zero when it reports errors; that output is what we read.
      const { stdout, stderr, message } = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      if (typeof stdout !== "string") {
        throw new Error(
          `Biome did not run: ${stderr || message || String(error)}`,
        );
      }
      output = stdout;
    }
    const blocked = output
      .split("\n")
      .filter((line) => line.includes("title=lint/style/noRestrictedImports,"))
      .map((line) =>
        (/file=([^,]+),/.exec(line)?.[1] ?? "").split("\\").join("/"),
      );

    const result = cases.map((c, i) => ({
      ...c,
      blocked: blocked.some((file) =>
        file.endsWith(`__boundary_probe_${i}__.ts`),
      ),
    }));
    expect(result).toEqual(cases);
  });
});
