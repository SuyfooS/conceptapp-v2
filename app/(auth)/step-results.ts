/**
 * What sign-in and joining do with each answer of their steps' action, for a
 * screen reader as much as for the eye: where a refusal is said, when it is
 * drawn anew, and when the code field takes the focus back.
 */

import { useState } from "react";
import type { SignInError } from "./otp";

/**
 * Whether a refusal on the phone step is about the number itself, and so
 * said on its field: the field marked invalid, its message read with it, the
 * focus taken there. Every other one (the "אני לא רובוט" check, too many
 * tries, a failure) has its own line above the press, and the number, which
 * was fine, isn't marked.
 */
export function aboutTheNumber(error: SignInError | undefined): boolean {
  return error === "invalidPhone";
}

/** What `codeTakesFocus` reads of a step: sign-in's or joining's. */
export type StepAnswer = {
  step: string;
  resent?: boolean;
  error?: string;
};

/**
 * Whether the code field takes the focus back after this answer: a new
 * code asked for (its button was busy meanwhile, so the focus fell to the
 * page), or a refusal on the code step, so the next code is typed straight
 * away. Not the step's arrival, which the field's own `autoFocus` has, and
 * not the code accepted.
 */
export function codeTakesFocus(answer: StepAnswer): boolean {
  return answer.step === "code" && Boolean(answer.resent || answer.error);
}

/** An answer of the step's action, and how many came before it. */
export type Counted<T> = { readonly answer: T; readonly count: number };

/**
 * `kept` after the action's state `now`: the same while it is the same
 * answer, else one more. Compared by identity: each answer is a new object,
 * so the same refusal twice counts twice.
 */
export function countAnswer<T>(kept: Counted<T>, now: T): Counted<T> {
  return kept.answer === now ? kept : { answer: now, count: kept.count + 1 };
}

/**
 * How many answers the step's action gave so far: the key of a refusal's
 * line, so each is drawn anew and heard, the same words again included.
 * Counted as the screen draws (React's state from the drawing before, as
 * `useCaptcha` keeps its control), not in an effect: a refusal is never
 * first written into the old line and then drawn again, which a screen
 * reader would say twice.
 */
export function useAnswerCount<T>(state: T): number {
  const [kept, keep] = useState<Counted<T>>(() => ({
    answer: state,
    count: 0,
  }));
  const now = countAnswer(kept, state);
  if (now !== kept) keep(now);
  return now.count;
}
