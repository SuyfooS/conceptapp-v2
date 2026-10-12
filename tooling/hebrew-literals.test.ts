import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED,
  hebrewLiterals,
  hebrewLiteralViolations,
} from "./hebrew-literals";

const root = join(__dirname, "..");

describe("hebrewLiterals", () => {
  it("finds Hebrew in strings, templates, attributes and JSX text", () => {
    const source = [
      'const a = "שלום";',
      `const b = \`שלום \${name}\`;`,
      `const c = \`\${n} סועדים\`;`,
      'const el = <Button label="שמירה">פרסום</Button>;',
    ].join("\n");
    expect(hebrewLiterals("x.tsx", source).map((f) => f.line)).toEqual([
      1, 2, 3, 4, 4,
    ]);
  });

  it("ignores comments, English copy and message keys", () => {
    const source = [
      "// הערה בעברית",
      "/** תיעוד: א׳, ב׳ */",
      'const a = t("shell.home.title");',
      'const el = <span dir="ltr">ConceptApp</span>; {/* עוד הערה */}',
    ].join("\n");
    expect(hebrewLiterals("x.tsx", source)).toEqual([]);
  });
});

describe("the repo", () => {
  it("keeps every Hebrew string in messages/", () => {
    expect(hebrewLiteralViolations(root)).toEqual([]);
  });

  it("allows only files that exist", () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });
});
