import { nextInLine } from "../../schedule/swaps/next-request";

/**
 * A waiting entry's own words (`data-confirm-target`): who it is, and what
 * waits ("כניסה בלי קוד ברביעי, 4.11, 09:14"), read together.
 */
export const entryTarget = (id: string) =>
  `[data-confirm-target="${id.replace(/["\\]/g, "\\$&")}"]`;

/** The card's own title, while entries wait. */
export const CONFIRM_TITLE = "[data-confirm-title]";

/**
 * Where the focus goes once an approved entry left the card with it, in
 * order: the next entry's words down, then the nearest one up
 * (`nextInLine`), then the card's title; the page's title after them
 * (`useFocusWhenGone`), once the last one took the card along. The words
 * and not the next "אישור": Enter held down on the one approved would go on
 * to approve the next, and an approval can't be taken back here. `ids` are
 * the entries waiting as the card was drawn, the approved one among them.
 */
export const afterApproval = (ids: readonly string[], id: string) => [
  ...nextInLine(ids, id).map(entryTarget),
  CONFIRM_TITLE,
];
