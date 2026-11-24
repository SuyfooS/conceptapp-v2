import { describe, expect, it } from "vitest";
import { afterApproval, CONFIRM_TITLE, entryTarget } from "./next-approval";

/*
 * Where a manager goes on once an entry they approved left the card with
 * the focus (accessibility, part 5): the next entry's words down, else the
 * nearest one up, else the card's title; never a "אישור", which Enter held
 * down would press too.
 */

describe("entryTarget", () => {
  it("finds an entry's words by its id", () => {
    expect(entryTarget("68000000-0000-4000-a000-000000000031")).toBe(
      '[data-confirm-target="68000000-0000-4000-a000-000000000031"]',
    );
  });

  it("keeps a quote or a backslash inside the attribute's value", () => {
    expect(entryTarget('a"b\\c')).toBe('[data-confirm-target="a\\"b\\\\c"]');
  });
});

describe("afterApproval", () => {
  it("tries the next entries down, then up, then the card's title", () => {
    expect(afterApproval(["a", "b", "c"], "b")).toEqual([
      entryTarget("c"),
      entryTarget("a"),
      CONFIRM_TITLE,
    ]);
    expect(afterApproval(["a", "b", "c"], "c")).toEqual([
      entryTarget("b"),
      entryTarget("a"),
      CONFIRM_TITLE,
    ]);
  });

  it("has only the card's title once the last one went", () => {
    // The card goes with it: the page's title takes the focus after this.
    expect(afterApproval(["a"], "a")).toEqual([CONFIRM_TITLE]);
  });
});
