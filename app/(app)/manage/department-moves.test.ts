import { describe, expect, it } from "vitest";
import { movesOf, PEOPLE_BESIDE } from "./department-moves";

// The departments editor's choices (accessibility, part 6): which way a
// department can still move, so its move buttons say "unavailable" at the
// ends instead of going out from under the focus.

describe("movesOf", () => {
  it("moves a middle department either way", () => {
    expect(movesOf(1, 3)).toEqual({ up: true, down: true });
  });

  it("not up from the top, nor down from the bottom", () => {
    expect(movesOf(0, 3)).toEqual({ up: false, down: true });
    expect(movesOf(2, 3)).toEqual({ up: true, down: false });
  });

  it("neither way for the only one, or one not in the list", () => {
    expect(movesOf(0, 1)).toEqual({ up: false, down: false });
    expect(movesOf(-1, 3)).toEqual({ up: false, down: false });
    expect(movesOf(3, 3)).toEqual({ up: false, down: false });
    expect(movesOf(0, 0)).toEqual({ up: false, down: false });
  });
});

describe("PEOPLE_BESIDE", () => {
  it("is Tailwind's md, where the people panel shows beside the list", () => {
    expect(PEOPLE_BESIDE).toBe("(min-width: 768px)");
  });
});
