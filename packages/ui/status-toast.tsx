"use client";

import { useEffect, useState } from "react";
import { cn } from "./cn";

/** How long the toast takes to leave; keep its words until it has. */
const LEAVING_MS = 500;

export type StatusToastProps = {
  /** What just happened, in a short sentence. Null shows nothing. */
  message: string | null;
  /** Changes each time the same message happens again, to show it again. */
  stamp?: string;
  /** How long it stays, in milliseconds. */
  duration?: number;
};

/**
 * A short confirmation that floats at the top in glass and leaves by itself.
 * For what needs no answer: anything the person must act on stays on the
 * screen. The live region is always there, so screen readers announce it.
 */
export function StatusToast({
  message,
  stamp,
  duration = 4000,
}: StatusToastProps) {
  const [text, setText] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: stamp is what shows the same message again
  useEffect(() => {
    if (message) {
      setText(message);
      setShown(true);
    }
    const stay = message ? duration : 0;
    const hide = setTimeout(() => setShown(false), stay);
    const clear = setTimeout(() => setText(null), stay + LEAVING_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, [message, stamp, duration]);

  return (
    <div
      role="status"
      className={cn(
        "glass pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+14px)] z-40 mx-auto flex min-h-11 w-fit max-w-[calc(100%-2rem)] items-center rounded-[22px] px-[18px] py-2.5 font-medium text-base",
        "transition-[opacity,translate,scale] duration-500 ease-spring",
        shown
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-5 scale-90 opacity-0",
      )}
    >
      {text}
    </div>
  );
}
