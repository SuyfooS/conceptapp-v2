"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { SwapIntent, SwapState } from "./actions";

const initialState: SwapState = {};

/**
 * One swap step as a button: give a shift away, withdraw the request or
 * take a colleague's. `action` is `swapAction`, or the design demo's
 * stand-in. A refusal is explained under the button; `onDone` runs once the
 * step went through.
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
  onDone?: () => void;
}) {
  const t = useTranslations("app.shifts.swap");
  // `onDone` runs here and not in an effect: the screen's refresh can remove
  // this button in the same update that ends the pending state.
  const [state, formAction, pending] = useActionState(
    async (prev: SwapState, form: FormData) => {
      const next = await action(prev, form);
      if (!next.failure) onDone?.();
      return next;
    },
    initialState,
  );
  const text = t(`buttons.${intent}`);

  return (
    <form
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
