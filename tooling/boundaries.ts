import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Module isolation that Biome's path patterns cannot express: a file in
 * `modules/<key>/` may reach another module only through its manifest, and
 * relative imports may not climb out of the module folder at any depth.
 */

const IMPORT_SPECIFIER =
  /(?:\bimport\s[^"'`]*?\bfrom\s*|\bimport\s*\(?\s*|\bexport\s[^"'`]*?\bfrom\s*)["']([^"']+)["']/g;

export function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");
}

/** `modules/<key>/<rest>` for a repo-relative POSIX path inside modules/, else null. */
function moduleTarget(path: string): { key: string; rest: string } | null {
  const [root, key, ...rest] = path.split("/");
  if (root !== "modules" || !key || rest.length === 0) return null;
  return { key, rest: rest.join("/") };
}

/**
 * Imports in `file` (repo-relative POSIX path) that reach another module's
 * internals. Returns the offending specifiers.
 */
export function crossModuleImports(file: string, source: string): string[] {
  const own = moduleTarget(file);
  if (!own) return [];
  return importSpecifiers(source).filter((specifier) => {
    let target: string;
    if (specifier.startsWith("@modules/")) {
      target = `modules/${specifier.slice("@modules/".length)}`;
    } else if (specifier.startsWith(".")) {
      target = posix.normalize(posix.join(posix.dirname(file), specifier));
    } else {
      return false;
    }
    const other = moduleTarget(target);
    if (!other) return target.startsWith("modules/") || target === "modules";
    if (other.key === own.key) return false;
    return other.rest.replace(/\.tsx?$/, "") !== "manifest";
  });
}

export function sourceFiles(dir: string, root: string): string[] {
  const entries = readdirSync(join(root, dir), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, root);
    return /\.(ts|tsx|mts)$/.test(entry.name) ? [path] : [];
  });
}

export function crossModuleViolations(root: string): string[] {
  return sourceFiles("modules", root).flatMap((file) =>
    crossModuleImports(file, readFileSync(join(root, file), "utf8")).map(
      (specifier) => `${file}: ${specifier}`,
    ),
  );
}
