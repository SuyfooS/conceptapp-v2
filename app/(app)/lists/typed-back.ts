import type { ListItem } from "@domain/lists";
import { z } from "zod";
import type { KeepForPage } from "@/app/stale-build";

/*
 * What was typed on a list and not saved when a change met a page from the
 * release before (closing the pilot, PR 1b): what of it the screen keeps
 * (`typedToKeep`), and what of it the list loaded again puts back
 * (`typedBack`), which the screen takes back with `takeKept`. This decides,
 * with no React, for the tests.
 */

/** An item whose range goes below zero needs a minus sign to be typed. */
export const needsMinus = (item: ListItem) =>
  item.kind === "number" &&
  ((item.min !== null && item.min < 0) || (item.max !== null && item.max < 0));

/** A number as it is typed back into its field. */
export const typed = (reading: number | null, minus: boolean) =>
  reading === null ? "" : String(minus ? Math.abs(reading) : reading);

/** An order's count as its stepper shows it. */
export const countText = (count: number | null) =>
  count === null ? "" : String(count);

/** What an item's result changes, as the list's screen keeps it. */
export type ItemChange = Partial<
  Pick<ListItem, "checked" | "given" | "reading" | "answer" | "comment">
>;

/**
 * Where the change was made, for the list loaded again to give its focus
 * back to: the item, and its tick, its count or its field (a number's, its
 * minus's too, or a note's). None for a comment, whose sheet opens again
 * and takes the focus.
 */
const TypedAt = z.object({
  item: z.string(),
  part: z.enum(["check", "count", "field"]),
});

/**
 * What was typed and not saved, kept for the page loaded again, by item:
 * each number's or note's field as typed, a number's minus with it, an
 * order's count, a comment being saved or written, whether the list was
 * being fixed (L6b-1) as the change was made, and where it was made (`at`).
 */
export const KeptTyped = z.object({
  fields: z.record(z.string(), z.string()),
  minus: z.record(z.string(), z.boolean()),
  given: z.record(z.string(), z.string()),
  comment: z.object({ item: z.string(), text: z.string() }).nullable(),
  fix: z.boolean(),
  at: TypedAt.nullable(),
});

export type KeptTyped = z.infer<typeof KeptTyped>;

/** What the list's screen holds typed now, for `typedToKeep`. */
export type TypedNow = {
  /** Each number's or note's field, as typed. */
  drafts: Record<string, string>;
  /** Each number's minus, on or off. */
  minus: Record<string, boolean>;
  /** Each order's count, as typed. */
  given: Record<string, string>;
  /** The comment's sheet: whose it is, and what is written in it. */
  comment: { item: string | null; text: string };
};

/**
 * What was typed on the list and isn't saved, for the page loaded again
 * as `change` to `saving` meets the release before: each field and count
 * typed (`now`) that differs from its item as saved here (`items`, with
 * `saving` as it was before this change), its minus with a number that
 * needs one, the comment being saved or written, whether it was a fix
 * (`fix`), so the list loaded is fixed again, and where the change was
 * made. A ticked item's own count goes with the tick, which is pressed
 * again. Nothing, for the press's own words, when nothing typed would be
 * lost: a tick, its count with it, or a minus is pressed again. Such a
 * press with other typing kept says both: the press wasn't recorded, and
 * what was typed is back ("pressTyped").
 */
export function typedToKeep(
  items: readonly ListItem[],
  now: TypedNow,
  saving: ListItem,
  change: ItemChange,
  { fix, asksQuantities }: { fix: boolean; asksQuantities: boolean },
): KeepForPage | undefined {
  const kept: KeptTyped = {
    fields: {},
    minus: {},
    given: {},
    comment: null,
    fix,
    at:
      "comment" in change
        ? null
        : {
            item: saving.id,
            part:
              "checked" in change
                ? "check"
                : "given" in change
                  ? "count"
                  : "field",
          },
  };
  for (const shown of items) {
    const item = shown.id === saving.id ? saving : shown;
    const draft = now.drafts[item.id];
    if (item.kind === "number" && draft !== undefined) {
      const sign = now.minus[item.id] ?? false;
      if (draft !== typed(item.reading, sign)) {
        kept.fields[item.id] = draft;
        if (needsMinus(item)) kept.minus[item.id] = sign;
      }
    }
    if (
      item.kind === "note" &&
      draft !== undefined &&
      draft !== (item.answer ?? "")
    ) {
      kept.fields[item.id] = draft;
    }
    const count = now.given[item.id];
    const ticked = item.id === saving.id && "checked" in change;
    if (
      item.kind === "check" &&
      asksQuantities &&
      !ticked &&
      count !== undefined &&
      count !== countText(item.given)
    ) {
      kept.given[item.id] = count;
    }
  }
  const writing = now.comment;
  if ("comment" in change && change.comment) {
    kept.comment = { item: saving.id, text: change.comment };
  } else if (writing.item !== null && writing.text.trim() !== "") {
    kept.comment = { item: writing.item, text: writing.text };
  }
  const any =
    Object.keys(kept.fields).length > 0 ||
    Object.keys(kept.given).length > 0 ||
    kept.comment !== null;
  if (!any) return undefined;
  // The change itself among what is kept (a field, a count, a comment), or
  // a press made again (a tick, a minus) beside what else was typed.
  const own =
    saving.id in kept.fields ||
    saving.id in kept.given ||
    kept.comment?.item === saving.id;
  return { of: "list", value: kept, words: own ? "typed" : "pressTyped" };
}

/** What goes back on the list loaded, and whether it opens being fixed. */
export type TypedBack = Omit<KeptTyped, "fix"> & { fixing: boolean };

/**
 * What of `kept` the list loaded again puts back, unsaved: only on a list
 * that takes it. Typed while it was fixed, a list the person may still fix
 * opens being fixed again, and it goes back there; else only on a list
 * still being filled (`can.fill`). A finished list nobody is fixing shows
 * its answers as saved, so nothing typed goes on it. Only its own items
 * take it, each as its kind does: a number's or note's field, a minus where
 * one is needed, an order's count, a comment; and the focus goes back to
 * where the change was made only on one of them. Null for nothing put
 * back, which the frame then doesn't say came back.
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
  const at = kept.at && here.has(kept.at.item) ? kept.at : null;
  const any =
    Object.keys(fields).length > 0 ||
    Object.keys(given).length > 0 ||
    comment !== null;
  return any ? { fields, minus, given, comment, fixing, at } : null;
}
