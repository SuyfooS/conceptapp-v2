"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { DecideState } from "./actions";

const initialState: DecideState = {};

/**
 * Approve or decline one taken request, as a button. `action` is
 * `decideSwapAction`, or the design demo's stand-in. A refusal is
 * explained under the button.
 */
export function DecideButton({
  action,
  decision,
  id,
  subject,
}: {
  action: (state: DecideState, form: FormData) => Promise<DecideState>;
  decision: "approve" | "decline";
  id: string;
  /** The request, for screen readers: "approve, Noa to Yoav, Sunday…". */
  subject: string;
}) {
  const t = useTranslations("app.swaps");
  const [state, formAction, pending] = useActionState(action, initialState);
  const text = t(`buttons.${decision}`);
  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={decision === "approve" ? "secondary" : "ghost"}
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
