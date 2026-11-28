import { z } from "zod";
import {
  type KeepForPage,
  reloadForRelease,
  untilReloaded,
} from "@/app/stale-build";

type Writes = Record<string, (...args: never[]) => Promise<unknown>>;

/**
 * For a write whose arguments carry what was typed: what of them to keep
 * for the page loaded again (`reloadForRelease`'s `keep`), or nothing.
 */
export type KeepsOf<W extends Writes> = {
  [K in keyof W]?: (...args: Parameters<W[K]>) => KeepForPage | undefined;
};

/**
 * Waiter mode's writes on a page from the release before (closing the
 * pilot, PR 1b, known issue 37): "הוגש", "מוכן", "להוציא", a move, a close,
 * its "ביטול", a reopen and a takeaway's name are server actions, and a
 * page left open across a release asked for ids the server no longer had,
 * so each said it failed until the mode was opened again. Each pressed now
 * loads the page again
 * (`@/app/stale-build`), once a minute at most, for `person`, the
 * signed-in person whose press it was, keeping what `keeps` says of its
 * arguments (a takeaway's name, as typed), and waits for it to go, a while
 * at most; then it throws as before, so the screen that pressed says its
 * own failure should the page stay. Nothing is sent again: the page loaded
 * says the app was updated, and the person presses. A send goes by a route
 * handler, the outbox's, which a release leaves as it was. Any other
 * failure goes as it came, at once. A line's fix (החזרה, its cancel, "על
 * חשבון הבית") and the order's cancel are left out by the caller: held for
 * their "ביטול", they go by its time, not at a press, and fail in their
 * own words.
 */
export function reloadOnRelease<W extends Writes>(
  writes: W,
  person: string | null,
  keeps: KeepsOf<W> = {},
): W {
  const kept: Record<string, (...args: never[]) => Promise<unknown>> = {};
  for (const [name, write] of Object.entries(writes)) {
    const keepOf = keeps[name] as
      | ((...args: never[]) => KeepForPage | undefined)
      | undefined;
    kept[name] = async (...args) => {
      try {
        return await write(...args);
      } catch (error) {
        const keep = keepOf?.(...args);
        if (reloadForRelease(error, person, keep)) await untilReloaded();
        throw error;
      }
    };
  }
  return kept as W;
}

/** What a takeaway's name is kept under for the page loaded again. */
export const KEPT_LABEL = "takeaway";

/** A takeaway's name as typed, and whose order it names. */
export const KeptLabel = z.object({ order: z.string(), label: z.string() });

/**
 * A takeaway's name, saved as its field is left, that met the release
 * before: kept as typed (cleared, as nothing), for its order's screen to put
 * back in the field, unsaved.
 */
export function keepLabel(order: string, label: string | null): KeepForPage {
  return {
    of: KEPT_LABEL,
    value: { order, label: label ?? "" },
    words: "typed",
  };
}
