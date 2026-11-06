"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { SwapIntent, SwapState } from "./actions";

const initialState: SwapState = {};

/**
 * One swap step as a button: give a shift away, withdraw the request or
 * take a colleague's. `action` is `swapAction`, or the design demo's
 * stand-in. A refusal is explained under the button.
 */
export function SwapButton({
  action,
  intent,
  id,
  subject,
  variant = "secondary",
}: {
  action: (state: SwapState, form: FormData) => Promise<SwapState>;
  intent: SwapIntent;
  id: string;
  /** The shift, for screen readers: "give away the shift, Sunday morning". */
  subject: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const t = useTranslations("app.shifts.swap");
  const [state, formAction, pending] = useActionState(action, initialState);
  const text = t(`buttons.${intent}`);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={variant}
        loading={pending}
        aria-label={`${text}, ${subject}`}
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
