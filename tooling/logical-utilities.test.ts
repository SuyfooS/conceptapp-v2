import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * CLAUDE.md's UI rule: logical utilities only (`ps-`/`pe-`, `ms-`/`me-`,
 * `start-`/`end-`, `text-start`), never `pl-`, `mr-`, `left-`. A screen that
 * runs in either direction (the hiring file in English inside the Hebrew
 * shell) needs the logical ones to stay right; `rtl:`/`ltr:` follow
 * `:dir()` for what has to name a side. This finds a physical utility in
 * any class the app, @ui or a module writes, with whatever variant before
 * it, and never words in a comment ("left to right").
 */

const ROOTS = ["app", "packages/ui", "modules"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sources(path);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/**
 * A physical utility as a class: its name after a space, a quote, a
 * backtick or a variant's colon, then a value (a number, a fraction, an
 * arbitrary value, px, auto or full), or the alignments that have a side.
 */
const PHYSICAL =
  /(?<=[\s"'`:])-?(?:pl|pr|ml|mr|left|right|scroll-ml|scroll-mr|scroll-pl|scroll-pr|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br)-(?:\d|\[|px\b|auto\b|full\b)|(?<=[\s"'`:])(?:text-left|text-right|float-left|float-right)(?=[\s"'`])/g;

/** What a file writes, its comments left out. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The one side named on purpose, with its reason: `ltrInputClass`, a
 * left-to-right input that aligns with the right-to-left page around it
 * (CLAUDE.md's UI rules; `text-align: match-parent` would say it
 * logically, but Chromium lacks it).
 */
const ALLOWED = ["packages/ui/text-field.tsx: text-right"];

describe("the classes", () => {
  it("name sides logically, everywhere", () => {
    const found = ROOTS.flatMap(sources).flatMap((path) =>
      [...code(readFileSync(path, "utf8")).matchAll(PHYSICAL)].map(
        ([match]) => `${path.replaceAll("\\", "/")}: ${match}`,
      ),
    );
    expect(found.filter((hit) => !ALLOWED.includes(hit))).toEqual([]);
    // The exception is still there, so this list says what is.
    expect(found).toEqual(expect.arrayContaining(ALLOWED));
  });

  it("finds a physical one with its variants, and not words", () => {
    const hits = (text: string) => [...code(text).matchAll(PHYSICAL)].length;
    expect(hits('className="pl-4"')).toBe(1);
    expect(hits('"max-md:[body:has(x)_&]:right-[5.625rem]"')).toBe(1);
    expect(hits('"-ml-1 text-right"')).toBe(2);
    expect(hits('"ps-4 -ms-1 start-[5.625rem] text-start"')).toBe(0);
    expect(hits("// a frame left to right\n")).toBe(0);
    expect(hits('label="left-to-right"')).toBe(0);
  });
});
