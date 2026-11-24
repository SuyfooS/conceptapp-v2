"use client";

import { CAPTCHA_FIELD, type CaptchaSetup } from "@domain/turnstile";
import { Button } from "@ui/button";
import { CaptchaBox, useCaptcha } from "@ui/captcha";
import { arrived, focusFirst } from "@ui/focus-after";
import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useLayoutEffect, useRef } from "react";
import { CodeField } from "../../code-field";
import { aboutTheCode, useAnswerCount } from "../../step-results";
import type { JoinState } from "../actions";

const initial: JoinState = { step: "invite" };

/** The presses that send a code, and so wait for the "אני לא רובוט" check. */
const SENDS = ["send", "resend"] as const;

/**
 * Send a code to the invited number, then join with it. Each step has the
 * "אני לא רובוט" check right above its sending press, one check for the
 * screen (`useCaptcha`). Each refusal is drawn anew, so the same one twice
 * is heard twice, and the press, busy meanwhile, takes back the focus it
 * lost; the number is the invite's, so no field of it is marked. The code
 * step's words as it arrives, and its answers, a refusal or a new code, are
 * its field's to say (`CodeField`), once each.
 */
export function JoinForm({
  join,
  captcha,
  ending,
  start = initial,
}: {
  /** `join` for this link's token, or the design demo's stand-in. */
  join: (prev: JoinState, form: FormData) => Promise<JoinState>;
  /** The check: this deployment's widget, or the twin's stand-in. */
  captcha: CaptchaSetup;
  ending: string;
  /** The first step: the invite's; a test draws another whole. */
  start?: JoinState;
}) {
  const t = useTranslations("auth.join");
  const errors = useTranslations("auth.signIn.errors");
  const [state, action, pending] = useActionState(join, start);
  const box = useCaptcha(captcha, "join");
  const answer = useAnswerCount(state);
  const send = useRef<HTMLButtonElement>(null);
  // The state the screen starts with is read whole as it is drawn.
  const seen = useRef<JoinState | null>(state);
  const error =
    state.error === "shiftsLeft" || state.error === "elsewhere"
      ? t(state.error)
      : state.error
        ? errors(state.error)
        : undefined;
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

  // A code that didn't go, once per answer (`arrived`): its line says it,
  // and the press, busy meanwhile, takes back the focus it lost, to be tried
  // again. Never from where the person put it.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    if (state.step === "invite" && state.error) focusFirst([send.current]);
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
          ref={send}
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

  const words = t.markup(state.resent ? "codeResent" : "codeIntro", {
    ending,
    ltr: (chunks) => chunks,
  });
  return (
    <form
      key="code"
      action={action}
      onSubmit={(event) => box.holdSubmit(event, SENDS)}
      className="flex flex-col gap-4"
      noValidate
    >
      {/* No live region: its field says it (`intro`, `resent`). */}
      <p className="text-ink-2">
        {t.rich(state.resent ? "codeResent" : "codeIntro", { ending, ltr })}
      </p>
      <CodeField
        label={t("codeLabel")}
        intro={words}
        error={error}
        resent={state.resent ? words : undefined}
        answer={answer}
        wrongCode={state.error === "wrongCode"}
        invalid={aboutTheCode(state.error)}
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
