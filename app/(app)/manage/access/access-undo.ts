import { type HeldTimer, heldTimer } from "../../held-timer";
import { byAttribute } from "../editor-focus";

/**
 * The ways back on the screen of who sees pay (accessibility, part 8), with
 * no React: one at a time in each place, shown for its time, which waits
 * while it is being reached (UndoRow's `onWaitingChange`, the rule of
 * `@ui/undo-wait`), and where the focus goes once a person's came back.
 */

/**
 * How long a way back stays, before a removal is written; the screen's
 * checks wait past it (e2e/manage-lists-a11y.spec.ts).
 */
export const ACCESS_UNDO_MS = 6000;

/** Something with a key: what a way back undoes (a role's switch, a person). */
export type Keyed = { key: string };

export type UndoSlot<T extends Keyed> = {
  /** Shows `undo` in place of what was there, for the slot's whole time. */
  show(undo: T): void;
  /** Takes it away now. */
  clear(): void;
  /**
   * The way back of `key` is being reached, or no longer: its time stops,
   * and goes on with what it had left. One that went (another took its
   * place, as the next person is removed) changes nothing of the next.
   */
  waits(key: string, waiting: boolean): void;
  /** What it shows now. */
  shown(): T | null;
};

/**
 * One way back at a time, shown for `ms`, telling `changed` what it shows
 * (null once its time is up or it is cleared).
 */
export function createUndoSlot<T extends Keyed>(
  ms: number,
  changed: (shown: T | null) => void,
): UndoSlot<T> {
  let now: { undo: T; wait: HeldTimer } | null = null;
  return {
    show(undo) {
      now?.wait.clear();
      const mine: { undo: T; wait: HeldTimer } = {
        undo,
        wait: heldTimer(ms, () => {
          if (now !== mine) return;
          now = null;
          changed(null);
        }),
      };
      now = mine;
      changed(undo);
    },
    clear() {
      now?.wait.clear();
      now = null;
      changed(null);
    },
    waits(key, waiting) {
      if (now?.undo.key !== key) return;
      if (waiting) now.wait.pause();
      else now.wait.resume();
    },
    shown: () => now?.undo ?? null,
  };
}

/** The attribute each person's "הסרה" carries: whose access it takes away. */
export const ACCESS_REMOVE = "data-access-remove";

/**
 * The "הסרה" of this person: where the focus goes once "ביטול" gave them
 * their access back, their row back in its place.
 */
export function accessRemove(personId: string): string {
  return byAttribute(ACCESS_REMOVE, personId);
}
