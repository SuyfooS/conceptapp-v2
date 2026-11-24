/**
 * Where a manager goes on once a request they decided left the list with
 * the focus: the requests after it first, nearest first, then those before
 * it, nearest first. `ids` are the requests waiting as the list was drawn,
 * the decided one among them; one not there leaves them in order.
 */
export function nextInLine(ids: readonly string[], id: string): string[] {
  const at = ids.indexOf(id);
  if (at < 0) return [...ids];
  return [...ids.slice(at + 1), ...ids.slice(0, at).reverse()];
}

/** A request's decision buttons (`data-decide`), its first one first. */
export const decideTarget = (id: string) =>
  `[data-decide="${id.replace(/["\\]/g, "\\$&")}"]`;

/** The newest line saying what was decided (`data-settled`), drawn first. */
export const SETTLED_LINE = "[data-settled]";
/** The card saying nothing waits any more. */
export const NOTHING_WAITING = "[data-swaps-empty]";
/** The list's own title, while requests wait. */
export const WAITING_TITLE = "[data-swaps-title]";

/**
 * Where the focus goes once a decided request went with it, in order: the
 * next request's first decision button, the card saying nothing waits, the
 * newest line saying what was decided, the list's title; the page's title
 * after them (`useFocusWhenGone`). The card before the line: the line is in
 * the live region that is saying it, and the focus there would say it again.
 */
export const afterDecision = (ids: readonly string[], id: string) => [
  ...nextInLine(ids, id).map(decideTarget),
  NOTHING_WAITING,
  SETTLED_LINE,
  WAITING_TITLE,
];
