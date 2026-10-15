"use client";

import { OTP_LENGTH } from "@domain/otp";
import { displayIsraeliMobile } from "@domain/phone";
import { Button } from "@ui/button";
import { PhoneField } from "@ui/phone-field";
import { ltrInputClass, TextField } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { type SignInState, signIn } from "../actions";

const initial: SignInState = { step: "phone" };

export function SignInForm() {
  const t = useTranslations("auth.signIn");
  const [state, action, pending] = useActionState(signIn, initial);
  const error = state.error ? t(`errors.${state.error}`) : undefined;

  if (state.step === "phone") {
    return (
      <form action={action} className="flex flex-col gap-5" noValidate>
        <p className="text-ink-2">{t("phoneIntro")}</p>
        <PhoneField
          name="phone"
          label={t("phoneLabel")}
          error={error}
          required
          autoFocus
        />
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
        {t.rich(state.resent ? "codeResent" : "codeIntro", {
          phone: displayIsraeliMobile(state.phone),
          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
        })}
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
      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          type="submit"
          name="intent"
          value="resend"
          variant="secondary"
          disabled={pending}
          formNoValidate
          className="md:flex-1"
        >
          {t("resend")}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="change"
          variant="ghost"
          disabled={pending}
          formNoValidate
          className="md:flex-1"
        >
          {t("changePhone")}
        </Button>
      </div>
    </form>
  );
}
