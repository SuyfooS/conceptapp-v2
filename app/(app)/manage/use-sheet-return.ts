"use client";

import { firstOnScreen, inViewWhenFocused } from "@ui/focus-after";
import { useRef } from "react";
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
 * does by itself; the section's title when that is gone.
 */
export function useSheetReturn() {
  const opener = useRef<Element | null>(null);
  const removed = useRef(false);
  const undoButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  return {
    undoButton,
    heading,
    /** As the sheet opens: what has the focus now gets it back. */
    opening() {
      opener.current = document.activeElement;
      removed.current = false;
    },
    /** It closes for a removal: onto the removal's "ביטול". */
    removing() {
      removed.current = true;
    },
    /** The Sheet's `returnFocus`. */
    returnFocus() {
      const removal = removed.current;
      removed.current = false;
      const chosen = firstOnScreen(
        sheetReturnTo({
          removed: removal,
          undo: undoButton.current,
          opener: opener.current,
          heading: heading.current,
        }),
      );
      // "ביטול" comes under the whole list, maybe far below the row that
      // went, where the page still is: brought into view as the Sheet
      // focuses it (without moving the page), when any of it is out of view.
      return removal && chosen === undoButton.current
        ? inViewWhenFocused(chosen)
        : chosen;
    },
  };
}
