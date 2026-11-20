/**
 * News that must never take a way back's place (waiter mode P4): the mode
 * has one toast, and a ticket turning ready or a round landing with no
 * screen waiting for its answer is news nobody pressed for, while "ביטול" of
 * a take-back or a serve is the only way back from what was just done. News
 * is told at once while no toast offers a way back and no other news waits;
 * else it waits its turn. Each piece is about something (`about`): "ready"
 * for what turned ready, whose telling says all of it, or a round that
 * landed. What waits keeps one telling of each, its newest, in the order
 * each first came. Once the way back has gone (its time up, or its way back
 * pressed) the first is told, and the rest wait for the toast it says to go,
 * so each is seen. A telling returns whether it said anything: one with
 * nothing left to say lets the next be told at once. Pure, for the mode's
 * toast (mode-toast.ts) and its tests.
 */
export function newsGate() {
  let offersUndo = false;
  const waiting = new Map<string, () => boolean>();
  return {
    /** The toast now says this: with a way back, or none. */
    said(undo: boolean) {
      offersUndo = undo;
    },
    /**
     * News about `about`: now, or in its turn. `show` says it, and returns
     * whether it said anything.
     */
    tell(about: string, show: () => boolean) {
      if (offersUndo || waiting.size > 0) {
        // The same news again keeps its place in the line: its newest is told.
        waiting.set(about, show);
        return;
      }
      show();
    },
    /** The toast went from sight: the first of what waited is told. */
    hidden() {
      offersUndo = false;
      for (const [about, show] of waiting) {
        waiting.delete(about);
        if (show()) return;
      }
    },
  };
}
