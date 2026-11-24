"use client";

import { Button } from "@ui/button";
import type { FocusCandidate } from "@ui/focus-after";
import { useFocusWhenGone } from "@ui/use-focus-after";
import { useTranslations } from "next-intl";
import { useActionState, useLayoutEffect, useRef } from "react";
import type { SwapIntent, SwapState } from "./actions";

const initialState: SwapState = {};

/**
 * One swap step as a button: give a shift away, withdraw the request or
 * take a colleague's. `action` is `swapAction`, or the design demo's
 * stand-in. A refusal is explained under the button; `onDone` runs once the
 * step went through, with the step, so the screen can say what came of it.
 * On a card (`focusAfter`), the screen read again draws what came of it in
 * the button's place: the focus, gone with the button, goes there, and
 * `onDone` runs once it has, so what the screen says comes after the
 * focus's own read and is not cut off by it. A card gone before its answer
 * came (another day picked meanwhile) has nothing left to draw: `onDone`
 * runs as the answer comes, so the board still says it. In a sheet,
 * `onWaiting` says when it is sent and when its answer is back, so the
 * sheet's close can wait for that.
 */
export function SwapButton({
  action,
  intent,
  id,
  subject,
  variant = "secondary",
  size,
  block = false,
  onDone,
  focusAfter,
  onWaiting,
}: {
  action: (state: SwapState, form: FormData) => Promise<SwapState>;
  intent: SwapIntent;
  id: string;
  /** The shift, for screen readers: "give away the shift, Sunday morning". */
  subject: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  /** Full width, for the main action of a sheet. */
  block?: boolean;
  onDone?: (intent: SwapIntent) => void;
  /**
   * Where the focus goes when the button goes while it holds it (the shift's
   * card, `shiftTarget`), the page's title after them. Not for one in a
   * sheet: the sheet's close gives the focus back.
   */
  focusAfter?: () => readonly FocusCandidate[];
  /** True as it is sent, false once its answer is back, a refusal too. */
  onWaiting?: (waiting: boolean) => void;
}) {
  const t = useTranslations("app.shifts.swap");
  // Watched only on a card: in a sheet, the button goes as the sheet closes.
  const form = useRef<HTMLFormElement>(null);
  useFocusWhenGone(form, focusAfter);
  // On a card, the step that went through, for `onDone` once its answer is
  // drawn (below), and the latest `onDone`, for a button gone by then.
  const settled = useRef<SwapIntent | null>(null);
  const latestDone = useRef(onDone);
  // On screen, from its first drawing until it goes (below).
  const mounted = useRef(false);
  useLayoutEffect(() => {
    latestDone.current = onDone;
  });
  // In a sheet, `onDone` runs here and not in an effect: the screen's refresh
  // can remove this button in the same update that ends the pending state.
  const [state, formAction, pending] = useActionState(
    async (prev: SwapState, data: FormData) => {
      onWaiting?.(true);
      let next: SwapState;
      try {
        next = await action(prev, data);
      } finally {
        onWaiting?.(false);
      }
      if (!next.failure) {
        if (!focusAfter) onDone?.(intent);
        else if (mounted.current) settled.current = intent;
        // Gone while it waited: no drawing of its answer is left to wait for.
        else queueMicrotask(() => latestDone.current?.(intent));
      }
      return next;
    },
    initialState,
  );
  // The answer drawn with the button still there: the focus stays on it.
  useLayoutEffect(() => {
    if (pending) return;
    const step = settled.current;
    settled.current = null;
    if (step) latestDone.current?.(step);
  }, [pending]);
  // Drawn without it: `useFocusWhenGone`'s cleanup ran first and queued the
  // focus's move, so this microtask comes after the focus is on the card.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const step = settled.current;
      settled.current = null;
      if (step) queueMicrotask(() => latestDone.current?.(step));
    };
  }, []);
  const text = t(`buttons.${intent}`);

  return (
    <form
      ref={focusAfter ? form : undefined}
      action={formAction}
      className={
        block ? "flex flex-col gap-2" : "flex flex-col items-start gap-1"
      }
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={variant}
        size={size}
        loading={pending}
        aria-label={`${text}, ${subject}`}
        className={block ? "w-full" : undefined}
      >
        {text}
      </Button>
      {state.failure ? (
        <p role="alert" className="text-danger text-sm">
          {t(`failures.${state.failure}`)}
        </p>
      ) : null}
    </form>
  );
}
