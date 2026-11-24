"use client";

import { OTP_LENGTH } from "@domain/otp";
import { CodeSlots } from "@ui/code-slots";
import { useRouter } from "next/navigation";
import { type Ref, useEffect, useId, useRef } from "react";
import { authFieldsClass } from "./auth-screen";

/** How long the check shows before the app opens. */
const ACCEPTED_MS = 650;

/**
 * The code step's field, for sign-in and for joining: the form sends itself once
 * the last digit is in, a wrong code drains away, and a right one shows a check
 * before moving on to `to`. Other errors leave the digits to try again. The
 * error is the field's own (read with it when the focus comes back), and its
 * line is drawn anew for each answer, so the same refusal twice is heard twice.
 */
export function CodeField({
  label,
  error,
  answer,
  wrongCode,
  pending,
  to,
  ref,
}: {
  label: string;
  error?: string;
  /** Which answer of the step this is (`useAnswerCount`): the error's key. */
  answer: number;
  wrongCode: boolean;
  pending: boolean;
  /** Where to go once the code was accepted. */
  to?: string;
  /** The code's own input, for the screen to bring the focus back to it. */
  ref?: Ref<HTMLInputElement>;
}) {
  const router = useRouter();
  const anchor = useRef<HTMLDivElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (!to) return;
    const leave = setTimeout(() => router.replace(to), ACCEPTED_MS);
    return () => clearTimeout(leave);
  }, [to, router]);

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
        ref={ref}
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
        <p
          key={answer}
          id={errorId}
          role="alert"
          className="px-1 text-danger text-sm"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
