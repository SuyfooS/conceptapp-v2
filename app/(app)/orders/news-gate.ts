/**
 * News that must never take a way back's place (waiter mode P4): the mode
 * has one toast, and a ticket turning ready is news nobody pressed for,
 * while "ביטול" of a take-back or a serve is the only way back from what was
 * just done. News is told at once while no toast offers a way back; else it
 * waits until that toast has gone (its time up, or its way back pressed),
 * and only the newest of what waited is told, once. Pure, for the mode's
 * toast (orders-mode.tsx) and its tests.
 */
export function newsGate() {
  let offersUndo = false;
  let waiting: (() => void) | null = null;
  return {
    /** The toast now says this: with a way back, or none. */
    said(undo: boolean) {
      offersUndo = undo;
    },
    /** News to tell: now, or once the way back on screen has gone. */
    tell(show: () => void) {
      waiting = null;
      if (offersUndo) {
        waiting = show;
        return;
      }
      show();
    },
    /** The toast went from sight: what waited for it is told. */
    hidden() {
      offersUndo = false;
      const news = waiting;
      waiting = null;
      news?.();
    },
  };
}
