"use client";

import { announce } from "@ui/announcer";
import { focusFirst } from "@ui/focus-after";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** A row moved up (-1) or down (1). */
export type MoveBy = -1 | 1;

/**
 * A row's arrow: grey, and kept clear of the tab bar that floats over the
 * page's bottom on phones and tablets (`AppShell`) when a move brings it
 * into view, as the bar and its fade are tall; a computer has no bar.
 */
export const arrowClass =
  "text-ink-2 scroll-mb-[calc(env(safe-area-inset-bottom)+6rem)] xl:scroll-mb-0";

/**
 * Where a moved row is, in words, by its place in the list (`place` of
 * `count`): moved there (`moved`), or back there after a save that was
 * refused (`back`).
 */
export type MoveWords = {
  moved: (place: number, count: number) => string;
  back: (place: number, count: number) => string;
};

/**
 * Which of a moved row's arrows has the focus once the move is drawn, by
 * where the row is now (`index` of `count`): the one pressed, or the other
 * one once the row reached that end, where the pressed one can't be
 * pressed again.
 */
export function arrowAfter(index: number, count: number, by: MoveBy): MoveBy {
  const atEnd = by === -1 ? index <= 0 : index >= count - 1;
  return atEnd ? (by === -1 ? 1 : -1) : by;
}

/** A move whose save answered: the row's key, its words, and whether it saved. */
export type MoveHeard = { key: string; words: MoveWords; saved: boolean };

/**
 * What is said once the list's save answered for a move, by where the row
 * is in the list as drawn then: there now, or back there after a refusal;
 * nothing once the row is gone (removed, or given its id meanwhile).
 */
export function moveSaid<T>(
  heard: MoveHeard,
  rows: readonly T[],
  keyOf: (row: T) => string,
): string | null {
  const index = rows.findIndex((row) => keyOf(row) === heard.key);
  if (index < 0) return null;
  const where = heard.saved ? heard.words.moved : heard.words.back;
  return where(index + 1, rows.length);
}

/** Where a row's arrow is kept: the row's key, and which way it moves. */
const arrowKey = (key: string, by: MoveBy) => `${key}:${by}`;

/** A row arrow's ref, which forgets the arrow as it goes. */
type ArrowRef = (node: HTMLButtonElement | null) => (() => void) | undefined;

/**
 * A list whose rows move with up and down arrows rather than a drag (the
 * menu's categories and places), as the list's items do
 * (`app/(app)/lists/templates/items-editor.tsx`). A row moved down is put
 * back in the page after the row it passed, so the arrow pressed in it
 * loses the focus; one that reached an end has its arrow turned off. Once
 * the move is drawn the focus is on the same arrow of the same row, or the
 * other one at an end, brought into view clear of the tab bar
 * (`arrowClass`). The row's arrow keeps it through what the save draws
 * after (its answer, a newer press's, a refused save putting the row
 * back), wherever the focus was lost, until the person puts the focus or a
 * press anywhere else, or the screen goes or is hidden. Nothing moves a
 * focus the person put elsewhere. Where the row went is said only once the
 * list's latest save answers (`answered`), politely, after what the focus
 * reads: where it is then, or, refused, where it is back, after the
 * screen's line saying why. Only the latest move is said, so presses that
 * come faster than the saves say where the row ended.
 */
export function useRowMoves<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): {
  /** The ref of a row's arrow. */
  arrowRef: (key: string, by: MoveBy) => ArrowRef;
  /** A row's arrow pressed: its arrow keeps the focus, and `words` wait for the save. */
  moving: (key: string, by: MoveBy, words: MoveWords) => void;
  /**
   * The list's latest save answered (`saved`, or refused), before what its
   * answer draws: the latest move's words are said once that is drawn.
   */
  answered: (saved: boolean) => void;
} {
  const locale = useLocale();
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  // The row last moved and the arrow pressed in it, while it keeps the focus.
  const last = useRef<{ key: string; by: MoveBy } | null>(null);
  // The latest move's words, until a save answers.
  const words = useRef<{ key: string; words: MoveWords } | null>(null);
  // Answered, saved or not: said once the answer is drawn.
  const heard = useRef<MoveHeard | null>(null);

  // After each drawing of a new order: the moved row's arrow takes back a
  // focus that was lost, then, once a save answered, where it is is said.
  useLayoutEffect(() => {
    const want = last.current;
    if (want) {
      const index = rows.findIndex((row) => keyOf(row) === want.key);
      if (index >= 0) {
        const by = arrowAfter(index, rows.length, want.by);
        // In view, the focus doesn't move the page: under the tab bar, the
        // arrow comes up from it (its scroll margin).
        focusFirst([arrows.current.get(arrowKey(want.key, by))], {
          title: false,
        })?.scrollIntoView({ block: "nearest" });
      }
    }
    const answer = heard.current;
    heard.current = null;
    const said = answer ? moveSaid(answer, rows, keyOf) : null;
    if (said) announce(said, { lang: locale });
  }, [rows, keyOf, locale]);

  // The focus or a press anywhere but the moved row's arrows: the person
  // moved on, and the row keeps nothing. Nor once the screen goes or Next
  // hides it (kept for Back, its listener gone meanwhile): shown again, it
  // runs the effect above again, and nobody pressed anything on it then.
  useEffect(() => {
    const away = (event: Event) => {
      const want = last.current;
      if (!want) return;
      const target = event.target as Node | null;
      const own = ([-1, 1] as const).some((by) =>
        arrows.current.get(arrowKey(want.key, by))?.contains(target),
      );
      if (!own) last.current = null;
    };
    document.addEventListener("focusin", away, true);
    document.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("focusin", away, true);
      document.removeEventListener("pointerdown", away, true);
      last.current = null;
      words.current = null;
      heard.current = null;
    };
  }, []);

  const arrowRef = useCallback(
    (key: string, by: MoveBy): ArrowRef =>
      (node) => {
        if (!node) return;
        const at = arrowKey(key, by);
        arrows.current.set(at, node);
        return () => {
          if (arrows.current.get(at) === node) arrows.current.delete(at);
        };
      },
    [],
  );

  const moving = useCallback((key: string, by: MoveBy, said: MoveWords) => {
    last.current = { key, by };
    words.current = { key, words: said };
    heard.current = null;
  }, []);

  const answered = useCallback((saved: boolean) => {
    const move = words.current;
    words.current = null;
    if (move) heard.current = { ...move, saved };
  }, []);

  return { arrowRef, moving, answered };
}
