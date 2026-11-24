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

/**
 * A request's own heading (`data-request-target`): its day, on its card or
 * at the start of its row.
 */
export const requestTarget = (id: string) =>
  `[data-request-target="${id.replace(/["\\]/g, "\\$&")}"]`;

/** The card saying nothing waits any more. */
export const NOTHING_WAITING = "[data-swaps-empty]";
/** The list's own title, while requests wait. */
export const WAITING_TITLE = "[data-swaps-title]";

/**
 * Where the focus goes once a decided request went with it, in order: the
 * next request's own heading, the card saying nothing waits, the list's
 * title; the page's title after them (`useFocusWhenGone`). The heading and
 * not its "אישור": Enter held down on the decided one's would go on to
 * approve the next, and a decision can't be undone. Never the line saying
 * what was decided: the live region says it once the focus has landed,
 * and the focus on it would say it again.
 */
export const afterDecision = (ids: readonly string[], id: string) => [
  ...nextInLine(ids, id).map(requestTarget),
  NOTHING_WAITING,
  WAITING_TITLE,
];
