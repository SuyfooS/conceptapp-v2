import { describe, expect, it } from "vitest";
import { offerTarget, shiftTarget } from "./swap-focus";

/*
 * Where the focus comes back to once a swap step went through
 * (accessibility, part 3). What each step says is checked where it is said,
 * on the screens (e2e).
 */

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

describe("offerTarget", () => {
  it("finds an offer's words by its request's id", () => {
    expect(offerTarget("00000000-0000-4000-a000-000000000004")).toBe(
      '[data-offer-target="00000000-0000-4000-a000-000000000004"]',
    );
  });

  it("keeps a quote or a backslash inside the attribute's value", () => {
    expect(offerTarget('a"b\\c')).toBe('[data-offer-target="a\\"b\\\\c"]');
  });
});
