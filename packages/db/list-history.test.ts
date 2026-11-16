import { afterEach, describe, expect, it, vi } from "vitest";
import { changesOf, reopensOf } from "./list-history";

/**
 * Each list item's history as `getList` reads it (L6a): the rows of
 * `public.list_item_changes` and `public.list_reopens`, checked one by one.
 */
const ITEM = "44444444-4444-4444-8444-444444444444";
const NOA = "33333333-3333-4333-8333-333333333333";

const changeRow = {
  id: 7,
  item_id: ITEM,
  changed_by: NOA,
  changed_at: "2026-12-03T05:42:00+00:00",
  changed: ["reading"],
  checked: null,
  given: null,
  reading: 4,
  answer: null,
  comment: null,
  photo: false,
  done: true,
};

const reopenRow = {
  id: "99999999-9999-4999-8999-999999999999",
  reopened_by: NOA,
  reopened_at: "2026-12-03T08:00:00+00:00",
  was: "finished",
  was_by: null,
  was_at: "2026-12-03T06:05:00+00:00",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("an item's changes", () => {
  it("read as the screens keep them: the id as text, an unticked item as false", () => {
    expect(changesOf([changeRow])).toEqual([
      {
        id: "7",
        itemId: ITEM,
        by: NOA,
        at: "2026-12-03T05:42:00+00:00",
        changed: ["reading"],
        checked: false,
        given: null,
        reading: 4,
        answer: null,
        comment: null,
        photo: false,
        done: true,
      },
    ]);
    expect(changesOf([{ ...changeRow, checked: true }])[0]?.checked).toBe(true);
  });

  it("leave out a field they don't know, and a row that doesn't read", () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      changesOf([
        { ...changeRow, changed: ["reading", "fixed"] },
        { ...changeRow, id: 8, reading: "warm" },
        { ...changeRow, id: 9, changed_by: null },
      ]).map((change) => [change.id, change.changed, change.by]),
    ).toEqual([
      ["7", ["reading"], NOA],
      ["9", ["reading"], null],
    ]);
    expect(said).toHaveBeenCalledTimes(1);
  });
});

describe("a list's reopens", () => {
  it("read with how it was closed, and whoever is gone as nobody", () => {
    expect(reopensOf([reopenRow])).toEqual([
      {
        id: reopenRow.id,
        reopenedBy: NOA,
        reopenedAt: "2026-12-03T08:00:00+00:00",
        was: "finished",
        wasBy: null,
        wasAt: "2026-12-03T06:05:00+00:00",
      },
    ]);
  });

  it("leave out a close the database never keeps", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(reopensOf([{ ...reopenRow, was: "missed" }])).toEqual([]);
  });
});
