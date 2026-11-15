/**
 * A wait of `ms` that calls `due` once it is over (`useHeldWrite`'s). It can
 * stop and go on: `pause` keeps the time it has left, and `resume` waits only
 * that long more, so a write held for its undo waits as long as the toast
 * that offers the undo does. `clear` ends it without calling `due`.
 */
export function heldTimer(ms: number, due: () => void) {
  let left = ms;
  let since = Date.now();
  let over = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const end = () => {
    timer = null;
    over = true;
    due();
  };
  timer = setTimeout(end, ms);
  return {
    /** Stops the wait, keeping what it has left. */
    pause() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      left = Math.max(0, left - (Date.now() - since));
    },
    /** Goes on waiting what was left when it stopped. */
    resume() {
      if (timer !== null || over) return;
      since = Date.now();
      timer = setTimeout(end, left);
    },
    /** Ends the wait without calling `due`. */
    clear() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      over = true;
    },
  };
}

export type HeldTimer = ReturnType<typeof heldTimer>;
