"use client";

import { useState, useTransition } from "react";

/** React's `startTransition`, as `useTransition` gives it, for an async write. */
export type StartTransition = (action: () => Promise<void>) => void;

/**
 * A sheet's writes, each in `startTransition`, and whether one is still on
 * its way: from the press until its answer is back, and no longer, whatever
 * the transition waits for after it.
 */
export function sheetWrites(startTransition: StartTransition) {
  let waiting = 0;
  return {
    start(write: () => Promise<void>) {
      startTransition(async () => {
        waiting += 1;
        try {
          await write();
        } finally {
          waiting -= 1;
        }
      });
    },
    held: () => waiting > 0,
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
 */
export function useSheetWrite() {
  const [pending, startTransition] = useTransition();
  // Once, as React keeps `startTransition` the same on every draw.
  const [writes] = useState(() => sheetWrites(startTransition));
  return { pending, start: writes.start, held: writes.held };
}
