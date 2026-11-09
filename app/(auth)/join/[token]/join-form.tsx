"use client";

import { Button } from "@ui/button";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState } from "react";
import { CodeField } from "../../code-field";
import type { JoinState } from "../actions";

const initial: JoinState = { step: "invite" };

/** Send a code to the invited number, then join with it. */
export function JoinForm({
  join,
  ending,
}: {
  /** `join` for this link's token, or the design demo's stand-in. */
  join: (prev: JoinState, form: FormData) => Promise<JoinState>;
  ending: string;
}) {
  const t = useTranslations("auth.join");
  const errors = useTranslations("auth.signIn.errors");
  const [state, action, pending] = useActionState(join, initial);
  const error =
    state.error === "shiftsLeft"
      ? t("shiftsLeft")
      : state.error
        ? errors(state.error)
        : undefined;
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

  if (state.step === "invite") {
    // Each step is its own form (key), so the code step's button is a new
    // element rather than the send button fading back from its busy state.
    return (
      <form
        key="invite"
        action={action}
        className="flex flex-col gap-4"
        noValidate
      >
        <p className="text-ink-2">{t.rich("sendIntro", { ending, ltr })}</p>
        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          name="intent"
          value="send"
          size="lg"
          loading={pending}
        >
          {t("send")}
        </Button>
      </form>
    );
  }

  return (
    <form key="code" action={action} className="flex flex-col gap-4" noValidate>
      <p className="text-ink-2" aria-live="polite">
        {t.rich(state.resent ? "codeResent" : "codeIntro", { ending, ltr })}
      </p>
      <CodeField
        label={t("codeLabel")}
        error={error}
        wrongCode={state.error === "wrongCode"}
        pending={pending}
      />
      <Button
        type="submit"
        name="intent"
        value="verify"
        size="lg"
        loading={pending}
      >
        {t("verify")}
      </Button>
      <Button
        type="submit"
        name="intent"
        value="resend"
        variant="ghost"
        disabled={pending}
        formNoValidate
      >
        {t("resend")}
      </Button>
    </form>
  );
}
