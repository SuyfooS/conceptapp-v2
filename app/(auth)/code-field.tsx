"use client";

import { OTP_LENGTH } from "@domain/otp";
import { announce } from "@ui/announcer";
import { CodeSlots } from "@ui/code-slots";
import { arrived } from "@ui/focus-after";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { authFieldsClass } from "./auth-screen";
import { answerHeard, focusAt, useQuietWhy } from "./step-results";

/** How long the check shows before the app opens. */
const ACCEPTED_MS = 650;

/**
 * The code step's field, for sign-in and for joining: the form sends itself once
 * the last digit is in, a wrong code drains away, and a right one shows a check
 * before moving on to `to`. Other errors leave the digits to try again.
 *
 * As the step arrives, the field's `autoFocus` reads it, and then the step's
 * words (`intro`: where the code went) are said, once. Each answer of the
 * step after that is said once too (`answerHeard`): a refusal by the page's
 * announcer, with no alert of its own, and the field takes back a focus
 * that was lost but never one the person put elsewhere. Its line is the
 * field's description too, first, for whoever comes back to it, though not
 * while the field keeps the focus it had as the announcer said it. A new
 * code asked for is said after it, the same words again included.
 */
export function CodeField({
  label,
  intro,
  error,
  resent,
  answer,
  wrongCode,
  invalid,
  pending,
  to,
}: {
  label: string;
  /** The step's words as it arrives (where the code went), in plain words. */
  intro?: string;
  error?: string;
  /** On an answer that asked for a new code: what it says, in plain words. */
  resent?: string;
  /** Which answer of the step this is (`useAnswerCount`): each is heard. */
  answer: number;
  wrongCode: boolean;
  /** The digits were refused (`aboutTheCode`): the field is marked so. */
  invalid: boolean;
  pending: boolean;
  /** Where to go once the code was accepted. */
  to?: string;
}) {
  const router = useRouter();
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The answer the step arrived with is its `autoFocus`'s, read whole with
  // any error there (the design twin's `?step=code&error=captcha`): not
  // said again.
  const heard = useRef<number | null>(answer);
  const introduced = useRef(false);
  const { quiet, hush } = useQuietWhy(input);
  const errorId = useId();

  useEffect(() => {
    if (!to) return;
    const leave = setTimeout(() => router.replace(to), ACCEPTED_MS);
    return () => clearTimeout(leave);
  }, [to, router]);

  // The step's words, said once as it arrives (not when the screen is shown
  // again), politely, after the field its `autoFocus` reads: the only place
  // the number typed is said back.
  useEffect(() => {
    if (introduced.current || !intro) return;
    introduced.current = true;
    announce(intro);
  }, [intro]);

  // As each answer arrives, once (`arrived`: not when the screen is shown
  // again). In the drawing's own pass, before CodeSlots' effect puts the
  // focus back after a wrong code, and before the browser draws: where the
  // focus is now decides how why is said, and a field that keeps the focus
  // is drawn without why in its description.
  useLayoutEffect(() => {
    if (!arrived(heard, answer)) return;
    const field = input.current;
    if (!field) return;
    const said = answerHeard({ error, resent, at: focusAt(field) });
    if (said.focus) field.focus();
    if (said.say) announce(said.say.words, { politeness: said.say.politeness });
    if (said.quiet) hush(answer);
  }, [answer, error, resent, hush]);

  function submit() {
    const form = anchor.current?.closest("form");
    const verify = form?.querySelector<HTMLButtonElement>(
      'button[value="verify"]',
    );
    form?.requestSubmit(verify ?? undefined);
  }

  return (
    <div ref={anchor} className="flex flex-col gap-2">
      <CodeSlots
        ref={input}
        name="code"
        label={label}
        length={OTP_LENGTH}
        status={
          to ? "success" : pending ? "pending" : wrongCode ? "error" : "idle"
        }
        invalid={invalid}
        onComplete={submit}
        describedBy={error && quiet !== answer ? errorId : undefined}
        slotClassName={authFieldsClass}
        autoFocus
      />
      {error ? (
        <p id={errorId} className="px-1 text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
