import { isolate } from "@domain/bidi";

/**
 * A range's hours for a sentence that holds them as
 * `<ltr>{from}–{to}</ltr>` and is read as plain text with `t.markup`: the
 * "×" that removes them (`removeRange`), and the line that says they were
 * removed (`sheet.removed`).
 */
export const rangeWords = (range: { start: string; end: string }) => ({
  from: range.start,
  to: range.end,
  ltr: isolate,
});
