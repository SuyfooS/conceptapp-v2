import { readFileSync } from "node:fs";
import { join } from "node:path";
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

/** `--breakpoint-md` as a stylesheet sets it, if it does. */
function mdIn(file: string): string | undefined {
  const css = readFileSync(join(__dirname, "../../..", file), "utf8");
  return css.match(/--breakpoint-md:\s*([^;]+);/)?.[1]?.trim();
}

describe("PEOPLE_BESIDE", () => {
  // In the CSS's own unit: rem in a media query follows the person's
  // default font size, so px would part from the layout once it is larger
  // (the panel hidden, yet a choice sent to it and said current).
  it("is Tailwind's md as the CSS has it, where the people panel shows beside the list", () => {
    const md =
      mdIn("app/globals.css") ?? mdIn("node_modules/tailwindcss/theme.css");
    expect(md).toBeDefined();
    expect(PEOPLE_BESIDE).toBe(`(min-width: ${md})`);
  });
});
