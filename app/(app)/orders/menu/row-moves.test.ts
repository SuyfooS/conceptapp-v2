import { describe, expect, it } from "vitest";
import {
  arrowAfter,
  arrowRefs,
  type Move,
  type MoveHeard,
  type MoveWords,
  moveAnswers,
  moveFrom,
  moveSaid,
} from "./row-moves";

/*
 * Which arrow of a moved category or place has the focus once the move is
 * drawn (accessibility, part 9): the one pressed while the row can go on
 * that way, the other one once it reached that end. Then the move as a
 * press makes it, with the row it passed; what is said once the list's
 * saves all answered: where the row is in the list as drawn, moved there
 * or back there, only on a drawing that shows what the saves did, or
 * nothing once it is gone; and whether it moved or went back, by the saves
 * that had the move, heard only once none is on its way, whichever of them
 * answers first (after CI's fourth run). And the arrows' refs, the same on
 * every drawing, so React never takes a moved row's arrow off the list
 * while it gives the arrow its focus back.
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

const words: MoveWords = {
  moved: (place, count) => `4 now ${place} of ${count}`,
  back: (place, count) => `4 back at ${place} of ${count}`,
};
const key = (row: string) => row;

describe("moveFrom", () => {
  it("takes the row next to the moved one, the way it goes, as the one it passes", () => {
    const rows = ["1", "2", "3", "4", "5"];
    expect(moveFrom(rows, key, "4", 1, words)).toEqual({
      key: "4",
      by: 1,
      passed: "5",
      words,
    });
    expect(moveFrom(rows, key, "4", -1, words).passed).toBe("3");
  });

  it("passes nothing where the list has no row that way, or not the row", () => {
    expect(moveFrom(["1", "2"], key, "2", 1, words).passed).toBeNull();
    expect(moveFrom(["1", "2"], key, "1", -1, words).passed).toBeNull();
    expect(moveFrom(["1", "2"], key, "9", 1, words).passed).toBeNull();
  });
});

describe("moveSaid", () => {
  // Table 4 moved down past table 5.
  const down: Move = { key: "4", by: 1, passed: "5", words };
  const saved: MoveHeard = { ...down, saved: true };
  const refused: MoveHeard = { ...down, saved: false };

  it("says where the row is now once a save that has the move went through", () => {
    expect(moveSaid(saved, ["1", "2", "3", "5", "4"], key)).toEqual({
      words: "4 now 5 of 5",
    });
  });

  it("says where the row is back once none did, by the list put back", () => {
    expect(moveSaid(refused, ["1", "2", "3", "4", "5"], key)).toEqual({
      words: "4 back at 4 of 5",
    });
  });

  it("reads a move up by the row it passed as well", () => {
    const up: MoveHeard = { key: "4", by: -1, passed: "3", words, saved: true };
    expect(moveSaid(up, ["1", "2", "4", "3", "5"], key)).toEqual({
      words: "4 now 3 of 5",
    });
    expect(
      moveSaid({ ...up, saved: false }, ["1", "2", "3", "4", "5"], key),
    ).toEqual({ words: "4 back at 4 of 5" });
  });

  it("counts the row where the list has it then, after what else changed", () => {
    // A row above it removed by the change that answered.
    expect(moveSaid(saved, ["2", "3", "5", "4"], key)).toEqual({
      words: "4 now 4 of 4",
    });
  });

  it("waits while the drawing doesn't show what the saves did", () => {
    // Saved, while the list drawn is still the one from before the move
    // (the latest change refused first, the move's own answer to come, or
    // the server's list not drawn yet): nothing yet, never "back".
    expect(moveSaid(saved, ["1", "2", "3", "4", "5"], key)).toBeNull();
    // Refused, while the list drawn still has the move.
    expect(moveSaid(refused, ["1", "2", "3", "5", "4"], key)).toBeNull();
  });

  it("goes by the saves alone once the row it passed is gone", () => {
    // Table 5 removed by a later change that saved.
    expect(moveSaid(saved, ["1", "2", "3", "4"], key)).toEqual({
      words: "4 now 4 of 4",
    });
    expect(moveSaid({ ...saved, passed: null }, ["4", "1"], key)).toEqual({
      words: "4 now 1 of 2",
    });
  });

  it("says nothing ever once the row is gone", () => {
    expect(moveSaid(saved, ["1", "2", "3"], key)).toEqual({ words: null });
  });
});

describe("moveAnswers", () => {
  const four: Move = { key: "4", by: 1, passed: "5", words };

  it("hears the move once its own change answered with none on its way", () => {
    const answers = moveAnswers();
    answers.moving(four, 1);
    expect(answers.answered(1, true, true)).toEqual({ ...four, saved: true });
    answers.moving(four, 2);
    expect(answers.answered(2, false, true)).toEqual({ ...four, saved: false });
  });

  it("hears a move that saved as moved, though a later change sent before its answer was refused", () => {
    // Table 4 moved (change 1), table 7 renamed before the move answered
    // (change 2): the move saved, the rename was refused, and the server's
    // list has the move.
    const answers = moveAnswers();
    answers.moving(four, 1);
    expect(answers.answered(1, true, false)).toBeNull();
    expect(answers.answered(2, false, true)).toEqual({ ...four, saved: true });
  });

  it("waits for the move's own answer when the later change's refusal comes first", () => {
    // Next settles the move's promise once its result's row is read, and
    // sent the rename as soon as the answer's first row was: the rename's
    // refusal (offline) answered first, with the move still on its way.
    // Heard then, the move was said back where it was (CI's fourth run).
    const answers = moveAnswers();
    answers.moving(four, 1);
    expect(answers.answered(2, false, false)).toBeNull();
    expect(answers.answered(1, true, true)).toEqual({ ...four, saved: true });
  });

  it("hears it moved when a later change, which has the move, saved after its own was refused", () => {
    const answers = moveAnswers();
    answers.moving(four, 1);
    expect(answers.answered(1, false, false)).toBeNull();
    expect(answers.answered(2, true, false)).toBeNull();
    expect(answers.answered(3, false, true)?.saved).toBe(true);
  });

  it("hears it back only when no save that has the move went through", () => {
    const answers = moveAnswers();
    answers.moving(four, 1);
    expect(answers.answered(1, false, false)).toBeNull();
    expect(answers.answered(2, false, true)?.saved).toBe(false);
  });

  it("takes no change from before the move as its save, and waits for it too", () => {
    // Change 1 a rename, still on its way as table 4 moved (change 2).
    const answers = moveAnswers();
    answers.moving(four, 2);
    expect(answers.answered(2, false, false)).toBeNull();
    expect(answers.answered(1, true, true)?.saved).toBe(false);
  });

  it("hears the latest move only, once", () => {
    const other: Move = {
      key: "5",
      by: -1,
      passed: "4",
      words: { moved: () => "5 now", back: () => "5 back" },
    };
    const answers = moveAnswers();
    answers.moving(four, 1);
    answers.moving(other, 2);
    // The first move's save counts for nothing of the second's.
    expect(answers.answered(1, true, false)).toBeNull();
    expect(answers.answered(2, false, true)).toEqual({
      ...other,
      saved: false,
    });
    // A change after it, with no move: nothing more is heard.
    expect(answers.answered(3, true, true)).toBeNull();
  });

  it("hears nothing once forgotten (the screen went)", () => {
    const answers = moveAnswers();
    answers.moving(four, 1);
    answers.forget();
    expect(answers.answered(1, true, true)).toBeNull();
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
