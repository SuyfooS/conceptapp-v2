"use client";

import { announce } from "@ui/announcer";
import { focusFirst } from "@ui/focus-after";
import { useLocale } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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

/**
 * A row's move as it was pressed: the row's key, which way it went, the row
 * it passed (by its key; null when the list had none there), and its words.
 */
export type Move = {
  key: string;
  by: MoveBy;
  passed: string | null;
  words: MoveWords;
};

/** A move whose saves all answered, and whether one that has it went through. */
export type MoveHeard = Move & { saved: boolean };

/**
 * The move as a press makes it from the list as drawn: the row the moved
 * one passes is the one next to it that way.
 */
export function moveFrom<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  key: string,
  by: MoveBy,
  words: MoveWords,
): Move {
  const index = rows.findIndex((row) => keyOf(row) === key);
  const next = index < 0 ? undefined : rows[index + by];
  return { key, by, passed: next === undefined ? null : keyOf(next), words };
}

/**
 * What a heard move says on a drawing of the list (`rows`): where the row
 * is, there now when a save that has the move went through, back there when
 * none did, or nothing ever once the row is gone (removed, or given its id
 * meanwhile: `{ words: null }`). A drawing that doesn't show what the saves
 * did yet says nothing (null), and a later one says it: the row is still on
 * the side of the one it passed that the saves say it left (a save went
 * through, the server's list not drawn yet), or on the side they say it
 * didn't reach. So the words are only ever where the row is on screen, and
 * true of it. Once the row it passed is gone, the saves alone tell.
 */
export function moveSaid<T>(
  heard: MoveHeard,
  rows: readonly T[],
  keyOf: (row: T) => string,
): { words: string | null } | null {
  const index = rows.findIndex((row) => keyOf(row) === heard.key);
  if (index < 0) return { words: null };
  const other =
    heard.passed === null
      ? -1
      : rows.findIndex((row) => keyOf(row) === heard.passed);
  const shown =
    other < 0 ? heard.saved : heard.by === 1 ? index > other : index < other;
  if (shown !== heard.saved) return null;
  const where = heard.saved ? heard.words.moved : heard.words.back;
  return { words: where(index + 1, rows.length) };
}

/** The latest move, waiting for its saves: the move, and its change. */
type MoveWaiting = Move & {
  /** The number of the change that carried it. */
  change: number;
  /** A save that has the move went through: its own, or a later change's. */
  saved: boolean;
};

/**
 * The latest move while the list's saves answer, each change by its number
 * as the editor sent it. Every answer is told, those a later change overtook
 * too, as the move's own save may be one of them. The move is heard once no
 * change is on its way any more (`settled`), never by the latest change's
 * answer alone: Next sends the saves one at a time, in turn, but it settles
 * a save's promise only once the result's own row of the answer is read (a
 * promise in the payload, `a`, a row of its own), and it sends the next save
 * as soon as the answer's first row is read. So a later change refused (a
 * rename aborted offline) can answer before the move's own save, which went
 * through (CI's fourth run of orders-menu.spec.ts). Heard as saved when its
 * own change or any later one saved, since each of those was made from a
 * list that has the move; as refused only when none of them did.
 */
export function moveAnswers(): {
  /** A row moved by change `change`: only the latest move waits. */
  moving: (move: Move, change: number) => void;
  /**
   * Change `change` answered, `saved` or refused; the move is heard once
   * that leaves none on its way (`settled`).
   */
  answered: (
    change: number,
    saved: boolean,
    settled: boolean,
  ) => MoveHeard | null;
  /** Nothing waits any more (the screen went). */
  forget: () => void;
} {
  let waiting: MoveWaiting | null = null;
  return {
    moving(move, change) {
      waiting = { ...move, change, saved: false };
    },
    answered(change, saved, settled) {
      const move = waiting;
      if (!move) return null;
      if (saved && change >= move.change) move.saved = true;
      if (!settled) return null;
      waiting = null;
      return {
        key: move.key,
        by: move.by,
        passed: move.passed,
        words: move.words,
        saved: move.saved,
      };
    },
    forget() {
      waiting = null;
    },
  };
}

/** Where a row's arrow is kept: the row's key, and which way it moves. */
const arrowKey = (key: string, by: MoveBy) => `${key}:${by}`;

/** A row arrow's ref, which forgets the arrow as it goes. */
type ArrowRef<N = HTMLButtonElement> = (
  node: N | null,
) => (() => void) | undefined;

/** A list's row arrows on the page, and the ref that keeps each one there. */
export type ArrowRefs<N> = {
  /** The arrows drawn now, by row and way. */
  arrows: Map<string, N>;
  /** The ref of a row's arrow: the same function on every drawing. */
  refOf: (key: string, by: MoveBy) => ArrowRef<N>;
};

/**
 * The refs of a list's row arrows, each made once and then the same on
 * every drawing. A new function on each drawing has React take every
 * arrow's ref off before it changes the page (the ref's cleanup) and put it
 * back only after, and a row moved down is one of those changes: React
 * gives the arrow it moved its focus back itself in between, while no
 * arrow was known, so that focus read as one put elsewhere and the move was
 * forgotten: a row moved down short of the end then kept nothing through
 * what its save drew after (and, before the move was said from the save's
 * answer, was never said: CI's first run of orders-a11y.spec.ts). The same
 * function stays on its arrow, which is known throughout. Its cleanup
 * forgets only its own arrow, never one drawn in its place since.
 */
export function arrowRefs<N>(): ArrowRefs<N> {
  const arrows = new Map<string, N>();
  const made = new Map<string, ArrowRef<N>>();
  return {
    arrows,
    refOf(key, by) {
      const at = arrowKey(key, by);
      const kept = made.get(at);
      if (kept) return kept;
      const ref: ArrowRef<N> = (node) => {
        if (!node) return;
        arrows.set(at, node);
        return () => {
          if (arrows.get(at) === node) arrows.delete(at);
        };
      };
      made.set(at, ref);
      return ref;
    },
  };
}

/**
 * A list whose rows move with up and down arrows rather than a drag (the
 * menu's categories and places), as the list's items do
 * (`app/(app)/lists/templates/items-editor.tsx`). A row moved down is put
 * back in the page after the row it passed, so the arrow pressed in it
 * loses the focus (React gives it back itself as it draws the move, and
 * puts the page back where it was); one that reached an end has its arrow
 * turned off. Once the move is drawn the focus is on the same arrow of the
 * same row, or the other one at an end, brought into view clear of the tab
 * bar (`arrowClass`) whoever gave it the focus. Each arrow's ref is the
 * same on every drawing (`arrowRefs`), so the moved row's arrows are known
 * as React gives the focus back. The row's arrow keeps it through what the
 * save draws after (its answer, a newer press's, a refused save putting the
 * row back), wherever the focus was lost, until the person puts the focus
 * or a press anywhere else, or the screen goes or is hidden. Nothing moves a
 * focus the person put elsewhere. Where the row went is said once none of
 * the list's saves is on its way (`answered`, `moveAnswers`), politely,
 * after what the focus reads, on the drawing of the answer that settled
 * them, or a later one when that one doesn't show what they did yet
 * (`moveSaid`): where it is then, or, when no save that had the move went
 * through, where it is back, after the screen's line saying why. Only the
 * latest move is said, and once, so presses that come faster than the
 * saves say where the row ended. It is the same whichever of the saves
 * answers first, and whenever Next draws the server's list.
 */
export function useRowMoves<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): {
  /** The ref of a row's arrow, the same on every drawing (`arrowRefs`). */
  arrowRef: (key: string, by: MoveBy) => ArrowRef;
  /**
   * A row's arrow pressed, its move carried by change `change` (the number
   * the editor sent it with): its arrow keeps the focus, and `words` wait
   * for the saves.
   */
  moving: (key: string, by: MoveBy, words: MoveWords, change: number) => void;
  /**
   * A save of the list answered: change `change`, `saved` or refused, and
   * whether that leaves none on its way (`settled`), told before what the
   * answer draws, in the same turn. Every answer is told; the latest move
   * is heard once they are settled.
   */
  answered: (change: number, saved: boolean, settled: boolean) => void;
} {
  const locale = useLocale();
  const [{ arrows, refOf }] = useState(() => arrowRefs<HTMLButtonElement>());
  // The row last moved and the arrow pressed in it, while it keeps the focus.
  const last = useRef<{ key: string; by: MoveBy } | null>(null);
  // A press whose move isn't drawn yet.
  const pressed = useRef(false);
  // The rows as last drawn, among which a press moves one.
  const drawn = useRef(rows);
  // The latest move, until its saves are settled.
  const [answers] = useState(moveAnswers);
  // Heard: a state, so it is read with the rows of the very drawing that
  // has the answer (Next may draw its own list before or after it).
  const [heard, setHeard] = useState<MoveHeard | null>(null);
  // The latest heard and the change whose answer settled it, and the last
  // one said or left unsaid for good: each is said at most once, never
  // after the screen went, nor after a later change answered.
  const heardLast = useRef<MoveHeard | null>(null);
  const heardBy = useRef(0);
  const done = useRef<MoveHeard | null>(null);

  // After each drawing of a new order: the moved row's arrow takes back a
  // focus that was lost.
  useLayoutEffect(() => {
    drawn.current = rows;
    const want = last.current;
    const drawingThePress = pressed.current;
    pressed.current = false;
    if (want) {
      const index = rows.findIndex((row) => keyOf(row) === want.key);
      if (index >= 0) {
        const by = arrowAfter(index, rows.length, want.by);
        const arrow = arrows.get(arrowKey(want.key, by));
        const moved = focusFirst([arrow], { title: false });
        // In view, the focus doesn't move the page: under the tab bar, the
        // arrow comes up from it (its scroll margin). So does the arrow
        // React gave the focus back to on the press's own drawing, as it
        // left the page where it was.
        if (moved || (drawingThePress && arrow === document.activeElement)) {
          arrow?.scrollIntoView({ block: "nearest" });
        }
      }
    }
  }, [rows, keyOf, arrows]);

  // Then, once the move is heard, where it is is said: on this drawing when
  // it shows what the saves did, else on the first one after that does.
  useLayoutEffect(() => {
    if (!heard || done.current === heard) return;
    const saying = moveSaid(heard, rows, keyOf);
    if (!saying) return;
    done.current = heard;
    if (saying.words) announce(saying.words, { lang: locale });
  }, [heard, rows, keyOf, locale]);

  // The focus or a press anywhere but the moved row's arrows: the person
  // moved on, and the row keeps nothing. Nor once the screen goes or Next
  // hides it (kept for Back, its listener gone meanwhile): shown again, it
  // runs the effects above again, and nobody pressed anything on it then,
  // so a move heard before is not said then either.
  useEffect(() => {
    const away = (event: Event) => {
      const want = last.current;
      if (!want) return;
      const target = event.target as Node | null;
      const own = ([-1, 1] as const).some((by) =>
        arrows.get(arrowKey(want.key, by))?.contains(target),
      );
      if (!own) last.current = null;
    };
    document.addEventListener("focusin", away, true);
    document.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("focusin", away, true);
      document.removeEventListener("pointerdown", away, true);
      last.current = null;
      pressed.current = false;
      answers.forget();
      done.current = heardLast.current;
    };
  }, [arrows, answers]);

  const moving = useCallback(
    (key: string, by: MoveBy, said: MoveWords, change: number) => {
      last.current = { key, by };
      pressed.current = true;
      answers.moving(moveFrom(drawn.current, keyOf, key, by, said), change);
      heardLast.current = null;
      setHeard(null);
    },
    [answers, keyOf],
  );

  const answered = useCallback(
    (change: number, saved: boolean, settled: boolean) => {
      const move = answers.answered(change, saved, settled);
      if (move) {
        heardLast.current = move;
        heardBy.current = change;
        setHeard(move);
        return;
      }
      // A later change answered while the move heard before still waits
      // for a drawing that shows it: said now, it would come out of turn.
      if (change > heardBy.current) done.current = heardLast.current;
    },
    [answers],
  );

  return { arrowRef: refOf, moving, answered };
}
