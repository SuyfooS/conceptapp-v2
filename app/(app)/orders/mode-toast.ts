import { newsGate } from "./news-gate";

/** What the mode's toast needs to know of each thing it says. */
export type ToastSaid = {
  /** Its way back, when it offers one. */
  undo: (() => void) | null;
  /** Hears whether the toast counts for the person (what its undo holds waits). */
  onWaitingChange: ((waiting: boolean) => void) | null;
};

export type ShownToast<T extends ToastSaid> = T & {
  /** Which toast this is: its withdrawal takes away this one alone. */
  id: number;
};

/**
 * The mode's one toast as state (waiter mode P4), apart from what draws it
 * (`useModeToast`, orders-mode.tsx), so its rules are held by tests. `say`
 * takes the toast's place and returns its withdrawal, which takes that toast
 * away while it still shows, and only that one: a newer toast stays. News
 * (`tell`) waits while a way back is offered (news-gate.ts), and is told as
 * the toast goes: by its time, its way back pressed or its withdrawal. A
 * toast that stopped counting for the person hears it goes on as a newer one
 * takes its place, unless it was withdrawn or its way back pressed: what it
 * held went or was let go then.
 */
export function modeToast<T extends ToastSaid>(
  show: (toast: ShownToast<T> | null) => void,
) {
  const gate = newsGate();
  let shown: ShownToast<T> | null = null;
  let count = 0;
  /** The toast that last heard it stopped counting, and whether it still is. */
  let told: {
    id: number;
    waiting: boolean;
    hear: (w: boolean) => void;
  } | null = null;
  const put = (toast: ShownToast<T> | null) => {
    shown = toast;
    show(toast);
  };
  return {
    /** What is shown now, or null. */
    shown: (): ShownToast<T> | null => shown,
    say(toast: T): () => void {
      // A toast that waited for the person hears it goes on, as it goes: what
      // its way back holds (a take-back) lands then, never stays held.
      if (told?.waiting) told.hear(false);
      told = null;
      gate.said(Boolean(toast.undo));
      count += 1;
      const id = count;
      put({ ...toast, id });
      return () => {
        if (shown?.id !== id) return;
        if (told?.id === id) told = null;
        put(null);
        gate.hidden();
      };
    },
    /** The shown toast stopped counting for the person, or goes on. */
    waiting(waiting: boolean): void {
      const current = shown;
      if (!current?.onWaitingChange) return;
      told = { id: current.id, waiting, hear: current.onWaitingChange };
      current.onWaitingChange(waiting);
    },
    /** Its way back was pressed: it lets go of what it held, and goes. */
    undo(): void {
      const current = shown;
      if (!current?.undo) return;
      told = null;
      put(null);
      current.undo();
      // Nothing said in its place: what waited is told now.
      if (shown === null) gate.hidden();
    },
    /** Its "פתיחה" was pressed: it goes. */
    close(): void {
      if (shown === null) return;
      put(null);
      gate.hidden();
    },
    /**
     * The toast drawn with `id` went from sight (its time up, or nothing to
     * say): what waited is told, unless a newer toast was said since.
     */
    hidden(id: number | null): void {
      if ((shown?.id ?? null) !== id) return;
      gate.hidden();
    },
    /** News nobody pressed for: now, or once the way back on screen has gone. */
    tell(news: () => void): void {
      gate.tell(news);
    },
  };
}
