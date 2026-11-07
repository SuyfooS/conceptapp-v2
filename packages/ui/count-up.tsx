"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DURATION_MS = 500;

/** The last value of each counter, so a number that remounts still moves. */
const lastValues = new Map<string, number>();

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * A number that runs to its new value when it changes, such as a month's total.
 * It doesn't run on a first load, when nothing changed. `id` names the counter
 * so moving to another month, which mounts it anew, still counts.
 *
 * After Count Up from React Bits (see packages/ui/README.md), without its library.
 */
export function useCountUp(value: number, id: string): number {
  const [shown, setShown] = useState(value);
  const frame = useRef<number | null>(null);

  // Before paint, so a remounted counter doesn't flash its new value first.
  useLayoutEffect(() => {
    const from = lastValues.get(id);
    lastValues.set(id, value);
    if (from === undefined || from === value) {
      setShown(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    setShown(from);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      setShown(Math.round(from + (value - from) * easeOut(t)));
      frame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, id]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return shown;
}
