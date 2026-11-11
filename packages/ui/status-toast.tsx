"use client";

import { type FocusEvent, useEffect, useRef, useState } from "react";
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
  /**
   * The way back from what just happened ("ביטול"), for as long as the toast
   * stays: a destructive action offers this instead of asking first. The
   * toast goes once it is pressed.
   */
  action?: { label: string; onClick: () => void } | null;
  /**
   * The keyboard's focus goes to the action as the toast shows: what the
   * action undoes went with the focus (a removed message's actions, a sheet
   * that closed), and the way back is the next thing to reach.
   */
  focusAction?: boolean;
  /**
   * The toast leaves while it holds the keyboard's focus (its action pressed,
   * or its time up): where the screen puts the focus next, as the button goes
   * with the toast.
   */
  onFocusLeave?: () => void;
};

/** Whether an element shows its focus: the keyboard, not a tap, put it there. */
function showsFocus(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * A short confirmation that floats at the top in glass and leaves by itself.
 * For what needs no answer: anything the person must act on stays on the
 * screen. The live region is always there, so screen readers announce it.
 * With an `action`, it carries the way back (an undo) beside its words; it
 * waits while the keyboard is on that button or a mouse over the toast, and
 * goes on counting once they leave, so the way back can be reached in time.
 */
export function StatusToast({
  message,
  stamp,
  duration = 4000,
  action,
  focusAction = false,
  onFocusLeave,
}: StatusToastProps) {
  const [text, setText] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [offer, setOffer] = useState<StatusToastProps["action"]>(null);
  const [focusWaits, setFocusWaits] = useState(false);
  const [pointerWaits, setPointerWaits] = useState(false);
  const waiting = focusWaits || pointerWaits;
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  /** How long it still stays: its whole time when it shows, less once it waited. */
  const left = useRef(0);
  /** The focus is in the toast. */
  const holds = useRef(false);
  /** Its action was pressed with the focus on it, which goes with the button. */
  const leaving = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: stamp is what shows the same message again
  useEffect(() => {
    if (message) {
      setText(message);
      setShown(true);
      setOffer(action ?? null);
    }
    left.current = message ? duration : 0;
  }, [message, stamp, duration]);

  // It leaves when its time is up, unless the keyboard or the pointer is on
  // it: then it waits, and counts what is left once they go.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new message starts its time again
  useEffect(() => {
    if (waiting) return;
    const started = Date.now();
    const stay = left.current;
    const hide = setTimeout(() => setShown(false), stay);
    const clear = setTimeout(() => {
      setText(null);
      setOffer(null);
    }, stay + LEAVING_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
      left.current = Math.max(0, stay - (Date.now() - started));
    };
  }, [waiting, message, stamp, duration]);

  // The way back may be bound again while it shows (the same undo, newer).
  useEffect(() => {
    if (message && action) setOffer(action);
  }, [message, action]);

  // Its action takes the focus as it shows, when the screen asks.
  const offered = Boolean(offer);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each toast asks once, as its button shows
  useEffect(() => {
    if (!focusAction || !message || !action || !offered) return;
    button.current?.focus({ preventScroll: true });
  }, [focusAction, message, stamp, offered]);

  // The focus went with the toast's button: the screen says where it goes.
  useEffect(() => {
    if (!holds.current && !leaving.current) return;
    if (root.current?.contains(document.activeElement)) return;
    holds.current = false;
    leaving.current = false;
    setFocusWaits(false);
    onFocusLeave?.();
  });

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    holds.current = true;
    setFocusWaits(showsFocus(event.target));
  }
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (root.current?.contains(event.relatedTarget as Node | null)) return;
    // Moved on by the person: nothing more to do.
    holds.current = false;
    setFocusWaits(false);
  }

  const actionable = shown && offer;
  return (
    <div
      ref={root}
      role="status"
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setPointerWaits(true);
      }}
      onPointerLeave={() => setPointerWaits(false)}
      className={cn(
        "glass fixed inset-x-0 top-[calc(env(safe-area-inset-top)+14px)] z-40 mx-auto flex min-h-11 w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-[22px] font-medium text-base",
        offer ? "py-1 ps-[18px] pe-1" : "px-[18px] py-2.5",
        actionable ? "pointer-events-auto" : "pointer-events-none",
        "transition-[opacity,translate,scale] duration-500 ease-spring",
        shown
          ? "translate-y-0 scale-100 opacity-100"
          : "-translate-y-5 scale-90 opacity-0",
      )}
    >
      {text ? <span className="min-w-0">{text}</span> : null}
      {text && offer ? (
        <button
          ref={button}
          type="button"
          // Gone with the toast: it can't be pressed once it is leaving.
          tabIndex={actionable ? undefined : -1}
          onClick={() => {
            leaving.current =
              root.current?.contains(document.activeElement) ?? false;
            offer.onClick();
            setShown(false);
            setOffer(null);
            setPointerWaits(false);
          }}
          className="pressable min-h-11 shrink-0 rounded-full px-4 font-semibold text-ink hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {offer.label}
        </button>
      ) : null}
    </div>
  );
}
