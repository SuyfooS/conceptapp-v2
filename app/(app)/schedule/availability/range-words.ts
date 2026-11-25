/**
 * Hours inside words that are plain text, not drawn as markup: the name and
 * tooltip of a range's "×", an UndoRow's message, the list of a day's
 * shifts. Held left to right in Unicode isolates (LRI … PDI), as `<ltr>`
 * holds them on screen. Left alone in a right-to-left line, the dash
 * between two times takes the line's direction, and a tooltip draws
 * "09:00–17:00" as "17:00–09:00".
 */
export const isolate = (chunks: string) => `⁦${chunks}⁩`;

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
