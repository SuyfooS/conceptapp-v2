"use client";

import { OTP_LENGTH } from "@domain/otp";
import { Button } from "@ui/button";
import { ltrInputClass, TextField } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState } from "react";
import { type JoinState, join } from "../actions";

const initial: JoinState = { step: "invite" };

/** Send a code to the invited number, then join with it. */
export function JoinForm({ token, ending }: { token: string; ending: string }) {
  const t = useTranslations("auth.join");
  const errors = useTranslations("auth.signIn.errors");
  const [state, action, pending] = useActionState(
    join.bind(null, token),
    initial,
  );
  const error = state.error ? errors(state.error) : undefined;
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

  if (state.step === "invite") {
    return (
      <form action={action} className="flex flex-col gap-5" noValidate>
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
    <form action={action} className="flex flex-col gap-5" noValidate>
      <p className="text-ink-2" aria-live="polite">
        {t.rich(state.resent ? "codeResent" : "codeIntro", { ending, ltr })}
      </p>
      <TextField
        name="code"
        label={t("codeLabel")}
        error={error}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH + 2}
        dir="ltr"
        className={ltrInputClass}
        required
        autoFocus
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
        variant="secondary"
        disabled={pending}
        formNoValidate
      >
        {t("resend")}
      </Button>
    </form>
  );
}
