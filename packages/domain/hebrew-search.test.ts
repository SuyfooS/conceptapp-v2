import { describe, expect, it } from "vitest";
import { looseHebrew, nameMatches } from "./hebrew-search";

describe("finding a name by what was typed", () => {
  it("reads Hebrew loosely: no niqqud, final letters as the others", () => {
    expect(looseHebrew("שָׁלוֹם")).toBe(looseHebrew("שלומ"));
    expect(looseHebrew("לחם")).toBe(looseHebrew("לחמ"));
    expect(looseHebrew("Pasta")).toBe("pasta");
  });

  it("finds a name by the starts of its words", () => {
    expect(nameMatches("סלט ירוק", "יר")).toBe(true);
    expect(nameMatches("סלט ירוק", "סל יר")).toBe(true);
    expect(nameMatches("סלט ירוק", "רוק")).toBe(false);
    expect(nameMatches("פוקאצ'ה", "פוק")).toBe(true);
    expect(nameMatches("דג היום", "היו")).toBe(true);
    expect(nameMatches("קפה-הפוך", "הפו")).toBe(true);
  });

  it("finds a word typed with a final letter mid-word, as a phone writes it", () => {
    expect(nameMatches("חומוס", "חומ")).toBe(true);
    expect(nameMatches("חומוס", "חום")).toBe(true);
  });

  it("finds every name for nothing typed", () => {
    expect(nameMatches("חומוס", "  ")).toBe(true);
  });
});
