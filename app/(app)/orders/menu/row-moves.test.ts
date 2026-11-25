import { describe, expect, it } from "vitest";
import { arrowAfter } from "./row-moves";

/*
 * Which arrow of a moved category or place has the focus once the move is
 * drawn (accessibility, part 9): the one pressed while the row can go on
 * that way, the other one once it reached that end.
 */

describe("arrowAfter", () => {
  it("keeps the arrow pressed while the row can go on that way", () => {
    // "הזזה למטה" on the first of four: second now, down again is there.
    expect(arrowAfter(1, 4, 1)).toBe(1);
    // "הזזה למעלה" on the last of four: third now, up again is there.
    expect(arrowAfter(2, 4, -1)).toBe(-1);
  });

  it("gives the other arrow once the row reached that end", () => {
    // Down to the last of four: only up is left.
    expect(arrowAfter(3, 4, 1)).toBe(-1);
    // Up to the first: only down is left.
    expect(arrowAfter(0, 4, -1)).toBe(1);
  });

  it("reads two rows as both ends at once", () => {
    expect(arrowAfter(1, 2, 1)).toBe(-1);
    expect(arrowAfter(0, 2, -1)).toBe(1);
  });
});
