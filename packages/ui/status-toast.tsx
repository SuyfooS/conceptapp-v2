"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";
import { focusFirst, onScreen } from "./focus-after";
import { useUndoWait } from "./use-undo-wait";

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
   * toast goes once it is pressed. Its focus reads the toast's words after
   * it ("ביטול, המשמרת בוטלה"). `fullLabel` is its whole name for a screen
   * reader, starting with `label` so speech input still finds it ("ביטול:
   * המשמרת חוזרת"); by default `label`.
   */
  action?: { label: string; fullLabel?: string; onClick: () => void } | null;
  /**
   * The keyboard's focus goes to the action as the toast shows: what the
   * action undoes went with the focus (a removed message's actions, a sheet
   * that closed), and the way back is the next thing to reach.
   */
  focusAction?: boolean;
  /**
   * The toast leaves while it holds the keyboard's focus (its action pressed,
   * or its time up): where the screen puts the focus next, as the button goes
   * with the toast. Without it, the focus goes back where it was before the
   * toast took it, if that is still there, else to the page's title.
   */
  onFocusLeave?: () => void;
  /**
   * Hears when the toast stops counting for the person (its way back being
   * reached, by the rule of `@ui/undo-wait`) and when it goes on: what the
   * way back undoes can wait as long (`useHeldWrite`'s `pause`), so it never
   * goes while the way back is still offered.
   */
  onWaitingChange?: (waiting: boolean) => void;
  /**
   * Hears when the toast has gone from sight: its time up, or nothing left
   * to say. Not for one replaced by a newer message. What waited for it
   * (news that must never take a way back's place) may say its own then.
   */
  onHidden?: () => void;
};

/**
 * A short confirmation that floats at the top in glass and leaves by itself.
 * For what needs no answer: anything the person must act on stays on the
 * screen. The live region is always there, with its own `aria-live`, so
 * screen readers announce it, while a sheet is open or closing too. With an
 * `action`, it carries the way back (an undo) beside its words; it waits
 * while that is being reached (`@ui/undo-wait`: the keyboard on it, a mouse
 * over it, a finger on it, or a focus a tap or a screen reader put there),
 * and goes on counting once they leave, so the way back can be reached in
 * time. A null message hides it at once, waiting or not: its button with it.
 */
export function StatusToast({
  message,
  stamp,
  duration = 4000,
  action,
  focusAction = false,
  onFocusLeave,
  onWaitingChange,
  onHidden,
}: StatusToastProps) {
  const hidden = useRef(onHidden);
  hidden.current = onHidden;
  const [text, setText] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [offer, setOffer] = useState<StatusToastProps["action"]>(null);
  const [waiting, setWaiting] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const wordsId = useId();
  const { handlers, wait } = useUndoWait(root, setWaiting);
  /** How long it still stays: its whole time when it shows, less once it waited. */
  const left = useRef(0);
  /** The focus is in the toast. */
  const holds = useRef(false);
  /** Its action was pressed with the focus on it, which goes with the button. */
  const leaving = useRef(false);
  /** Where the focus was before the toast took it, to go back to. */
  const before = useRef<Element | null>(null);
  /**
   * What it last started to say, and what last took the focus: a screen
   * left in a hidden <Activity> and shown again runs its effects again with
   * the same message, which goes on where it was (the time it had left, or
   * gone if it went) and never takes the focus again.
   */
  const said = useRef<string | null>(null);
  const focused = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: stamp is what shows the same message again
  useEffect(() => {
    const saying = JSON.stringify([message, stamp ?? null, duration]);
    if (said.current === saying) return;
    said.current = saying;
    if (message) {
      setText(message);
      setShown(true);
      setOffer(action ?? null);
    } else {
      // Nothing to say, so nothing to wait for: it goes now (below).
      wait.taken();
    }
    left.current = message ? duration : 0;
  }, [message, stamp, duration]);

  // It leaves when its time is up, unless its way back is being reached:
  // then it waits, and counts what is left once that ends. A null message
  // waits for nothing: what its way back would undo may be gone already.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new message starts its time again
  useEffect(() => {
    if (waiting && message) return;
    const started = Date.now();
    const stay = left.current;
    const hide = setTimeout(() => {
      setShown(false);
      hidden.current?.();
    }, stay);
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

  // Whoever holds what the way back undoes hears whether the toast counts,
  // and again with each new message, which may come while it is stopped.
  const stopped = waiting && Boolean(message);
  // biome-ignore lint/correctness/useExhaustiveDependencies: says where it stands as it changes, not for each new callback
  useEffect(() => {
    onWaitingChange?.(stopped);
  }, [stopped, message, stamp]);

  // The way back may be bound again while it shows (the same undo, newer).
  useEffect(() => {
    if (message && action) setOffer(action);
  }, [message, action]);

  // Its action takes the focus as it shows, when the screen asks; where
  // the focus was is kept, for when the toast goes.
  const offered = Boolean(offer);
  // biome-ignore lint/correctness/useExhaustiveDependencies: each toast asks once, as its button shows
  useEffect(() => {
    if (!focusAction || !message || !action || !offered) return;
    const asking = JSON.stringify([message, stamp ?? null]);
    if (focused.current === asking) return;
    focused.current = asking;
    const was = document.activeElement;
    before.current = onScreen(was) && !root.current?.contains(was) ? was : null;
    button.current?.focus({ preventScroll: true });
  }, [focusAction, message, stamp, offered]);

  // The focus went with the toast's button: the screen says where it goes,
  // or it goes back where it was (else the page's title), unless something
  // took it meanwhile.
  useEffect(() => {
    if (!holds.current && !leaving.current) return;
    if (root.current?.contains(document.activeElement)) return;
    holds.current = false;
    leaving.current = false;
    wait.focusOut();
    if (onFocusLeave) onFocusLeave();
    else focusFirst([before.current], { preventScroll: true });
    before.current = null;
  });

  const actionable = shown && offer;
  return (
    <div
      ref={root}
      role="status"
      // Its own, not only its role's: Radix leaves a live region out of
      // what it hides behind an open sheet.
      aria-live="polite"
      {...handlers}
      onFocus={(event) => {
        holds.current = true;
        handlers.onFocus(event);
      }}
      onBlur={(event) => {
        // Moved on by the person: nothing more to do.
        if (!root.current?.contains(event.relatedTarget as Node | null)) {
          holds.current = false;
        }
        handlers.onBlur(event);
      }}
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
      {text ? (
        <span id={wordsId} className="min-w-0">
          {text}
        </span>
      ) : null}
      {text && offer ? (
        <button
          ref={button}
          type="button"
          aria-label={offer.fullLabel}
          aria-describedby={wordsId}
          // Gone with the toast: it can't be pressed once it is leaving.
          tabIndex={actionable ? undefined : -1}
          onClick={() => {
            // Leaving, it does nothing: the keyboard may still be on it.
            if (!actionable) return;
            leaving.current =
              root.current?.contains(document.activeElement) ?? false;
            offer.onClick();
            setShown(false);
            setOffer(null);
            wait.taken();
          }}
          className="pressable min-h-11 shrink-0 rounded-full px-4 font-semibold text-ink hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {offer.label}
        </button>
      ) : null}
    </div>
  );
}
