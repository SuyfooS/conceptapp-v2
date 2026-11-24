"use client";

import { Button } from "@ui/button";
import type { FocusCandidate } from "@ui/focus-after";
import { useFocusWhenGone } from "@ui/use-focus-after";
import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import type { SwapIntent, SwapState } from "./actions";

const initialState: SwapState = {};

/**
 * One swap step as a button: give a shift away, withdraw the request or
 * take a colleague's. `action` is `swapAction`, or the design demo's
 * stand-in. A refusal is explained under the button; `onDone` runs once the
 * step went through, with the step, so the screen can say what came of it.
 * On a card (`focusAfter`), the screen read again draws what came of it in
 * the button's place: the focus, gone with the button, goes there. In a
 * sheet, `onWaiting` says when it is sent and when its answer is back, so
 * the sheet's close can wait for that.
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
  // `onDone` runs here and not in an effect: the screen's refresh can remove
  // this button in the same update that ends the pending state.
  const [state, formAction, pending] = useActionState(
    async (prev: SwapState, data: FormData) => {
      onWaiting?.(true);
      let next: SwapState;
      try {
        next = await action(prev, data);
      } finally {
        onWaiting?.(false);
      }
      if (!next.failure) onDone?.(intent);
      return next;
    },
    initialState,
  );
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
