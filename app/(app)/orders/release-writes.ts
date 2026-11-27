import { reloadForRelease, untilReloaded } from "@/app/stale-build";

type Writes = Record<string, (...args: never[]) => Promise<unknown>>;

/**
 * Waiter mode's writes on a page from the release before (closing the
 * pilot, PR 1b, known issue 37): "הוגש", "מוכן", החזרה, "להוציא", a line's
 * cancel or "על חשבון הבית", the order's cancel, a move, a close, its
 * "ביטול" and a reopen are server actions, and a page left open across a
 * release asked for ids the server no longer had, so each said it failed
 * until the mode was opened again. Each now loads the page again
 * (`@/app/stale-build`), once a minute at most, for `person`, the
 * signed-in person whose press it was, and waits for it to go, a while at
 * most; then it throws as before, so the screen that pressed says its own
 * failure should the page stay. Nothing is sent again: the page loaded
 * says the app was updated, and the person presses. A send goes by a route
 * handler, the outbox's, which a release leaves as it was. Any other
 * failure goes as it came, at once.
 */
export function reloadOnRelease<W extends Writes>(
  writes: W,
  person: string | null,
): W {
  const kept: Record<string, (...args: never[]) => Promise<unknown>> = {};
  for (const [name, write] of Object.entries(writes)) {
    kept[name] = async (...args) => {
      try {
        return await write(...args);
      } catch (error) {
        if (reloadForRelease(error, person)) await untilReloaded();
        throw error;
      }
    };
  }
  return kept as W;
}
