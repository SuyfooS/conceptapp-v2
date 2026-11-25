"use client";

import { onLeavingBusiness } from "@ui/leaving-business";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type HeldTimer, heldTimer } from "./held-timer";

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
 *
 * Its wait can stop while the way back is being reached (`pause`, as a
 * StatusToast with the undo waits for the keyboard or a mouse) and go on
 * with what it had left (`resume`), each given what it waits for when an
 * earlier way back can still be up as the next comes; a hidden page,
 * leaving the screen and a switch of business send it at once all the
 * same. `replace` holds a newer form of the same write in the time it has
 * left.
 */
export function useHeldWrite<T extends NonNullable<unknown>>(
  write: (value: T) => Promise<unknown>,
  ms: number = HOLD_MS,
) {
  const pending = useRef<{ value: T; wait: HeldTimer } | null>(null);
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
    now.wait.clear();
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
    pending.current = { value, wait: heldTimer(ms, () => void commit()) };
    setHeld(value);
  }

  /**
   * The held write, or, given `value`, only while that is what is held: a
   * way back that goes as the next one comes lets go of nothing newer.
   */
  function heldNow(value: T | undefined) {
    const now = pending.current;
    return value === undefined || now?.value === value ? now : null;
  }

  /** Stops the held write's wait, keeping the time it has left. */
  function pause(value?: T) {
    heldNow(value)?.wait.pause();
  }

  /** Goes on with the held write's wait, for the time it had left. */
  function resume(value?: T) {
    heldNow(value)?.wait.resume();
  }

  /** Holds `value` in place of what is held, in the time it has left. */
  function replace(value: T) {
    const now = pending.current;
    if (!now) return;
    now.value = value;
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

  return { held, hold, release, commit, pause, resume, replace };
}
