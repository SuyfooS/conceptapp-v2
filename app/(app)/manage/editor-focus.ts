import { arrived, type FocusCandidate } from "@ui/focus-after";

/**
 * Where the keyboard's focus goes in the editors of a list of things, a
 * sheet for each (the shifts, a list's items and its times) or a row typed
 * over (the positions), with no React (accessibility, part 8): onto the
 * removal's "ביטול" once the sheet closes for it, back on the row that
 * "ביטול" brings back, and back on a "ביטול" whose way back was refused.
 */

/** A CSS string's own characters, so any value reads as itself in a selector. */
const cssString = (text: string) =>
  text.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");

/** The elements whose attribute `name` is `value`, as a selector. */
export function byAttribute(name: string, value: string): string {
  return `[${name}="${cssString(value)}"]`;
}

/** What a group of rows answers: its rows, by a selector. */
type Rows = { querySelectorAll(selectors: string): ArrayLike<Element> };

/**
 * The row at `index` of a ListGroup whose rows are buttons (`ListRow` with
 * a press), in their order: the one "ביטול" put back there. Its "add" row
 * comes after them, and its words for none are no button.
 */
export function groupRow(
  group: Rows | null | undefined,
  index: number,
): Element | null {
  if (!group || index < 0) return null;
  return group.querySelectorAll(":scope > button")[index] ?? null;
}

/**
 * Where the focus goes once an editor's sheet has closed, in order: after a
 * removal from it, its "ביטול", which says what went (its row went with the
 * sheet, and was what opened it), else the section's title; otherwise what
 * opened it, else the section's title.
 */
export function sheetReturnTo({
  removed,
  undo,
  opener,
  heading,
}: {
  /** It closed for a removal from it. */
  removed: boolean;
  /** The removal's "ביטול". */
  undo: FocusCandidate;
  /** What had the focus as it opened. */
  opener: FocusCandidate;
  /** The title of the editor's section. */
  heading: FocusCandidate;
}): readonly FocusCandidate[] {
  return removed ? [undo, heading] : [opener, heading];
}

/**
 * Whether a way back's refusal has just arrived, for the effect that puts
 * the focus back on its "ביטול": the button waited, disabled, and the focus
 * went with it. Only once it no longer waits (`waiting`), and once for each
 * refusal, noted in `seen` only then (`arrived`): a screen shown again from
 * a hidden <Activity> runs its effects again with a refusal long seen. Each
 * refusal is a new object, so the same refusal twice arrives twice; null is
 * none.
 */
export function refusalArrived<T>(
  seen: { current: T | null },
  refusal: T | null,
  waiting: boolean,
): boolean {
  return !waiting && arrived(seen, refusal);
}
