import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "./boundaries";
import { jobs, readRepoFile, stepName, steps } from "./workflows";

// The demo door per site (Orel, 22 November 2026): `DEMO_DOOR`, read in one
// place (`demoDoorOpen` in packages/db/env.ts), with no constant left that
// says it in code. Whatever puts the demo businesses back, renews their
// week or sends their sample availability with the secret key asks the door
// first, in the same function, since a server action answers a POST from any
// page. No browser file asks it: a browser reads the setting as unset, so
// open. And CI builds both sites: the check job closed, the e2e jobs open.

const root = join(__dirname, "..");
const code = [
  ...["app", "packages", "modules"].flatMap((dir) => sourceFiles(dir, root)),
  "proxy.ts",
]
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }));

/** What runs with the secret key on the demo businesses (packages/db/demo.ts). */
const DEMO_WRITES = new Set([
  "resetDemoBusinesses",
  "renewDemoSchedules",
  "renewDemoAvailability",
]);

/**
 * Each use of a demo write in `source`, outside its import: whether it is
 * called, and whether `demoDoorOpen()` is called before it in the same
 * function.
 */
function demoWrites(file: string, source: string) {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const found: { name: string; called: boolean; doorFirst: boolean }[] = [];

  const doorCallsIn = (fn: ts.Node): number[] => {
    const at: number[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "demoDoorOpen"
      ) {
        at.push(node.getStart(sf));
      }
      ts.forEachChild(node, visit);
    };
    visit(fn);
    return at;
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) && DEMO_WRITES.has(node.text)) {
      const parent = node.parent;
      const called =
        parent !== undefined &&
        ts.isCallExpression(parent) &&
        parent.expression === node;
      let fn: ts.Node | undefined = parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      const doorFirst =
        fn !== undefined &&
        doorCallsIn(fn).some((at) => at < node.getStart(sf));
      found.push({ name: node.text, called, doorFirst });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const isClient = (source: string) =>
  /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(source);

describe("the demo door", () => {
  it("is read from the environment in one place only", () => {
    const reads = code.filter(({ source }) =>
      /process\.env(?:\.DEMO_DOOR\b|\[\s*["'`]DEMO_DOOR["'`]\s*\])|\bDEMO_DOOR\b[^}\n]*\}\s*=\s*process\.env/.test(
        source,
      ),
    );
    expect(reads.map(({ file }) => file)).toEqual(["packages/db/env.ts"]);
  });

  it("has no constant left that says it in code", () => {
    expect(
      code
        .filter(({ source }) => source.includes("PASSIVE_SIGN_IN"))
        .map(({ file }) => file),
    ).toEqual([]);
  });

  it("knows every demo write packages/db/demo.ts has", () => {
    const source = readFileSync(join(root, "packages/db/demo.ts"), "utf8");
    const exported = [
      ...source.matchAll(/^export (?:async )?function (\w+)/gm),
    ].map(([, name = ""]) => name);
    expect(exported.sort()).toEqual([...DEMO_WRITES].sort());
  });

  it("is asked first wherever the demo businesses are reset or renewed", () => {
    const callers = code
      .filter(({ file }) => file !== "packages/db/demo.ts")
      .map(({ file, source }) => ({ file, uses: demoWrites(file, source) }))
      .filter(({ uses }) => uses.length > 0);
    expect(callers.map(({ file }) => file).sort()).toEqual([
      "app/(app)/demo.ts",
      "app/(auth)/enter/actions.ts",
    ]);
    for (const { file, uses } of callers) {
      for (const use of uses) {
        // Called where it is used, never handed on, and after the door.
        expect(use.called, `${file}: ${use.name}`).toBe(true);
        expect(use.doorFirst, `${file}: ${use.name}`).toBe(true);
      }
    }
  });

  it("is never asked in a browser's file", () => {
    const clients = code.filter(({ source }) => isClient(source));
    expect(clients.length).toBeGreaterThan(10);
    expect(
      clients
        .filter(({ source }) => /\bdemoDoorOpen\b|@db\/env/.test(source))
        .map(({ file }) => file),
    ).toEqual([]);
  });
});

describe("CI builds both sites", () => {
  const ci = readRepoFile(".github/workflows/ci.yml");
  const byKey = new Map(jobs(ci).map((job) => [job.key, job.body]));

  it("builds the check job's site with the door closed, then asks it", () => {
    const check = steps(byKey.get("check") ?? "");
    const build = check.findIndex((step) => stepName(step) === "Build");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(check[build]).toMatch(/^ {10}DEMO_DOOR: "off"$/m);
    expect(check[build + 1]).toContain(
      "run: bash .github/scripts/door-closed.sh",
    );
  });

  it("keeps the door open everywhere else", () => {
    for (const [key, body] of byKey) {
      if (key === "check") continue;
      expect(body, key).not.toContain("DEMO_DOOR");
    }
    const check = byKey.get("check") ?? "";
    expect([...check.matchAll(/DEMO_DOOR/g)]).toHaveLength(1);
    expect(ci.split("jobs:")[0]).not.toContain("DEMO_DOOR");
  });

  it("serves the closed build with the setting off and no Supabase", () => {
    const script = readRepoFile(".github/scripts/door-closed.sh");
    expect(script).toContain("DEMO_DOOR=off");
    expect(script).toMatch(/-u NEXT_PUBLIC_SUPABASE_URL\b/);
    expect(script).toContain("/health");
    expect(script).toContain('href="/enter"');
  });
});
