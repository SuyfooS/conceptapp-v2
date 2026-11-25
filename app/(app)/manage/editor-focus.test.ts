import { describe, expect, it } from "vitest";
import {
  byAttribute,
  groupRow,
  refusalArrived,
  sheetReturnTo,
} from "./editor-focus";

// Where the focus goes in the editors of a list of things (accessibility,
// part 8): onto a removal's "ביטול" once its sheet has closed, back to what
// opened a sheet closed any other way, the section's title when that is
// gone, the row "ביטול" put back, and back on a "ביטול" refused.

describe("byAttribute", () => {
  it("finds the elements whose attribute has the value", () => {
    expect(byAttribute("data-item-row", "item-3")).toBe(
      '[data-item-row="item-3"]',
    );
    expect(byAttribute("aria-label", "Remove the photo: Fridge")).toBe(
      '[aria-label="Remove the photo: Fridge"]',
    );
  });

  it("reads any value as itself, quotes, backslashes and new lines included", () => {
    expect(byAttribute("data-position-remove", 'a"b\\c')).toBe(
      '[data-position-remove="a\\"b\\\\c"]',
    );
    expect(byAttribute("data-position-remove", "a\nb")).toBe(
      '[data-position-remove="a\\a b"]',
    );
  });
});

describe("groupRow", () => {
  const rows = ["morning", "evening", "add"].map(
    (name) => ({ name }) as unknown as Element,
  );
  const asked: string[] = [];
  const group = {
    querySelectorAll(selectors: string) {
      asked.push(selectors);
      return rows;
    },
  };

  it("is the group's own button at that place, the add row coming after them", () => {
    expect(groupRow(group, 0)).toBe(rows[0]);
    expect(groupRow(group, 1)).toBe(rows[1]);
    expect(asked.every((selectors) => selectors === ":scope > button")).toBe(
      true,
    );
  });

  it("is none past the rows, before them, or with no group", () => {
    expect(groupRow(group, 3)).toBeNull();
    expect(groupRow(group, -1)).toBeNull();
    expect(groupRow(null, 0)).toBeNull();
    expect(groupRow(undefined, 0)).toBeNull();
  });
});

describe("sheetReturnTo", () => {
  const undo = { name: "undo" } as unknown as Element;
  const opener = { name: "row" } as unknown as Element;
  const heading = { name: "heading" } as unknown as Element;

  it("goes onto the removal's undo after a removal, else the section's title", () => {
    expect(sheetReturnTo({ removed: true, undo, opener, heading })).toEqual([
      undo,
      heading,
    ]);
  });

  it("goes back to what opened it otherwise, else the section's title", () => {
    expect(sheetReturnTo({ removed: false, undo, opener, heading })).toEqual([
      opener,
      heading,
    ]);
    expect(
      sheetReturnTo({ removed: false, undo: null, opener: null, heading }),
    ).toEqual([null, heading]);
  });
});

describe("refusalArrived", () => {
  type Refusal = { reason: string };

  it("arrives once for each refusal: shown again, the screen leaves the focus where it is", () => {
    const seen = { current: null as Refusal | null };
    const offline: Refusal = { reason: "offline" };
    expect(refusalArrived(seen, offline, false)).toBe(true);
    // A screen shown again from a hidden <Activity>: the same one.
    expect(refusalArrived(seen, offline, false)).toBe(false);
    // Refused again with the same words: a new one.
    expect(refusalArrived(seen, { ...offline }, false)).toBe(true);
  });

  it("waits while its button still waits, and arrives once it no longer does", () => {
    const seen = { current: null as Refusal | null };
    const failed: Refusal = { reason: "failed" };
    expect(refusalArrived(seen, failed, true)).toBe(false);
    expect(seen.current).toBeNull();
    expect(refusalArrived(seen, failed, false)).toBe(true);
    // Pressed again, waiting with the refusal still shown: nothing anew.
    expect(refusalArrived(seen, failed, true)).toBe(false);
    expect(refusalArrived(seen, failed, false)).toBe(false);
  });

  it("is nothing without a refusal, and keeps the one seen", () => {
    const failed: Refusal = { reason: "failed" };
    const seen = { current: failed as Refusal | null };
    expect(refusalArrived(seen, null, false)).toBe(false);
    expect(seen.current).toBe(failed);
    expect(refusalArrived(seen, failed, false)).toBe(false);
  });
});
