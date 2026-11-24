"use client";

import { CAPTCHA_FIELD, type CaptchaSetup } from "@domain/turnstile";
import { Button } from "@ui/button";
import { CaptchaBox, useCaptcha } from "@ui/captcha";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState } from "react";
import { CodeField } from "../../code-field";
import { useAnswerCount } from "../../step-results";
import type { JoinState } from "../actions";

const initial: JoinState = { step: "invite" };

/** The presses that send a code, and so wait for the "אני לא רובוט" check. */
const SENDS = ["send", "resend"] as const;

/**
 * Send a code to the invited number, then join with it. Each step has the
 * "אני לא רובוט" check right above its sending press, one check for the
 * screen (`useCaptcha`). Each refusal is drawn anew, so the same one twice
 * is heard twice; the number is the invite's, so no field of it is marked.
 * The code step's answers, a refusal or a new code, are its field's to say
 * (`CodeField`), once each.
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
  const error =
    state.error === "shiftsLeft" || state.error === "elsewhere"
      ? t(state.error)
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
      {/* No live region: a new code is said by its field (`resent`). */}
      <p className="text-ink-2">
        {t.rich(state.resent ? "codeResent" : "codeIntro", { ending, ltr })}
      </p>
      <CodeField
        label={t("codeLabel")}
        error={error}
        resent={
          state.resent
            ? t.markup("codeResent", { ending, ltr: (chunks) => chunks })
            : undefined
        }
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
