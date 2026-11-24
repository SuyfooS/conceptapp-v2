"use client";

import { CAPTCHA_FIELD, type CaptchaSetup } from "@domain/turnstile";
import { Button } from "@ui/button";
import { CaptchaBox, useCaptcha } from "@ui/captcha";
import { arrived } from "@ui/focus-after";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { CodeField } from "../../code-field";
import { codeTakesFocus, useAnswerCount } from "../../step-results";
import type { JoinState } from "../actions";

const initial: JoinState = { step: "invite" };

/** The presses that send a code, and so wait for the "אני לא רובוט" check. */
const SENDS = ["send", "resend"] as const;

/**
 * Send a code to the invited number, then join with it. Each step has the
 * "אני לא רובוט" check right above its sending press, one check for the
 * screen (`useCaptcha`). Each refusal is drawn anew, so the same one twice
 * is heard twice; the number is the invite's, so no field of it is marked.
 * On the code step the field takes the focus back after a new code or a
 * refusal (`codeTakesFocus`).
 */
export function JoinForm({
  join,
  captcha,
  ending,
}: {
  /** `join` for this link's token, or the design demo's stand-in. */
  join: (prev: JoinState, form: FormData) => Promise<JoinState>;
  /** The check: this deployment's widget, or the twin's stand-in. */
  captcha: CaptchaSetup;
  ending: string;
}) {
  const t = useTranslations("auth.join");
  const errors = useTranslations("auth.signIn.errors");
  const [state, action, pending] = useActionState(join, initial);
  const box = useCaptcha(captcha, "join");
  const answer = useAnswerCount(state);
  const code = useRef<HTMLInputElement>(null);
  const seen = useRef<JoinState | null>(null);
  const error =
    state.error === "shiftsLeft" || state.error === "elsewhere"
      ? t(state.error)
      : state.error
        ? errors(state.error)
        : undefined;
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

  // Once per answer, not when the screen is shown again (`arrived`).
  useEffect(() => {
    if (arrived(seen, state) && codeTakesFocus(state)) code.current?.focus();
  }, [state]);

  if (state.step === "invite") {
    // Each step is its own form (key), so the code step's button is a new
    // element rather than the send button fading back from its busy state.
    return (
      <form
        key="invite"
        action={action}
        onSubmit={(event) => box.holdSubmit(event, SENDS)}
        className="flex flex-col gap-4"
        noValidate
      >
        <p className="text-ink-2">{t.rich("sendIntro", { ending, ltr })}</p>
        {error ? (
          <p key={answer} role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
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
      </form>
    );
  }

  return (
    <form
      key="code"
      action={action}
      onSubmit={(event) => box.holdSubmit(event, SENDS)}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-ink-2" aria-live="polite">
        {t.rich(state.resent ? "codeResent" : "codeIntro", { ending, ltr })}
      </p>
      <CodeField
        ref={code}
        label={t("codeLabel")}
        error={error}
        answer={answer}
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
      <CaptchaBox captcha={box} name={CAPTCHA_FIELD} />
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
    </form>
  );
}
