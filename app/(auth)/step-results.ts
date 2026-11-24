/**
 * What sign-in and joining do with each answer of their steps' action, for a
 * screen reader as much as for the eye: where a refusal is said, when it is
 * drawn anew, and how the code field says each answer of its step.
 */

import type { Politeness } from "@ui/announcer-store";
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

/** What the code field does as an answer of its step arrives. */
export type CodeAnswerHeard = {
  /** It takes the focus, and so is read whole: its label, count and why. */
  focus: boolean;
  /** What the page's announcer says, and how, if anything. */
  say?: { words: string; politeness: Politeness };
};

/**
 * How the code field says an answer of the code step, once (`CodeField`,
 * as each arrives). A refusal is the field's own description, never an
 * alert as well: where the focus fell elsewhere (the busy press that checks
 * the code, or "שליחת קוד חדש") the field takes it back and is read with
 * why; where the field kept it (the code sent itself after its last
 * digit), a move would read nothing, so the announcer says why at once. A
 * new code asked for takes the focus back too, its press having been busy,
 * and is said after it, politely, through the announcer: a line of the
 * screen would say nothing when its words are the same as last time (a
 * second press in a row). Nothing for the step's arrival, which the field's
 * `autoFocus` has, or the code accepted.
 */
export function codeAnswerHeard({
  error,
  resent,
  focused,
}: {
  /** Why the code step refused, in words. */
  error?: string;
  /** What a new code asked for says, in plain words, when one was. */
  resent?: string;
  /** Whether the code field has the focus as the answer arrives. */
  focused: boolean;
}): CodeAnswerHeard {
  if (error) {
    return focused
      ? { focus: false, say: { words: error, politeness: "assertive" } }
      : { focus: true };
  }
  if (resent) {
    return { focus: true, say: { words: resent, politeness: "polite" } };
  }
  return { focus: false };
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
 * alert, so each is drawn anew and heard, the same words again included,
 * and on the code step what tells its field an answer arrived (`CodeField`).
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
