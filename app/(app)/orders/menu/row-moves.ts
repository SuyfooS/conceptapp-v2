"use client";

import { announce } from "@ui/announcer";
import { focusFirst } from "@ui/focus-after";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** A row moved up (-1) or down (1). */
export type MoveBy = -1 | 1;

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
 * other one at an end, and where the row went is said, politely, after
 * what the focus reads. The row's arrow keeps it through what the save
 * draws after (its answer, a newer press's, a refused save putting the row
 * back), wherever the focus was lost, until the person puts the focus or a
 * press anywhere else. Nothing moves a focus the person put elsewhere.
 */
export function useRowMoves<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): {
  /** The ref of a row's arrow. */
  arrowRef: (key: string, by: MoveBy) => ArrowRef;
  /** A row's arrow pressed: `said` is said once the move is drawn. */
  moving: (key: string, by: MoveBy, said: string) => void;
} {
  const locale = useLocale();
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  // The row last moved and the arrow pressed in it, while it keeps the focus.
  const last = useRef<{ key: string; by: MoveBy } | null>(null);
  // Where it went, in words, until the move is drawn.
  const words = useRef<string | null>(null);

  // After each drawing of a new order: the moved row's arrow takes back a
  // focus that was lost, then where it went is said.
  useLayoutEffect(() => {
    const want = last.current;
    if (!want) return;
    const index = rows.findIndex((row) => keyOf(row) === want.key);
    if (index >= 0) {
      const by = arrowAfter(index, rows.length, want.by);
      focusFirst([arrows.current.get(arrowKey(want.key, by))], {
        title: false,
      });
    }
    const said = words.current;
    words.current = null;
    if (said) announce(said, { lang: locale });
  }, [rows, keyOf, locale]);

  // The focus or a press anywhere but the moved row's arrows: the person
  // moved on, and the row keeps nothing.
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

  const moving = useCallback((key: string, by: MoveBy, said: string) => {
    last.current = { key, by };
    words.current = said;
  }, []);

  return { arrowRef, moving };
}
