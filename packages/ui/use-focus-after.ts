"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";
import {
  type FocusCandidate,
  focusWhenGone,
  inClosingSheet,
  watchFocusIn,
} from "./focus-after";

/**
 * When `ref`'s element goes (it unmounts, or its screen is hidden) while it
 * held the focus, the focus goes to the first of `candidates()` that can
 * take it, else the page's title, without moving the page (`focusWhenGone`):
 * after the drawing that removed it, so what took its place is in the page
 * (a microtask after the commit), and only if nothing took the focus
 * meanwhile (a screen's own refocus wins). React runs a removal's layout
 * cleanup while the element is still there. One that goes with a sheet that
 * closes (Escape with the focus on it) leaves the focus to the sheet, which
 * gives it back to what opened it a moment later (`returnFocus`): its
 * candidates went with it, and the page's title would take that place.
 */
export function useFocusWhenGone(
  ref: RefObject<HTMLElement | null>,
  candidates?: () => readonly FocusCandidate[],
): void {
  // The latest candidates, for a removal after the screen drew again.
  const latest = useRef(candidates);
  useLayoutEffect(() => {
    latest.current = candidates;
  });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const watch = watchFocusIn(element);
    return () => {
      const had = watch.had();
      watch.stop();
      if (!had || inClosingSheet(element)) return;
      const after = latest.current;
      queueMicrotask(() => {
        focusWhenGone(after?.() ?? []);
      });
    };
  }, [ref]);
}
