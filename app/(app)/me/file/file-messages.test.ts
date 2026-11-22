import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { FILE_NAMESPACES, fileMessages } = await import("./file-messages");
const en = (await import("@/messages/en.json")).default;
const he = (await import("@/messages/he.json")).default;

/*
 * The English frame gives the browser the file's words alone (profile H5a):
 * every namespace a part of the flow reads must be among them, or the
 * English screen throws on a missing word. The parts are the files here and
 * everything of @ui they draw, followed through their own imports.
 */

const root = join(__dirname, "..", "..", "..", "..");
const here = __dirname;

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** A file's imports of @ui and of its own folder, as paths. */
function importsOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].flatMap(
    ([, spec = ""]) => {
      const base = spec.startsWith("@ui/")
        ? join(root, "packages/ui", spec.slice(4))
        : spec.startsWith(".")
          ? join(dirname(path), spec)
          : null;
      if (!base) return [];
      for (const file of [`${base}.tsx`, `${base}.ts`]) {
        if (existsSync(file)) return [file];
      }
      return [];
    },
  );
}

/** Every file the flow draws, from its own folder through @ui. */
function drawn(): string[] {
  const seen = new Set<string>();
  const queue = filesIn(here);
  while (queue.length > 0) {
    const path = queue.pop() as string;
    if (seen.has(path)) continue;
    seen.add(path);
    // Up and out of the flow's folder only into @ui (the profile's actions
    // are a server action, which reads no words in the browser).
    if (!path.startsWith(here) && !path.includes(join("packages", "ui"))) {
      continue;
    }
    queue.push(...importsOf(path));
  }
  return [...seen].filter(
    (path) =>
      (path.startsWith(here) || path.includes(join("packages", "ui"))) &&
      /^\s*["']use client["']/.test(readFileSync(path, "utf8")),
  );
}

describe("the English file's words", () => {
  it("carry every namespace the flow's client parts read", () => {
    const read = drawn().flatMap((path) =>
      [
        ...readFileSync(path, "utf8").matchAll(
          /useTranslations\(\s*(?:["']([^"']*)["'])?\s*\)/g,
        ),
      ].map(([, namespace]) => ({
        path: relative(root, path),
        namespace: namespace ?? "",
      })),
    );
    // Followed through @ui: the code boxes read their own words.
    expect(new Set(read.map((one) => one.namespace))).toEqual(
      new Set(FILE_NAMESPACES),
    );
    for (const { path, namespace } of read) {
      expect(
        FILE_NAMESPACES.some(
          (carried) =>
            namespace === carried || namespace.startsWith(`${carried}.`),
        ),
        `${path}: ${namespace || "(all)"}`,
      ).toBe(true);
    }
  });

  it("hold those namespaces whole, in both languages, and nothing else", () => {
    for (const messages of [he, en]) {
      const picked = fileMessages(messages as typeof he);
      expect(picked.app.file).toEqual(messages.app.file);
      expect(picked.banks).toEqual(messages.banks);
      expect(picked.pensionFunds).toEqual(messages.pensionFunds);
      expect(picked.ui.codeSlots).toEqual(messages.ui.codeSlots);
      expect(Object.keys(picked).sort()).toEqual(
        ["app", "banks", "pensionFunds", "ui"].sort(),
      );
      expect(Object.keys(picked.app)).toEqual(["file"]);
      expect(Object.keys(picked.ui)).toEqual(["codeSlots"]);
    }
  });
});
