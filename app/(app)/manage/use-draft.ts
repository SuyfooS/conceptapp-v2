import { useRef, useState } from "react";

/** How long typing pauses before what's typed saves itself. */
export const TYPING_MS = 500;

const asIs = (text: string) => text;

/**
 * A value that's typed, so it can be half written for a moment: what's on
 * screen until it's whole, saved shortly after the typing stops (`delay`) or
 * on leaving, or only on leaving (a null `delay`). When what's stored
 * changes, the draft follows it, unless the person has typed on since: a
 * save landing doesn't wipe what came after it. `tidy` says which drafts mean
 * what's stored (" 5 " and "5", "05" and "5"), so a draft that only differs
 * in its spaces is not saved again.
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
  if (seen !== stored) {
    setSeen(stored);
    if (draft === seen || tidy(draft) === stored) setDraft(stored);
  }

  function settle() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

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
      if (wait !== null && isWhole(next) && tidy(next) !== stored) {
        timer.current = setTimeout(() => save(next), wait);
      }
    },
    leave() {
      settle();
      if (!isWhole(draft)) setDraft(stored);
      else if (tidy(draft) !== stored) save(draft);
      else setDraft(stored);
    },
    /** Takes this value and saves it now, as a tap does, instead of what was pending. */
    commit(next: string) {
      settle();
      setDraft(next);
      if (isWhole(next) && tidy(next) !== stored) save(next);
    },
  };
}
