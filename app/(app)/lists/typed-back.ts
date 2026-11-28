import type { ListItem } from "@domain/lists";
import { z } from "zod";

/*
 * What was typed on a list and not saved when a change met a page from the
 * release before (closing the pilot, PR 1b), and what of it the list loaded
 * again puts back (`typedBack`). The screen keeps it (`typedToKeep` in
 * list-screen.tsx) and takes it back (`takeKept`); this decides, with no
 * React, for the tests.
 */

/** An item whose range goes below zero needs a minus sign to be typed. */
export const needsMinus = (item: ListItem) =>
  item.kind === "number" &&
  ((item.min !== null && item.min < 0) || (item.max !== null && item.max < 0));

/**
 * What was typed and not saved, kept for the page loaded again, by item:
 * each number's or note's field as typed, a number's minus with it, an
 * order's count, a comment being saved or written, and whether the list was
 * being fixed (L6b-1) as the change was made.
 */
export const KeptTyped = z.object({
  fields: z.record(z.string(), z.string()),
  minus: z.record(z.string(), z.boolean()),
  given: z.record(z.string(), z.string()),
  comment: z.object({ item: z.string(), text: z.string() }).nullable(),
  fix: z.boolean(),
});

export type KeptTyped = z.infer<typeof KeptTyped>;

/** What goes back on the list loaded, and whether it opens being fixed. */
export type TypedBack = Omit<KeptTyped, "fix"> & { fixing: boolean };

/**
 * What of `kept` the list loaded again puts back, unsaved: only on a list
 * that takes it. Typed while it was fixed, a list the person may still fix
 * opens being fixed again, and it goes back there; else only on a list
 * still being filled (`can.fill`). A finished list nobody is fixing shows
 * its answers as saved, so nothing typed goes on it. Only its own items
 * take it, each as its kind does: a number's or note's field, a minus where
 * one is needed, an order's count, a comment. Null for nothing put back,
 * which the frame then doesn't say came back.
 */
export function typedBack(
  kept: KeptTyped | null,
  list: { items: ListItem[]; asksQuantities: boolean },
  can: { fill: boolean; fix: boolean },
): TypedBack | null {
  if (kept === null) return null;
  const fixing = kept.fix && can.fix;
  if (!can.fill && !fixing) return null;
  const here = new Map(list.items.map((item) => [item.id, item]));
  const only = <T>(
    record: Record<string, T>,
    keep: (item: ListItem) => boolean,
  ) =>
    Object.fromEntries(
      Object.entries(record).filter(([id]) => {
        const item = here.get(id);
        return item !== undefined && keep(item);
      }),
    );
  const fields = only(
    kept.fields,
    (item) => item.kind === "number" || item.kind === "note",
  );
  const minus = only(
    kept.minus,
    (item) => item.id in fields && needsMinus(item),
  );
  const given = list.asksQuantities
    ? only(kept.given, (item) => item.kind === "check")
    : {};
  const comment =
    kept.comment && here.has(kept.comment.item) ? kept.comment : null;
  const any =
    Object.keys(fields).length > 0 ||
    Object.keys(given).length > 0 ||
    comment !== null;
  return any ? { fields, minus, given, comment, fixing } : null;
}
