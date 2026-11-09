import { describe, expect, it } from "vitest";
import { cleanTyped, oneLineSchema, tidyLine } from "./typed-text";

// Every special character is a \u escape, never the character itself (see typed-text.ts).
describe("cleanTyped", () => {
  it.each([
    ["direction marks", "\u200F12\u200F-571", "12-571"],
    ["LRM and the Arabic letter mark", "\u200E12\u061C-571", "12-571"],
    ["embeddings and isolates", "\u202B12\u202C-\u2067571\u2069", "12-571"],
    ["an en dash and a minus sign", "12\u2013571\u2212041116", "12-571-041116"],
    [
      "an em dash and a non-breaking hyphen",
      "12\u2014571\u2011041116",
      "12-571-041116",
    ],
    [
      "small and full-width hyphens",
      "12\uFE63571\uFF0D041116",
      "12-571-041116",
    ],
    ["a Hebrew maqaf", "12\u05BE571", "12-571"],
    ["a soft hyphen", "041\u00AD116", "041116"],
    ["Persian digits", "\u06F1\u06F2", "12"],
    ["Arabic-Indic digits", "\u0661\u0662\u0663", "123"],
    ["full-width digits, through NFKC", "\uFF11\uFF12", "12"],
    ["a no-break space", "12\u00A0571", "12 571"],
    [
      "a thin space and a narrow no-break space",
      "12\u2009571\u202F6",
      "12 571 6",
    ],
    ["a tab", "12\t571", "12 571"],
    ["a zero-width space and a byte-order mark", "\uFEFF12\u200B571", "12571"],
    ["nothing", "", ""],
  ])("cleans %s", (_name, input, expected) => {
    expect(cleanTyped(input)).toBe(expected);
  });

  it("gives ASCII back unchanged", () => {
    const ascii = " Bank 12, branch 571 / account 041116-7. ";
    expect(cleanTyped(ascii)).toBe(ascii);
  });

  it("keeps Hebrew and line breaks", () => {
    expect(cleanTyped("הרצל\n12")).toBe("הרצל\n12");
  });

  it("keeps the zero-width joiner and non-joiner, which shape text", () => {
    expect(cleanTyped("a‌b‍c")).toBe("a‌b‍c");
  });
});

describe("tidyLine", () => {
  it("trims and keeps one space between words", () => {
    expect(tidyLine("  \u200Fהרצל\u00A0\u00A0 12 ")).toBe("הרצל 12");
  });
});

describe("oneLineSchema", () => {
  const line = oneLineSchema(2, 5);

  it("stores the tidied text", () => {
    expect(line.parse("  ab  c ")).toBe("ab c");
    // A tab is a space by then, not a control.
    expect(line.parse("ab\tc")).toBe("ab c");
  });

  it.each([
    ["too short", "a"],
    ["too short once trimmed", "  a  "],
    ["too long", "abcdef"],
    ["two lines", "ab\ncd"],
    ["with a line separator", "ab c"],
    ["with a vertical tab", "ab\u000Bc"],
    ["with a next-line control", "ab\u0085c"],
    ["with a null", "ab\u0000c"],
  ])("refuses text %s", (_name, input) => {
    expect(line.safeParse(input).success).toBe(false);
  });
});
