"use client";

import {
  type DocLike,
  firstOnScreen,
  inViewWhenFocused,
} from "@ui/focus-after";
import { type RefObject, useState } from "react";
import { sheetReturnTo } from "./editor-focus";

/**
 * The keyboard's way back from an editor's sheet (accessibility, part 8):
 * pass `returnFocus` to the Sheet, call `opening` as it opens and
 * `removing` as it closes for a removal, and give the removal's UndoRow
 * `buttonRef={undoButton}` and `quiet` (its focus says it) and the
 * section's PageSection `headingRef={heading}`. A removal closes the sheet
 * and takes its row, which opened it, in the same moment: the focus goes to
 * "ביטול" once the sheet has gone, so the removal is said then, not while
 * the sheet hid the page; anything else back to what opened it, as a Sheet
 * does by itself; the section's title when that is gone. A removal refused
 * while its sheet still closes (`kept`) closes it onto the row it put back
 * instead. No React here (`useSheetReturn` keeps one for a screen), so the
 * tests stand in for the page.
 */
export function sheetReturn(doc?: Pick<DocLike, "activeElement">) {
  const page = () =>
    doc ?? (globalThis.document as Pick<DocLike, "activeElement"> | undefined);
  let opener: Element | null = null;
  // The removals so far, and the one whose sheet hasn't given the focus
  // back yet.
  let removals = 0;
  let closing: number | null = null;
  // The row a refused removal put back, and what follows once the sheet
  // has given it the focus.
  let keptRow: { row: () => Element | null; landed: () => void } | null = null;
  const undoButton: RefObject<HTMLButtonElement | null> = { current: null };
  const heading: RefObject<HTMLHeadingElement | null> = { current: null };

  /** A row kept for a close that won't come now: what follows, at once. */
  const forget = () => {
    const kept = keptRow;
    keptRow = null;
    kept?.landed();
  };

  return {
    undoButton,
    heading,
    /** As the sheet opens: what has the focus now gets it back. */
    opening() {
      opener = page()?.activeElement ?? null;
      closing = null;
      forget();
    },
    /** It closes for a removal: onto the removal's "ביטול". Which one it is. */
    removing(): number {
      removals += 1;
      closing = removals;
      forget();
      return removals;
    },
    /**
     * The removal (`removal`, from `removing`) was refused. While its sheet
     * still closes, it closes onto the row that came back (`row`, read once
     * it has gone: the row that opened it went, and came back as another),
     * never onto a "ביטול", which is another removal's, if any, and
     * `landed` follows once it has given the focus (the refusal said then):
     * true. Once that sheet has given the focus back, nothing here, so
     * another sheet opened since closes onto its own row: false, and the
     * "ביטול" that goes gives its focus to that row itself.
     */
    kept(removal: number, row: () => Element | null, landed: () => void) {
      if (closing !== removal) return false;
      closing = null;
      keptRow = { row, landed };
      return true;
    },
    /** The Sheet's `returnFocus`. */
    returnFocus() {
      const removal = closing !== null;
      closing = null;
      const back = keptRow;
      keptRow = null;
      const kept = back?.row() ?? null;
      const chosen = firstOnScreen(
        sheetReturnTo({
          removed: removal,
          undo: undoButton.current,
          opener,
          heading: heading.current,
          kept,
        }),
      );
      // The Sheet focuses what this returns at once: what follows the row
      // put back comes after that.
      if (back) queueMicrotask(back.landed);
      // "ביטול" comes under the whole list, maybe far below the row that
      // went, where the page still is, and the row put back may be far
      // from it: brought into view as the Sheet focuses it (without moving
      // the page), when any of it is out of view.
      return (removal && chosen === undoButton.current) ||
        (kept !== null && chosen === kept)
        ? inViewWhenFocused(chosen)
        : chosen;
    },
  };
}

export type SheetReturn = ReturnType<typeof sheetReturn>;

/** One `sheetReturn` for the screen, the same on every drawing. */
export function useSheetReturn(): SheetReturn {
  const [back] = useState(() => sheetReturn());
  return back;
}
