"use client";

import { OTP_LENGTH } from "@domain/otp";
import { displayIsraeliMobile } from "@domain/phone";
import { Button } from "@ui/button";
import { FieldGroup, GroupedField, GroupedPhoneField } from "@ui/field-group";
import { ltrInputClass } from "@ui/text-field";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { SignInState } from "../actions";
import { authFieldsClass } from "../auth-screen";

const initial: SignInState = { step: "phone" };

export function SignInForm({
  signIn,
}: {
  /** `signIn`, or the design demo's stand-in. */
  signIn: (prev: SignInState, form: FormData) => Promise<SignInState>;
}) {
  const t = useTranslations("auth.signIn");
  const [state, action, pending] = useActionState(signIn, initial);
  const error = state.error ? t(`errors.${state.error}`) : undefined;

  if (state.step === "phone") {
    return (
      <form action={action} className="flex flex-col gap-5" noValidate>
        <p className="px-1 text-ink-2">{t("phoneIntro")}</p>
        <FieldGroup className={authFieldsClass}>
          <GroupedPhoneField
            name="phone"
            label={t("phoneLabel")}
            error={error}
            className="font-medium text-xl"
            required
            autoFocus
          />
        </FieldGroup>
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
      <p className="px-1 text-ink-2" aria-live="polite">
        {t.rich(state.resent ? "codeResent" : "codeIntro", {
          phone: displayIsraeliMobile(state.phone),
          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
        })}
      </p>
      <FieldGroup className={authFieldsClass}>
        <GroupedField
          name="code"
          label={t("codeLabel")}
          error={error}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={"0".repeat(OTP_LENGTH)}
          maxLength={OTP_LENGTH + 2}
          dir="ltr"
          className={`${ltrInputClass} font-medium text-xl tracking-[0.3em]`}
          required
          autoFocus
        />
      </FieldGroup>
      <Button
        type="submit"
        name="intent"
        value="verify"
        size="lg"
        loading={pending}
      >
        {t("verify")}
      </Button>
      <div className="flex justify-center gap-1">
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
        <Button
          type="submit"
          name="intent"
          value="change"
          variant="ghost"
          disabled={pending}
          formNoValidate
        >
          {t("changePhone")}
        </Button>
      </div>
    </form>
  );
}
