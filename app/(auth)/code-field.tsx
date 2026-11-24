"use client";

import { OTP_LENGTH } from "@domain/otp";
import { announce } from "@ui/announcer";
import { CodeSlots } from "@ui/code-slots";
import { arrived } from "@ui/focus-after";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { authFieldsClass } from "./auth-screen";
import { codeAnswerHeard } from "./step-results";

/** How long the check shows before the app opens. */
const ACCEPTED_MS = 650;

/**
 * The code step's field, for sign-in and for joining: the form sends itself once
 * the last digit is in, a wrong code drains away, and a right one shows a check
 * before moving on to `to`. Other errors leave the digits to try again.
 *
 * Each answer of the step is heard once (`codeAnswerHeard`). The error is the
 * field's own description, with no alert of its own: the field takes the focus
 * back where it fell elsewhere and is read with why, or, where it kept the
 * focus, the announcer says why. A new code asked for takes the focus back too,
 * and its words are said after it, the same words again included.
 */
export function CodeField({
  label,
  error,
  resent,
  answer,
  wrongCode,
  pending,
  to,
}: {
  label: string;
  error?: string;
  /** On an answer that asked for a new code: what it says, in plain words. */
  resent?: string;
  /** Which answer of the step this is (`useAnswerCount`): each is heard. */
  answer: number;
  wrongCode: boolean;
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
  const errorId = useId();

  useEffect(() => {
    if (!to) return;
    const leave = setTimeout(() => router.replace(to), ACCEPTED_MS);
    return () => clearTimeout(leave);
  }, [to, router]);

  // As each answer arrives, once (`arrived`: not when the screen is shown
  // again). In the drawing's own pass, before CodeSlots' effect puts the
  // focus back after a wrong code: where the focus is now decides how why
  // is said.
  useLayoutEffect(() => {
    if (!arrived(heard, answer)) return;
    const field = input.current;
    if (!field) return;
    const { focus, say } = codeAnswerHeard({
      error,
      resent,
      focused: document.activeElement === field,
    });
    if (focus) field.focus();
    if (say) announce(say.words, { politeness: say.politeness });
  }, [answer, error, resent]);

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
        onComplete={submit}
        describedBy={error ? errorId : undefined}
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
