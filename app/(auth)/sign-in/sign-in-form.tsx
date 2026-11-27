"use client";

import { displayIsraeliMobile } from "@domain/phone";
import { CAPTCHA_FIELD, type CaptchaSetup } from "@domain/turnstile";
import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { CaptchaBox, useCaptcha } from "@ui/captcha";
import { FieldGroup, GroupedPhoneField } from "@ui/field-group";
import { arrived, focusFirst } from "@ui/focus-after";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  type ReactNode,
  useActionState,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import type { SignInState } from "../actions";
import { authFieldsClass } from "../auth-screen";
import { CodeField } from "../code-field";
import {
  aboutTheCode,
  aboutTheNumber,
  answerHeard,
  focusAt,
  useAnswerCount,
  useQuietWhy,
} from "../step-results";

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
 *
 * Each answer is heard. A number refused is said by the announcer and
 * marked on its field, which takes back a focus that was lost; a code that
 * didn't go for any other reason is a line of its own above the press,
 * drawn anew each time, the press taking back the focus it lost, and the
 * number isn't marked. Never the focus from where the person put it. The
 * code step's words as it arrives, and its answers, a refusal or a new
 * code, are its field's to say (`CodeField`), once each. Too many codes
 * from this network says its minutes, in their own direction on the screen
 * and as plain words for the announcer.
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
  const answer = useAnswerCount(state);
  const phone = useRef<HTMLInputElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  // The state the screen starts with is its `autoFocus`'s, read whole: a
  // send made before the page could answer it comes back with the page.
  const seen = useRef<SignInState | null>(state);
  const { quiet, hush } = useQuietWhy(phone);
  const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  const error =
    state.error === "tooManyNetwork"
      ? t.markup("errors.tooManyNetwork", {
          minutes: state.minutes,
          ltr: (chunks) => chunks,
        })
      : state.error
        ? t(`errors.${state.error}`)
        : undefined;
  const errorLine =
    state.error === "tooManyNetwork"
      ? t.rich("errors.tooManyNetwork", { minutes: state.minutes, ltr })
      : error;
  const onTheNumber = aboutTheNumber(state.error);

  // A refusal on the phone step, once per answer: not when the screen is
  // shown again (`arrived`). In the drawing's own pass, so a field that
  // keeps the focus is drawn without why in its description.
  useLayoutEffect(() => {
    if (!arrived(seen, state)) return;
    if (state.step !== "phone" || !state.error) return;
    if (!aboutTheNumber(state.error)) {
      // Its own line says it (an alert, drawn anew): the press, busy
      // meanwhile, takes back the focus it lost, to be tried again.
      focusFirst([send.current]);
      return;
    }
    const field = phone.current;
    if (!field) return;
    const said = answerHeard({
      error: t("errors.invalidPhone"),
      at: focusAt(field),
    });
    if (said.focus) field.focus();
    if (said.say) announce(said.say.words, { politeness: said.say.politeness });
    if (said.quiet) hush(answer);
  }, [state, t, answer, hush]);

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
            ref={phone}
            name="phone"
            label={t("phoneLabel")}
            error={onTheNumber ? error : undefined}
            quietMessage={quiet === answer}
            className="font-medium text-xl"
            required
            autoFocus
          />
        </FieldGroup>
        <CaptchaBox captcha={box} name={CAPTCHA_FIELD} />
        {error && !onTheNumber ? (
          <p key={answer} role="alert" className="px-1 text-danger text-sm">
            {errorLine}
          </p>
        ) : null}
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
        {demoHref ? (
          <Button asChild variant="ghost" className="self-center">
            <Link href={demoHref}>{t("demo")}</Link>
          </Button>
        ) : null}
      </form>
    );
  }

  const shownPhone = displayIsraeliMobile(state.phone);
  const words = t.markup(state.resent ? "codeResent" : "codeIntro", {
    phone: shownPhone,
    ltr: (chunks) => chunks,
  });
  return (
    <form
      action={action}
      onSubmit={(event) => box.holdSubmit(event, SENDS)}
      className="flex flex-col gap-5"
      noValidate
    >
      {/* No live region: its field says it (`intro`, `resent`). */}
      <p className="px-1 text-ink-2">
        {t.rich(state.resent ? "codeResent" : "codeIntro", {
          phone: shownPhone,
          ltr,
        })}
      </p>
      <CodeField
        label={t("codeLabel")}
        intro={words}
        error={error}
        errorLine={errorLine}
        resent={state.resent ? words : undefined}
        answer={answer}
        wrongCode={state.error === "wrongCode"}
        invalid={aboutTheCode(state.error)}
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
