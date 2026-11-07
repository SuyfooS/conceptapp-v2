import { useRef, useState } from "react";

/** How long typing pauses before what's typed saves itself. */
export const TYPING_MS = 500;

/**
 * A value that's typed, so it can be half written for a moment: what's on
 * screen until it's whole, saved shortly after the typing stops or on leaving.
 * Comes back to what's stored when a save fails.
 */
export function useDraft(
  stored: string,
  isWhole: (draft: string) => boolean,
  save: (draft: string) => void,
  delay: number | null,
) {
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (seen !== stored) {
    setSeen(stored);
    setDraft(stored);
  }

  function settle() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  return {
    draft,
    whole: isWhole(draft),
    edit(next: string) {
      setDraft(next);
      settle();
      if (delay !== null && isWhole(next) && next !== stored) {
        timer.current = setTimeout(() => save(next), delay);
      }
    },
    leave() {
      settle();
      if (!isWhole(draft)) setDraft(stored);
      else if (draft !== stored) save(draft);
    },
    /** Takes this value and saves it now, as a tap does, instead of what was pending. */
    commit(next: string) {
      settle();
      setDraft(next);
      if (isWhole(next) && next !== stored) save(next);
    },
  };
}
