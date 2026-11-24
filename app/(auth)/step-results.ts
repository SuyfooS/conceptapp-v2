/**
 * What sign-in and joining do with each answer of their steps' action, for a
 * screen reader as much as for the eye: where a refusal is said, when it is
 * drawn anew, and how a step's field says each answer of its step.
 */

import type { Politeness } from "@ui/announcer-store";
import { type DocLike, focusLost } from "@ui/focus-after";
import { type RefObject, useEffect, useState } from "react";
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

/**
 * Whether a refusal on the code step is about the digits typed: a wrong
 * code (drained away) or one too short (kept). The code field is marked
 * invalid while it stands; every other refusal (too many, the check, a
 * failure, joining's own) leaves the digits unmarked.
 */
export function aboutTheCode(error: string | undefined): boolean {
  return error === "wrongCode" || error === "invalidCode";
}

/** Where the focus is as an answer of a step arrives, for the step's field. */
export type FocusAt = "field" | "lost" | "elsewhere";

/** A press of a step's own form: each is busy while the step's action runs. */
const STEP_PRESS = 'button[type="submit"]';

/**
 * Where the focus is as an answer arrives, for `field`, the step's field
 * that may take it: on the field itself; lost (`focusLost`: on the page, on
 * a press disabled while it waits), or on a press of the step's own form,
 * which was busy while the answer came and so lost it (the browser moves
 * it to the page at its next drawing); else elsewhere, on a control the
 * person moved to meanwhile (the demo door's link, the check's "בדיקה
 * מחדש"), where it stays.
 */
export function focusAt(
  field: Element,
  doc: DocLike | undefined = globalThis.document as DocLike | undefined,
): FocusAt {
  const active = doc?.activeElement ?? null;
  if (active === field) return "field";
  if (active === null || focusLost(doc)) return "lost";
  const form = field.closest("form");
  const ownPress =
    form !== null &&
    active.matches(STEP_PRESS) &&
    active.closest("form") === form;
  return ownPress ? "lost" : "elsewhere";
}

/** What a step's field does as an answer of its step arrives. */
export type AnswerHeard = {
  /** It takes the focus, and so is read: its label, and that it is invalid. */
  focus: boolean;
  /** What the page's announcer says, and how, if anything. */
  say?: { words: string; politeness: Politeness };
  /**
   * Why is out of the field's description while the field keeps this
   * focus (`useQuietWhy`): the announcer says it, and a read of the field
   * would say it again. Back in once the focus leaves the field.
   */
  quiet: boolean;
};

/**
 * How a step's field says an answer of its step, once, as each arrives
 * (the code field, `CodeField`; the number's, on sign-in's phone step). A
 * refusal is said by the page's announcer wherever the focus is, and never
 * by an alert as well: a description alone is a hint for VoiceOver, said
 * after a pause or not at all. Where the focus was lost (the busy press
 * that checks the code, or sends one) the field takes it back and why is
 * said after the field's own read, politely, which an assertive line could
 * cut short or be cut by; where the field kept it (the code sent itself
 * after its last digit, Enter from the number) it stays, and why is said at
 * once. Either way the field has the focus, and why is out of its
 * description meanwhile, so it isn't said twice. Where the person moved it
 * elsewhere meanwhile, it stays there, why is said at once, and the field
 * keeps it in its description for when they come back. A new code asked
 * for is said after what is read, politely, the field taking back a focus
 * that was lost: a line of the screen would say nothing when its words are
 * the same as last time (a second press in a row). Nothing for the step's
 * arrival, which the field's `autoFocus` has, or the code accepted.
 */
export function answerHeard({
  error,
  resent,
  at,
}: {
  /** Why the step refused, in words. */
  error?: string;
  /** What a new code asked for says, in plain words, when one was. */
  resent?: string;
  /** Where the focus is as the answer arrives (`focusAt`). */
  at: FocusAt;
}): AnswerHeard {
  if (error) {
    return {
      focus: at === "lost",
      say: {
        words: error,
        politeness: at === "lost" ? "polite" : "assertive",
      },
      quiet: at !== "elsewhere",
    };
  }
  if (resent) {
    return {
      focus: at === "lost",
      say: { words: resent, politeness: "polite" },
      quiet: false,
    };
  }
  return { focus: false, quiet: false };
}

/**
 * Which answer's why is out of its field's description now (`hush` it with
 * the answer, as `AnswerHeard.quiet` says): the announcer said it while the
 * field had the focus. It is back once the focus leaves the field, for
 * whoever comes back to it (Tab, a tap elsewhere); a new answer is described
 * as it comes. A screen reader's swipe moves only its own cursor, so a
 * swipe away and back finds it still out, the visible line right after the
 * field saying it. No timer brings it back while the field keeps the focus:
 * NVDA says a change to the focused field's description, which is the
 * second read this keeps away.
 */
export function useQuietWhy(field: RefObject<HTMLElement | null>): {
  quiet: number | null;
  hush: (answer: number | null) => void;
} {
  const [quiet, hush] = useState<number | null>(null);
  useEffect(() => {
    if (quiet === null) return;
    const at = field.current;
    const speak = () => hush(null);
    if (!at || document.activeElement !== at) {
      speak();
      return;
    }
    at.addEventListener("blur", speak);
    return () => at.removeEventListener("blur", speak);
  }, [quiet, field]);
  return { quiet, hush };
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
