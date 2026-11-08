"use client";

import { useEffect, useState } from "react";

/** pending: nothing is known yet, also on the server. off: missing or refused. */
export type WakeLockState = "pending" | "on" | "off";

/**
 * Keeps the screen on while `enabled`, for a screen others read from, such as
 * the clock's code. The browser lets the lock go when the page is hidden, so
 * it is asked for again when the page shows. Many devices have no lock or
 * refuse it (an iPhone home-screen app, a headless browser): the state says
 * so, and the screen tells its reader what to do instead.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>("pending");

  useEffect(() => {
    if (!enabled) return;
    if (!("wakeLock" in navigator)) {
      setState("off");
      return;
    }
    let held: WakeLockSentinel | null = null;
    let stopped = false;

    async function hold() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (stopped) {
          void lock.release();
          return;
        }
        void held?.release();
        held = lock;
        setState("on");
      } catch {
        if (!stopped) setState("off");
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void hold();
    }

    void hold();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void held?.release();
    };
  }, [enabled]);

  return enabled ? state : "pending";
}
