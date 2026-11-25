import { describe, expect, it, vi } from "vitest";
import {
  afterScreenEdit,
  builderToast,
  type HeldNotice,
  namedUndo,
  SCREEN_UNDO_MS,
  type ScreenNotice,
  screenMade,
  screenUndone,
} from "./builder-toast";

// The builder's one way back for what changes only the screen (a copy from
// last week, a fill from availability), and what its one toast says, in the order it always has: a
// held publish, then the change on the screen, then the last write.

const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 8, minute));
const stamp = (minute: number) => at(minute).toISOString();

/** One update the builder queues on its notice: an updater, or a value. */
type Queued =
  | ScreenNotice
  | null
  | ((notice: ScreenNotice | null) => ScreenNotice | null);

/**
 * The builder's notice after one press, as React applies what the press
 * queued on it, in order: an updater gets what came before it, a value takes
 * its place.
 */
function applied(
  notice: ScreenNotice | null,
  queue: readonly Queued[],
): ScreenNotice | null {
  return queue.reduce<ScreenNotice | null>(
    (prev, next) => (typeof next === "function" ? next(prev) : next),
    notice,
  );
}

describe("SCREEN_UNDO_MS", () => {
  it("keeps the copy's ten seconds", () => {
    expect(SCREEN_UNDO_MS).toBe(10_000);
  });
});

describe("screenMade", () => {
  it("offers the way back, with what was made, how much and when", () => {
    const undo = vi.fn();
    expect(screenMade("copy", 3, undo, at(0))).toEqual({
      kind: "made",
      what: "copy",
      count: 3,
      stamp: stamp(0),
      undo,
    });
    // Offered, not taken.
    expect(undo).not.toHaveBeenCalled();
  });
});

describe("afterScreenEdit", () => {
  it("takes the way back away once the screen changes after it", () => {
    expect(afterScreenEdit(screenMade("copy", 3, vi.fn(), at(0)))).toBeNull();
  });

  it("leaves the words that it was undone, and nothing as nothing", () => {
    const undone: ScreenNotice = {
      kind: "undone",
      what: "copy",
      stamp: stamp(1),
    };
    expect(afterScreenEdit(undone)).toBe(undone);
    expect(afterScreenEdit(null)).toBeNull();
  });

  it("never calls the way back it takes away", () => {
    const undo = vi.fn();
    afterScreenEdit(screenMade("copy", 3, undo, at(0)));
    expect(undo).not.toHaveBeenCalled();
  });
});

describe("screenUndone", () => {
  it("puts the screen back once, and says it was undone from then", () => {
    const undo = vi.fn();
    const made = screenMade("copy", 3, undo, at(0));
    expect(screenUndone(made, false, at(1))).toEqual({
      kind: "undone",
      what: "copy",
      stamp: stamp(1),
    });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  // What is on its way (a save, or a publish held for its own undo) stands
  // as sent: the builder starts again from it.
  it("does nothing while a write is on its way or held", () => {
    const undo = vi.fn();
    const made = screenMade("copy", 3, undo, at(0));
    expect(screenUndone(made, true, at(1))).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it("does nothing once undone, or with no way back offered", () => {
    expect(
      screenUndone(
        { kind: "undone", what: "copy", stamp: stamp(1) },
        false,
        at(2),
      ),
    ).toBeNull();
    expect(screenUndone(null, false, at(2))).toBeNull();
  });
});

describe("builderToast", () => {
  const waiting: HeldNotice = { kind: "waiting", stamp: stamp(5) };
  const letGo: HeldNotice = { kind: "undone", stamp: stamp(6) };
  const made = screenMade("copy", 11, vi.fn(), at(3));
  const undone: ScreenNotice = {
    kind: "undone",
    what: "copy",
    stamp: stamp(4),
  };
  const saved = { at: stamp(2), published: false };
  const nothing = {
    holding: false,
    held: null,
    screen: null,
    saved: null,
    done: true,
  };

  it("says nothing with nothing to say", () => {
    expect(builderToast(nothing)).toBeNull();
  });

  it("says a held publish waits, with its way back, before anything else", () => {
    expect(
      builderToast({
        holding: true,
        held: waiting,
        screen: made,
        saved,
        done: false,
      }),
    ).toEqual({
      words: { of: "held", kind: "waiting" },
      stamp: stamp(5),
      undo: "publish",
    });
  });

  it("says a held publish waits only while it is held", () => {
    expect(builderToast({ ...nothing, held: waiting, screen: made })).toEqual({
      words: { of: "screen", what: "copy", kind: "made", count: 11 },
      stamp: stamp(3),
      undo: "screen",
    });
    expect(builderToast({ ...nothing, held: waiting })).toBeNull();
  });

  it("says a held publish was let go, with no way back, before the screen and the write", () => {
    expect(
      builderToast({ ...nothing, held: letGo, screen: made, saved }),
    ).toEqual({
      words: { of: "held", kind: "undone" },
      stamp: stamp(6),
      undo: null,
    });
  });

  it("offers the way back of a change made on the screen, before the last write", () => {
    expect(builderToast({ ...nothing, screen: made, saved })).toEqual({
      words: { of: "screen", what: "copy", kind: "made", count: 11 },
      stamp: stamp(3),
      undo: "screen",
    });
  });

  it("says a change made on the screen was undone, with no way back", () => {
    expect(builderToast({ ...nothing, screen: undone, saved })).toEqual({
      words: { of: "screen", what: "copy", kind: "undone" },
      stamp: stamp(4),
      undo: null,
    });
  });

  it("says what the last write did once done: saved, or published", () => {
    expect(builderToast({ ...nothing, saved })).toEqual({
      words: { of: "write", published: false },
      stamp: stamp(2),
      undo: null,
      write: true,
    });
    expect(
      builderToast({ ...nothing, saved: { at: stamp(2), published: true } }),
    ).toEqual({
      words: { of: "write", published: true },
      stamp: stamp(2),
      undo: null,
      write: true,
    });
  });

  it("says nothing of the last write while there is work on the screen or on its way", () => {
    expect(builderToast({ ...nothing, saved, done: false })).toBeNull();
  });
});

// The PR's demo, as the builder calls these: copy, "ביטול", copy again, then
// a change on the screen drops the way back, which then puts back nothing.
describe("one way back, as the builder uses it", () => {
  it("is taken back once, comes again with the next copy, and goes with the next change", () => {
    const first = vi.fn();
    const second = vi.fn();
    const toast = (screen: ScreenNotice | null) =>
      builderToast({
        holding: false,
        held: null,
        screen,
        saved: null,
        done: false,
      });

    // Copied: "ביטול" is offered.
    let notice: ScreenNotice | null = screenMade("copy", 3, first, at(0));
    expect(toast(notice)?.undo).toBe("screen");

    // "ביטול": the screen as before, said, and offered no more.
    notice = screenUndone(notice, false, at(1)) ?? notice;
    expect(first).toHaveBeenCalledTimes(1);
    expect(toast(notice)).toEqual({
      words: { of: "screen", what: "copy", kind: "undone" },
      stamp: stamp(1),
      undo: null,
    });
    expect(screenUndone(notice, false, at(2))).toBeNull();
    expect(first).toHaveBeenCalledTimes(1);

    // Copied again: `applyCopy` queues `edited`'s updater, then the new way
    // back, which comes in place of the words that the first was undone.
    notice = applied(notice, [
      afterScreenEdit,
      screenMade("copy", 3, second, at(3)),
    ]);
    expect(toast(notice)).toEqual({
      words: { of: "screen", what: "copy", kind: "made", count: 3 },
      stamp: stamp(3),
      undo: "screen",
    });

    // A person added on a shift: the way back goes, and the toast with it.
    notice = afterScreenEdit(notice);
    expect(notice).toBeNull();
    expect(toast(notice)).toBeNull();
    expect(screenUndone(notice, false, at(4))).toBeNull();
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
  });
});

// `applyCopy` calls `edited` (which queues `afterScreenEdit`) before
// `onMade` (which queues the new notice), and React applies them in that
// order. These pin what that order gives, and that the other order would
// drop the new way back on every copy; the e2e (design.spec.ts, "ביטול"
// focused after a fresh copy) catches a swap in the builder itself.
describe("a copy after a change on the screen: edited, then made", () => {
  const offered = (undo: () => void) => screenMade("copy", 3, undo, at(0));
  const undone: ScreenNotice = {
    kind: "undone",
    what: "copy",
    stamp: stamp(1),
  };

  it("puts back only the latest change: a second copy's way back takes the first's place", () => {
    const first = vi.fn();
    const second = vi.fn();
    const notice = applied(offered(first), [
      afterScreenEdit,
      screenMade("copy", 5, second, at(2)),
    ]);
    expect(notice).toMatchObject({ kind: "made", count: 5, stamp: stamp(2) });
    expect(screenUndone(notice, false, at(3))).toEqual({
      kind: "undone",
      what: "copy",
      stamp: stamp(3),
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("offers the way back again after one was undone", () => {
    const second = vi.fn();
    const notice = applied(undone, [
      afterScreenEdit,
      screenMade("copy", 5, second, at(2)),
    ]);
    expect(notice).toMatchObject({ kind: "made", count: 5, stamp: stamp(2) });
  });

  it("would drop the new way back, and its toast, in the other order", () => {
    for (const before of [offered(vi.fn()), undone, null]) {
      const second = vi.fn();
      const notice = applied(before, [
        screenMade("copy", 5, second, at(2)),
        afterScreenEdit,
      ]);
      expect(notice).toBeNull();
      expect(screenUndone(notice, false, at(3))).toBeNull();
      expect(second).not.toHaveBeenCalled();
    }
  });
});

// The fill from availability takes the same way back as the copy: one at a
// time, whichever came last, the next change on the screen taking it.
describe("a fill, with the copy's way back", () => {
  const toast = (screen: ScreenNotice | null) =>
    builderToast({
      holding: false,
      held: null,
      screen,
      saved: null,
      done: false,
    });

  it("offers its way back with the places it filled, and says it was undone", () => {
    const undo = vi.fn();
    let notice: ScreenNotice | null = screenMade("fill", 5, undo, at(0));
    expect(toast(notice)).toEqual({
      words: { of: "screen", what: "fill", kind: "made", count: 5 },
      stamp: stamp(0),
      undo: "screen",
    });
    notice = screenUndone(notice, false, at(1));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toast(notice)).toEqual({
      words: { of: "screen", what: "fill", kind: "undone" },
      stamp: stamp(1),
      undo: null,
    });
  });

  // `applyFill` queues `edited`'s updater, then its own way back, as
  // `applyCopy` does: a fill after a copy puts back only the fill, and a
  // copy after a fill only the copy.
  it("takes the copy's place after a copy, and a copy takes its place after it", () => {
    const copied = vi.fn();
    const filled = vi.fn();
    let notice = applied(screenMade("copy", 3, copied, at(0)), [
      afterScreenEdit,
      screenMade("fill", 2, filled, at(1)),
    ]);
    expect(notice).toMatchObject({ kind: "made", what: "fill", count: 2 });
    notice = applied(notice, [
      afterScreenEdit,
      screenMade("copy", 4, copied, at(2)),
    ]);
    expect(notice).toMatchObject({ kind: "made", what: "copy", count: 4 });
    expect(screenUndone(notice, false, at(3))).toMatchObject({
      kind: "undone",
      what: "copy",
    });
    expect(copied).toHaveBeenCalledTimes(1);
    expect(filled).not.toHaveBeenCalled();
  });

  it("goes with the next change on the screen, and never while a write goes", () => {
    const undo = vi.fn();
    const made = screenMade("fill", 1, undo, at(0));
    expect(screenUndone(made, true, at(1))).toBeNull();
    expect(afterScreenEdit(made)).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });
});

// Only the fill's "ביטול" has a whole name of its own, and only while it is
// offered: its toast's words say how many places were filled, not that
// "ביטול" takes those people off again.
describe("namedUndo", () => {
  it("names the fill's way back, and nothing else", () => {
    expect(
      namedUndo({ of: "screen", what: "fill", kind: "made", count: 3 }),
    ).toBe("fill");
    expect(
      namedUndo({ of: "screen", what: "copy", kind: "made", count: 3 }),
    ).toBeNull();
    expect(
      namedUndo({ of: "screen", what: "fill", kind: "undone" }),
    ).toBeNull();
    expect(namedUndo({ of: "held", kind: "waiting" })).toBeNull();
    expect(namedUndo({ of: "write", published: false })).toBeNull();
  });
});
