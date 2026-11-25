/**
 * What the builder's one toast says, and the way back it offers. A publish
 * of changes held for its undo says so for as long as it waits, then that it
 * was let go unsent; then a change made only on the screen (a copy from last
 * week, a fill from availability), with "ביטול" for `SCREEN_UNDO_MS`, or that
 * it was undone; otherwise what the last write did, once nothing is unsaved,
 * on its way or held.
 * Only one change made on the screen is ever offered back: the next change
 * on the screen takes its way back (`afterScreenEdit`), a new one comes in
 * its place, and a write sent takes it too. Without React, so the tests
 * stand in for the screen: the builder puts the words into its messages.
 * All of it is pure but `screenUndone`, which calls the change's `undo`.
 */

/**
 * What changes only the screen, with one way back: a copy from last week, or
 * a fill from availability. Nothing of it is saved or sent until the dock's
 * buttons are pressed.
 */
export type ScreenChange = "copy" | "fill";

/** How long "ביטול" of a change made only on the screen stays in the toast. */
export const SCREEN_UNDO_MS = 10_000;

/**
 * What the toast says of a change made only on the screen: made, how much
 * (the shifts a copy put there, the places a fill filled), with what puts the
 * screen back as it was before it; or undone.
 */
export type ScreenNotice =
  | {
      kind: "made";
      what: ScreenChange;
      count: number;
      stamp: string;
      undo: () => void;
    }
  | { kind: "undone"; what: ScreenChange; stamp: string };

/** What the toast says of a publish held for its undo: waiting, or let go. */
export type HeldNotice = { kind: "waiting" | "undone"; stamp: string };

/** A change went on the screen at `at`: the toast offers its way back. */
export function screenMade(
  what: ScreenChange,
  count: number,
  undo: () => void,
  at: Date,
): ScreenNotice {
  return { kind: "made", what, count, stamp: at.toISOString(), undo };
}

/**
 * The screen changed after a change made only on it (a shift added,
 * changed, removed or brought back, or the next copy or fill): "ביטול"
 * would put the screen back as it was before that change and take this one
 * with it, so the way back goes, and the toast with it. What was made stays,
 * as any other work on the screen. That it was undone is no way back, and
 * stays.
 */
export function afterScreenEdit(
  notice: ScreenNotice | null,
): ScreenNotice | null {
  return notice?.kind === "made" ? null : notice;
}

/**
 * "ביטול" of a change made only on the screen: the screen as it was before
 * it, and what the toast says then, from `at`. Not pure: it calls the
 * change's `undo` (in the builder, the screen's own state is set back), so
 * it runs once per press, from the press, never in a render or a state
 * updater, which React may run twice. Nothing while a write is on its way
 * or held (`busy`): what is on its way stands as sent, and the builder
 * starts again from it. Null: nothing was undone, and the toast stays as it
 * is.
 */
export function screenUndone(
  notice: ScreenNotice | null,
  busy: boolean,
  at: Date,
): ScreenNotice | null {
  if (busy || notice?.kind !== "made") return null;
  notice.undo();
  return { kind: "undone", what: notice.what, stamp: at.toISOString() };
}

/** What the toast's words are about, for the builder to put into words. */
export type ToastWords =
  | { of: "held"; kind: "waiting" | "undone" }
  | { of: "screen"; what: ScreenChange; kind: "made"; count: number }
  | { of: "screen"; what: ScreenChange; kind: "undone" }
  | { of: "write"; published: boolean };

/** What the toast shows. */
export type BuilderToast = {
  words: ToastWords;
  /** Changes each time the same words happen again, to show them again. */
  stamp: string;
  /** The way back it offers: the held publish's, the screen's, or none. */
  undo: "publish" | "screen" | null;
  /** It says what the last write did: a draft saved, a week published. */
  write?: true;
};

/**
 * What the toast shows now, first that holds: a publish held, waiting for
 * its undo; a held publish let go unsent; a change made only on the screen,
 * or undone; what the last write did, once `done`; else nothing.
 */
export function builderToast(now: {
  /** A publish pressed waits for its undo: nothing has reached the server. */
  holding: boolean;
  held: HeldNotice | null;
  screen: ScreenNotice | null;
  /** What the last write answered: when it saved, and if it published. */
  saved: { at: string; published: boolean } | null;
  /** Nothing on the screen unsaved, nothing on its way or held. */
  done: boolean;
}): BuilderToast | null {
  const { holding, held, screen, saved, done } = now;
  if (holding && held?.kind === "waiting") {
    return {
      words: { of: "held", kind: "waiting" },
      stamp: held.stamp,
      undo: "publish",
    };
  }
  if (held?.kind === "undone") {
    return {
      words: { of: "held", kind: "undone" },
      stamp: held.stamp,
      undo: null,
    };
  }
  if (screen?.kind === "made") {
    return {
      words: {
        of: "screen",
        what: screen.what,
        kind: "made",
        count: screen.count,
      },
      stamp: screen.stamp,
      undo: "screen",
    };
  }
  if (screen?.kind === "undone") {
    return {
      words: { of: "screen", what: screen.what, kind: "undone" },
      stamp: screen.stamp,
      undo: null,
    };
  }
  if (saved && done) {
    return {
      words: { of: "write", published: saved.published },
      stamp: saved.at,
      undo: null,
      write: true,
    };
  }
  return null;
}

/**
 * The change whose "ביטול" has a whole name of its own for a screen reader
 * (`app.build.<what>.undoFull`, starting with the word itself, so speech
 * input still finds it): the fill's, since its toast says how many places
 * were filled, not that "ביטול" takes those people off the shifts again.
 * Null for any other toast: the copy's "ביטול" is its word alone, and one
 * with no way back has nothing to name.
 */
export function namedUndo(words: ToastWords): "fill" | null {
  return words.of === "screen" && words.kind === "made" && words.what === "fill"
    ? "fill"
    : null;
}
