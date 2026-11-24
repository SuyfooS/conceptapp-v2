import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import { offerTarget, SWAP_DONE, shiftTarget } from "./swap-focus";

/*
 * What a swap step says once it went through, and where the focus comes back
 * to (accessibility, part 3).
 */

describe("SWAP_DONE", () => {
  // The typecheck finds each step's key, and the message check its English:
  // what is left to check is the new words a withdrawn request is said in.
  it("says a withdrawn request keeps the shift", () => {
    expect(SWAP_DONE.cancel).toBe("shifts.swap.cancelled");
    expect(he.app.shifts.swap.cancelled).toBe("הבקשה בוטלה, המשמרת נשארת שלך");
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
