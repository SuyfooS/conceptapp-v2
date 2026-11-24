import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import { SWAP_DONE, shiftTarget } from "./swap-focus";

/*
 * What a swap step says once it went through, and where the focus comes back
 * to (accessibility, part 3).
 */

const word = (tree: unknown, key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (at, part) =>
        at && typeof at === "object"
          ? (at as Record<string, unknown>)[part]
          : undefined,
      tree,
    );

describe("SWAP_DONE", () => {
  it("says what came of each step in the words its card then shows", () => {
    expect(SWAP_DONE).toEqual({
      give: "shifts.swap.open",
      take: "shifts.swap.offers.takenByYou",
      cancel: "shifts.swap.cancelled",
    });
  });

  it("has every line in Hebrew and in English", () => {
    for (const key of Object.values(SWAP_DONE)) {
      expect(typeof word(he.app, key)).toBe("string");
      expect(typeof word(en.app, key)).toBe("string");
    }
    expect(word(he.app, SWAP_DONE.cancel)).toBe(
      "הבקשה בוטלה, המשמרת נשארת שלך",
    );
  });
});

describe("shiftTarget", () => {
  it("finds a shift's place on the screen by its id", () => {
    expect(shiftTarget("2026-11-04/morning")).toBe(
      '[data-shift-target="2026-11-04/morning"]',
    );
  });

  it("keeps a quote or a backslash inside the attribute's value", () => {
    expect(shiftTarget('a"b\\c')).toBe('[data-shift-target="a\\"b\\\\c"]');
  });
});
