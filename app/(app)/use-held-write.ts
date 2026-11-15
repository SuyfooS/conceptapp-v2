"use client";

import { onLeavingBusiness } from "@ui/leaving-business";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** How long a held write waits for "ביטול" before it is sent. */
export const HOLD_MS = 8000;

/**
 * A write held for its undo, the way the access screen holds a removal of
 * pay access (`app/(app)/manage/access/access-view.tsx`): what it changes
 * shows at once, and the write itself waits `ms` for "ביטול". It goes
 * sooner, as it would have, when the page is hidden or closed (a phone may
 * never run the timer again), when the screen is left inside the app (Next
 * keeps it in an <Activity>, and nothing comes back that can't undo), and
 * when the person switches business, which waits for it so it is made in
 * this business. One write is held at a time: holding another sends the
 * earlier one now. `write` handles its own result.
 */
export function useHeldWrite<T extends NonNullable<unknown>>(
  write: (value: T) => Promise<unknown>,
  ms: number = HOLD_MS,
) {
  const pending = useRef<{ value: T; timer: number } | null>(null);
  const [held, setHeld] = useState<T | null>(null);
  // The latest `write`, for a timer set before the screen drew again.
  const latest = useRef(write);
  useLayoutEffect(() => {
    latest.current = write;
  });

  /** Lets go of the held write without sending it, and returns what it held. */
  function release(): T | null {
    const now = pending.current;
    if (!now) return null;
    window.clearTimeout(now.timer);
    pending.current = null;
    setHeld(null);
    return now.value;
  }

  /** Sends the held write now, and returns it (none when nothing is held). */
  function commit(): Promise<unknown> | null {
    const value = release();
    return value === null ? null : latest.current(value);
  }

  function hold(value: T) {
    void commit();
    pending.current = {
      value,
      timer: window.setTimeout(() => void commit(), ms),
    };
    setHeld(value);
  }

  // While something is held, a hidden or closing page sends it now, and so
  // does a switch to another business, which waits for it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens while one is held
  useEffect(() => {
    if (held === null) return;
    const now = () => void commit();
    const hidden = () => {
      if (document.visibilityState === "hidden") now();
    };
    window.addEventListener("pagehide", now);
    document.addEventListener("visibilitychange", hidden);
    const stopLeaving = onLeavingBusiness(commit);
    return () => {
      window.removeEventListener("pagehide", now);
      document.removeEventListener("visibilitychange", hidden);
      stopLeaving();
    };
  }, [held]);

  // Leaving the screen sends what was held. A layout effect, so the way back
  // never flashes an undo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on leaving
  useLayoutEffect(
    () => () => {
      void commit();
    },
    [],
  );

  return { held, hold, release, commit };
}
