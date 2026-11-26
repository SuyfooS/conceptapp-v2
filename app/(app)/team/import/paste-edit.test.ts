import { describe, expect, it } from "vitest";
import { lineRange, withoutLines } from "./paste-edit";

describe("lineRange", () => {
  const text = "דנה כהן 050\r\n\nיוסי לוי\n052-765-4321";

  it("finds a line as pasted, without its line break, whatever the breaks are", () => {
    const range = lineRange(text, { line: 1 });
    expect(range).toEqual({ start: 0, end: 11 });
    expect(text.slice(range?.start, range?.end)).toBe("דנה כהן 050");
    const third = lineRange(text, { line: 3 });
    expect(text.slice(third?.start, third?.end)).toBe("יוסי לוי");
  });

  it("spans a name line and its number line", () => {
    const pair = lineRange(text, { line: 3, last: 4 });
    expect(text.slice(pair?.start, pair?.end)).toBe("יוסי לוי\n052-765-4321");
  });

  it("is null for a line the text no longer has", () => {
    expect(lineRange(text, { line: 9 })).toBeNull();
    expect(lineRange("", { line: 1 })).toEqual({ start: 0, end: 0 });
  });
});

describe("withoutLines", () => {
  it("takes the lines out, numbered as pasted, a pair with what is between", () => {
    const text = "כותרת\r\nדנה\n\n050-123-4567\nיוסי 052-765-4321";
    expect(withoutLines(text, [{ line: 1 }])).toBe(
      "דנה\n\n050-123-4567\nיוסי 052-765-4321",
    );
    expect(withoutLines(text, [{ line: 2, last: 4 }, { line: 1 }])).toBe(
      "יוסי 052-765-4321",
    );
    expect(withoutLines(text, [])).toBe(text.replace("\r\n", "\n"));
  });
});
