"use client";

import { useLayoutEffect, useState, useTransition } from "react";

/** React's `startTransition`, as `useTransition` gives it, for an async write. */
export type StartTransition = (action: () => Promise<void>) => void;

/**
 * A write sent from a sheet. Its argument, called as the answer comes, keeps
 * the sheet until that answer has been said (`said`): for one that shows
 * only later than it comes.
 */
export type SheetWrite = (keep: () => void) => Promise<void>;

/**
 * A sheet's writes, each in `startTransition`, and whether one still holds
 * the sheet: from the press until its answer is back, and no longer,
 * whatever the transition waits for after it; or, for an answer the write
 * kept (`keep`), until the sheet has said it (`said`). Kept as it comes,
 * before the write lets go, the hold passes from the one to the other with
 * no moment between. A new write lets go of what an earlier answer kept:
 * it holds the sheet itself, and that answer is no longer the one to say.
 */
export function sheetWrites(startTransition: StartTransition) {
  let waiting = 0;
  let kept = false;
  const keep = () => {
    kept = true;
  };
  return {
    start(write: SheetWrite) {
      startTransition(async () => {
        waiting += 1;
        kept = false;
        try {
          await write(keep);
        } finally {
          waiting -= 1;
        }
      });
    },
    held: () => waiting > 0 || kept,
    /** The answer kept for is said: the sheet may close. */
    said() {
      kept = false;
    },
  };
}

/**
 * A write sent from a sheet, whose answer belongs on that sheet (23 November
 * 2026). A server action that calls `refresh()` answers first and sends the
 * page read again after it, still streaming, and React's transition stays
 * pending until that page is drawn, after a refusal already shows.
 *
 * `pending` follows the transition: the spinner and the disabled buttons
 * stay until the page is back, so no second write goes out against what it
 * showed before. `held()` lasts only until the write's answer: the sheet's
 * close waits for that and no longer, so ✕, Escape, the scrim or a swipe
 * right after a refusal close it at once. Read `held()` in the sheet's
 * `onOpenChange`, never while drawing.
 *
 * An answer the sheet says only later (a refusal said once the page read
 * again is drawn, 25 November 2026, or one drawn from the state set as it
 * comes, which React draws only on its next turn) is kept as it comes
 * (`keep`, the write's argument), and the sheet holds until it has drawn it
 * and calls `said` (`useSaid`). Kept any later, by the state React draws on
 * its next turn, a close coming in between (a tap, Escape) would find
 * nothing holding the sheet.
 */
export function useSheetWrite() {
  const [pending, startTransition] = useTransition();
  // Once, as React keeps `startTransition` the same on every draw.
  const [writes] = useState(() => sheetWrites(startTransition));
  return {
    pending,
    start: writes.start,
    held: writes.held,
    said: writes.said,
  };
}

/**
 * For a sheet that says a kept answer as it draws it (the person's hours
 * sheets, 25 November 2026): `said` in a layout effect of each drawing that
 * shows it (`shown`), so as the drawing that puts it up is committed, before
 * anything else can come in. Each one, not only that first: an answer kept
 * again in the same words draws nothing new, and the sheet's next drawing
 * lets go of it instead.
 */
export function useSaid(shown: boolean, said: () => void) {
  useLayoutEffect(() => {
    if (shown) said();
  });
}
