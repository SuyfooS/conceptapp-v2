import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { sourceFiles } from "./boundaries";

/**
 * User-facing copy lives in messages/he.json and messages/en.json. This finds
 * Hebrew in string literals, template literals and JSX text in code, so a
 * string that skipped the message files fails the build. Comments are not
 * code and are ignored.
 */

const HEBREW = /[֐-׿]/;

/** Folders whose code renders copy. */
const SCANNED = ["app", "packages/ui", "modules"];

/** Files allowed to hold Hebrew, each with the reason. */
export const ALLOWED: Record<string, string> = {
  "app/design/shell/data.ts":
    "mock rows for the layout demo; stands in for database data, not UI copy",
  "app/design/console/data.ts":
    "mock rows for the console demo; stands in for database data, not UI copy",
  "app/global-error-copy.ts":
    "global-error has no provider, and importing the message file there loads it on every page; messages.test.ts keeps the words equal to errors in he.json",
};

export type HebrewLiteral = { line: number; text: string };

export function hebrewLiterals(file: string, source: string): HebrewLiteral[] {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const found: HebrewLiteral[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)) &&
      HEBREW.test(node.text)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      found.push({ line: line + 1, text: node.text.trim() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export function hebrewLiteralViolations(root: string): string[] {
  return SCANNED.filter((dir) => existsSync(join(root, dir)))
    .flatMap((dir) => sourceFiles(dir, root))
    .filter((file) => !/\.test\.tsx?$/.test(file) && !(file in ALLOWED))
    .flatMap((file) =>
      hebrewLiterals(file, readFileSync(join(root, file), "utf8")).map(
        ({ line, text }) => `${file}:${line}: ${text}`,
      ),
    );
}
