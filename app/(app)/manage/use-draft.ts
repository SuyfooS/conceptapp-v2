import { useLayoutEffect, useRef, useState } from "react";

/** How long typing pauses before what's typed saves itself. */
export const TYPING_MS = 500;

const asIs = (text: string) => text;

/**
 * A draft sent to be saved (as `tidy` has it), with what was stored as it
 * went, and whether it went as the screen or the page did (`away`).
 */
export type SentDraft = { draft: string; stored: string; away: boolean };

/**
 * Whether a whole draft that isn't what's stored is sent now: `away` as the
 * screen or the page goes, otherwise as the field is left. Not when the same
 * draft went already against the same stored value: as the screen goes,
 * however it went (the field left just before), and as the field is left,
 * when it went as the screen or the page did (a blur that comes after).
 * Left again after a refusal, with nothing typed since, it tries again.
 */
export function sendsNow(
  draft: string,
  stored: string,
  sent: SentDraft | null,
  away: boolean,
): boolean {
  if (sent === null || sent.draft !== draft || sent.stored !== stored) {
    return true;
  }
  return !away && !sent.away;
}

/**
 * A value that's typed, so it can be half written for a moment: what's on
 * screen until it's whole, saved shortly after the typing stops (`delay`) or
 * on leaving, or only on leaving (a null `delay`). When what's stored
 * changes, the draft follows it, unless the person has typed on since: a
 * save landing doesn't wipe what came after it. `tidy` says which drafts mean
 * what's stored (" 5 " and "5", "05" and "5"), so a draft that only differs
 * in its spaces is not saved again.
 *
 * A whole draft also saves when the page is hidden or closed, and when the
 * screen is left inside the app (Next keeps it in an <Activity>) with the
 * focus still in the field: no blur may come then, as when a screen
 * reader's cursor moved on without the focus. Once, whichever comes first.
 */
export function useDraft(
  stored: string,
  isWhole: (draft: string) => boolean,
  save: (draft: string) => void,
  delay: number | null,
  tidy: (draft: string) => string = asIs,
) {
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef<SentDraft | null>(null);
  // As the screen last drew, for a page or a screen that goes.
  const now = useRef({ draft, stored, isWhole, save, tidy });
  useLayoutEffect(() => {
    now.current = { draft, stored, isWhole, save, tidy };
  });
  if (seen !== stored) {
    setSeen(stored);
    if (draft === seen || tidy(draft) === stored) setDraft(stored);
  }

  function settle() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function send(text: string, from: string, away: boolean) {
    sent.current = { draft: now.current.tidy(text), stored: from, away };
    now.current.save(text);
  }

  /** What's whole and not saved yet goes now: the screen or the page goes. */
  function flush() {
    settle();
    const { draft, stored, isWhole, tidy } = now.current;
    if (!isWhole(draft) || tidy(draft) === stored) return;
    if (sendsNow(tidy(draft), stored, sent.current, true)) {
      send(draft, stored, true);
    }
  }

  // A layout effect, so a screen left inside the app saves as it hides.
  // biome-ignore lint/correctness/useExhaustiveDependencies: flush reads the latest through refs
  useLayoutEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, []);

  return {
    draft,
    whole: isWhole(draft),
    /**
     * `wait` in place of `delay`, for a change that isn't typed: a number's
     * minus or plus saves soon after the press, where its typed digits wait
     * until it is left.
     */
    edit(next: string, wait: number | null = delay) {
      setDraft(next);
      settle();
      sent.current = null;
      if (wait !== null && isWhole(next) && tidy(next) !== stored) {
        timer.current = setTimeout(() => send(next, stored, false), wait);
      }
    },
    leave() {
      settle();
      if (!isWhole(draft) || tidy(draft) === stored) setDraft(stored);
      else if (sendsNow(tidy(draft), stored, sent.current, false)) {
        send(draft, stored, false);
      }
    },
    /** Takes this value and saves it now, as a tap does, instead of what was pending. */
    commit(next: string) {
      settle();
      setDraft(next);
      if (isWhole(next) && tidy(next) !== stored) send(next, stored, false);
    },
  };
}
