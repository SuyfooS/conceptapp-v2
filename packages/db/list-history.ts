import {
  ITEM_FIELDS,
  type ItemField,
  type ListItemChange,
  type ListReopen,
} from "@domain/lists";
import { z } from "zod";

/*
 * Each list item's history as `getList` (@db/lists) reads it, under RLS
 * (20261116000200_list_history.sql): `public.list_item_changes` and
 * `public.list_reopens`, checked row by row, so one row the app can't read
 * leaves the rest of the history as it is.
 */

/** What `getList` selects of each, in the order it reads them. */
export const CHANGE_COLUMNS =
  "id, item_id, changed_by, changed_at, changed, checked, given, reading, answer, comment, photo, done";
export const REOPEN_COLUMNS =
  "id, reopened_by, reopened_at, was, was_by, was_at";

const isField = (field: string): field is ItemField =>
  (ITEM_FIELDS as readonly string[]).includes(field);

const changeRow = z.object({
  // An identity, which arrives as a number.
  id: z.union([z.number(), z.string()]).transform(String),
  item_id: z.string(),
  changed_by: z.string().nullable(),
  changed_at: z.string(),
  // A field a later migration names is left out, not the row.
  changed: z.array(z.string()).transform((fields) => fields.filter(isField)),
  checked: z.boolean().nullable(),
  given: z.number().nullable(),
  reading: z.number().nullable(),
  answer: z.string().nullable(),
  comment: z.string().nullable(),
  photo: z.boolean(),
  done: z.boolean(),
});

const reopenRow = z.object({
  id: z.string(),
  reopened_by: z.string().nullable(),
  reopened_at: z.string(),
  was: z.enum(["finished", "cancelled"]),
  was_by: z.string().nullable(),
  was_at: z.string(),
});

/** The rows that read, each as `make` makes it; the others said and left out. */
function rowsOf<S extends z.ZodType, T>(
  rows: readonly unknown[],
  schema: S,
  make: (row: z.output<S>) => T,
  what: string,
): T[] {
  return rows.flatMap((row) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) return [make(parsed.data)];
    console.error(`a list's ${what} row did not read`);
    return [];
  });
}

/** A list's item changes, in the order read (oldest first). */
export function changesOf(rows: readonly unknown[]): ListItemChange[] {
  return rowsOf(
    rows,
    changeRow,
    (row) => ({
      id: row.id,
      itemId: row.item_id,
      by: row.changed_by,
      at: row.changed_at,
      changed: row.changed,
      checked: row.checked === true,
      given: row.given,
      reading: row.reading,
      answer: row.answer,
      comment: row.comment,
      photo: row.photo,
      done: row.done,
    }),
    "change",
  );
}

/** A list's reopens, in the order read (oldest first). */
export function reopensOf(rows: readonly unknown[]): ListReopen[] {
  return rowsOf(
    rows,
    reopenRow,
    (row) => ({
      id: row.id,
      reopenedBy: row.reopened_by,
      reopenedAt: row.reopened_at,
      was: row.was,
      wasBy: row.was_by,
      wasAt: row.was_at,
    }),
    "reopen",
  );
}
