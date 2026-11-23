"use client";

import { displayIsraeliMobile } from "@domain/phone";
import { CAPTCHA_FIELD, type CaptchaSetup } from "@domain/turnstile";
import { Button } from "@ui/button";
import { CaptchaBox, useCaptcha } from "@ui/captcha";
import { FieldGroup, GroupedPhoneField } from "@ui/field-group";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import type { SignInState } from "../actions";
import { authFieldsClass } from "../auth-screen";
import { CodeField } from "../code-field";

const initial: SignInState = { step: "phone" };

/** The presses that send a code, and so wait for the "אני לא רובוט" check. */
const SENDS = ["send", "resend"] as const;

/**
 * Sign-in's two steps. The code step reads the same for every valid number,
 * whether a code went to it or not, so its words are true either way, and
 * its help says what to do when none came. Both steps send a code, each
 * with the "אני לא רובוט" check right above its press (one check for the
 * screen, `useCaptcha`): a press made before the check is done waits and
 * goes by itself, and a new code always takes a new token.
 */
export function SignInForm({
  signIn,
  captcha,
  demoHref,
  start = initial,
}: {
  /** `signIn`, or the design demo's stand-in. */
  signIn: (prev: SignInState, form: FormData) => Promise<SignInState>;
  /** The check: this deployment's widget, or the twin's stand-in. */
  captcha: CaptchaSetup;
  /** The demo door, while it is open: the way back to it from the phone step. */
  demoHref?: string;
  /** The design demo's first step; the real page starts on the phone. */
  start?: SignInState;
}) {
  const t = useTranslations("auth.signIn");
  const [state, action, pending] = useActionState(signIn, start);
  const box = useCaptcha(captcha, "sign-in");
  const noCode = useId();
  const error = state.error ? t(`errors.${state.error}`) : undefined;

  if (state.step === "phone") {
    return (
      <form
        action={action}
        onSubmit={(event) => box.holdSubmit(event, SENDS)}
        className="flex flex-col gap-5"
        noValidate
      >
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
        <CaptchaBox captcha={box} name={CAPTCHA_FIELD} />
        <Button
          type="submit"
          name="intent"
          value="send"
          size="lg"
          loading={pending || box.waiting}
        >
          {t("send")}
        </Button>
        {demoHref ? (
          <Button asChild variant="ghost" className="self-center">
            <Link href={demoHref}>{t("demo")}</Link>
          </Button>
        ) : null}
      </form>
    );
  }

  return (
    <form
      action={action}
      onSubmit={(event) => box.holdSubmit(event, SENDS)}
      className="flex flex-col gap-5"
      noValidate
    >
      <p className="px-1 text-ink-2" aria-live="polite">
        {t.rich(state.resent ? "codeResent" : "codeIntro", {
          phone: displayIsraeliMobile(state.phone),
          ltr: (chunks) => <span dir="ltr">{chunks}</span>,
        })}
      </p>
      <CodeField
        label={t("codeLabel")}
        error={error}
        wrongCode={state.error === "wrongCode"}
        pending={pending}
        to={state.to}
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
      <CaptchaBox captcha={box} name={CAPTCHA_FIELD} />
      <div className="flex justify-center gap-1">
        <Button
          type="submit"
          name="intent"
          value="resend"
          variant="ghost"
          loading={box.waiting}
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
      <section aria-labelledby={noCode} className="flex flex-col gap-1 pt-2">
        <h2 id={noCode} className="px-1 font-semibold text-base">
          {t("noCode.title")}
        </h2>
        <p className="px-1 text-base text-ink-2">{t("noCode.body")}</p>
      </section>
    </form>
  );
}
