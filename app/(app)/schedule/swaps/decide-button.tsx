"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { DecideState } from "./actions";

const initialState: DecideState = {};

/**
 * Approve or decline one taken request, as a button. `action` is
 * `decideSwapAction`, or the design demo's stand-in. A refusal is
 * explained under the button; `onDone` runs once the decision went through.
 */
export function DecideButton({
  action,
  decision,
  id,
  subject,
  variant,
  block = false,
  onDone,
}: {
  action: (state: DecideState, form: FormData) => Promise<DecideState>;
  decision: "approve" | "decline";
  id: string;
  /** The request, for screen readers: "approve, Noa to Yoav, Sunday…". */
  subject: string;
  variant: "primary" | "secondary" | "ghost";
  /** Share the width of the row with the other decision. */
  block?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("app.swaps");
  // `onDone` runs here and not in an effect: the screen's refresh can remove
  // this button in the same update that ends the pending state.
  const [state, formAction, pending] = useActionState(
    async (prev: DecideState, form: FormData) => {
      const next = await action(prev, form);
      if (!next.failure) onDone?.();
      return next;
    },
    initialState,
  );
  const text = t(`buttons.${decision}`);

  return (
    <form
      action={formAction}
      className={
        block
          ? "flex min-w-0 flex-1 flex-col gap-1"
          : "flex flex-col items-start gap-1"
      }
    >
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={variant}
        loading={pending}
        aria-label={`${text}, ${subject}`}
        className={block ? "w-full px-3" : undefined}
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
