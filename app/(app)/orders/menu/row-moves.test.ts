import { describe, expect, it } from "vitest";
import { arrowAfter, arrowRefs, type MoveWords, moveSaid } from "./row-moves";

/*
 * Which arrow of a moved category or place has the focus once the move is
 * drawn (accessibility, part 9): the one pressed while the row can go on
 * that way, the other one once it reached that end. Then what is said once
 * the list's save answered: where the row is in the list as drawn then,
 * moved there or back there, or nothing once it is gone. And the arrows'
 * refs, the same on every drawing, so React never takes a moved row's
 * arrow off the list while it gives the arrow its focus back.
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

describe("moveSaid", () => {
  const words: MoveWords = {
    moved: (place, count) => `4 now ${place} of ${count}`,
    back: (place, count) => `4 back at ${place} of ${count}`,
  };
  const key = (row: string) => row;

  it("says where the row is now once its save went through", () => {
    expect(
      moveSaid(
        { key: "4", words, saved: true },
        ["1", "2", "3", "5", "4"],
        key,
      ),
    ).toBe("4 now 5 of 5");
  });

  it("says where the row is back once the save was refused, by the list put back", () => {
    expect(
      moveSaid(
        { key: "4", words, saved: false },
        ["1", "2", "3", "4", "5"],
        key,
      ),
    ).toBe("4 back at 4 of 5");
  });

  it("counts the row where the list has it then, after what else changed", () => {
    // A row above it removed by the change that answered.
    expect(
      moveSaid({ key: "4", words, saved: true }, ["2", "3", "5", "4"], key),
    ).toBe("4 now 4 of 4");
  });

  it("says nothing once the row is gone", () => {
    expect(
      moveSaid({ key: "4", words, saved: true }, ["1", "2", "3"], key),
    ).toBeNull();
  });
});

describe("arrowRefs", () => {
  type Node = { name: string };

  it("gives each arrow the same ref on every drawing, and each arrow its own", () => {
    const { refOf } = arrowRefs<Node>();
    // Two drawings of the same row: React sees one ref, and leaves it on.
    expect(refOf("4", 1)).toBe(refOf("4", 1));
    expect(refOf("4", 1)).not.toBe(refOf("4", -1));
    expect(refOf("4", 1)).not.toBe(refOf("5", 1));
  });

  it("knows an arrow while it is drawn, and its cleanup forgets only that one", () => {
    const { arrows, refOf } = arrowRefs<Node>();
    const ref = refOf("4", 1);
    const first: Node = { name: "first" };
    const gone = ref(first);
    expect([...arrows.values()]).toEqual([first]);
    // Drawn again in a new button (Next showing the screen again) before
    // the old one's cleanup ran: the new one stays.
    const second: Node = { name: "second" };
    const goneToo = ref(second);
    gone?.();
    expect([...arrows.values()]).toEqual([second]);
    goneToo?.();
    expect(arrows.size).toBe(0);
    expect(ref(null)).toBeUndefined();
  });
});
