import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A server file that imports a value (not a component) from a "use client"
 * file gets a client reference on the server, not the value. That is how the
 * lists' department filter lost its "all" choice: its key was a reference
 * when the server built the addresses, and "all" in the browser. Components
 * are meant to cross, so only names that don't start with a capital and a
 * lowercase letter count as values here.
 */

const root = join(__dirname, "..");

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourcesUnder(path));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

const isClient = (source: string) => /^\s*["']use client["']/.test(source);

/** Exported names that aren't components: constants and helper functions. */
export function clientValueExports(source: string): string[] {
  const names = [
    ...source.matchAll(/export\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)/g),
  ].map((match) => match[1] ?? "");
  return names.filter((name) => name && !/^[A-Z][a-z]/.test(name));
}

/** The value names a file imports from `specifier`, type-only ones left out. */
export function valueImports(
  source: string,
): { specifier: string; names: string[] }[] {
  return [
    ...source.matchAll(
      /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g,
    ),
  ]
    .filter((match) => !match[1])
    .map((match) => ({
      specifier: match[3] ?? "",
      names: (match[2] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("type "))
        .map((part) => part.split(/\s+as\s+/)[0] ?? part),
    }));
}

function resolveSpecifier(
  from: string,
  specifier: string,
  known: Set<string>,
): string | null {
  let base: string;
  if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else if (specifier.startsWith("@ui/"))
    base = join(root, "packages", "ui", specifier.slice(4));
  else if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else return null;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (known.has(base + ext)) return base + ext;
  }
  return null;
}

describe("values from client files", () => {
  it("finds a constant or helper, and leaves components and types alone", () => {
    const client = [
      '"use client";',
      'export const ALL = "all";',
      "export function useThing() {}",
      "export function Filter() {}",
    ].join("\n");
    expect(clientValueExports(client)).toEqual(["ALL", "useThing"]);
    expect(
      valueImports(
        'import { ALL, Filter, type Props } from "./filter";\nimport type { X } from "./x";',
      ),
    ).toEqual([{ specifier: "./filter", names: ["ALL", "Filter"] }]);
  });

  it("no server file imports a value from a client file", () => {
    const files = [
      ...sourcesUnder(join(root, "app")),
      ...sourcesUnder(join(root, "packages", "ui")),
    ];
    const known = new Set(files);
    const sources = new Map(
      files.map((file) => [file, readFileSync(file, "utf8")]),
    );
    const values = new Map<string, string[]>();
    for (const [file, source] of sources) {
      if (isClient(source)) values.set(file, clientValueExports(source));
    }
    const found: string[] = [];
    for (const [file, source] of sources) {
      if (isClient(source)) continue;
      for (const { specifier, names } of valueImports(source)) {
        const target = resolveSpecifier(file, specifier, known);
        const exported = target ? values.get(target) : undefined;
        if (!target || !exported) continue;
        for (const name of names) {
          if (exported.includes(name)) {
            found.push(
              `${relative(root, file)} imports ${name} from ${relative(root, target)}`,
            );
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
