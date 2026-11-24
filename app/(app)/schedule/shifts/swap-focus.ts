import type { SwapIntent } from "./actions";

/**
 * What a swap step that went through says, in its screen's toast: the same
 * words the card then shows, so a screen reader hears what came of it
 * wherever the focus is, said once the focus has come back (ShiftSheet's
 * `onSwapped`, SwapButton's `onDone` on a card), after what the focus
 * reads. Keys of the `app` messages. Taking an offer on
 * "המשמרות שלי" is said by the offer's own words, which hold the focus then
 * (`offerTarget`): a toast there would say them again.
 */
export const SWAP_DONE = {
  give: "shifts.swap.open",
  take: "shifts.swap.offers.takenByYou",
  cancel: "shifts.swap.cancelled",
} as const satisfies Record<SwapIntent, string>;

/** An attribute's value in a selector, a quote or a backslash kept inside. */
const quoted = (id: string) => `"${id.replace(/["\\]/g, "\\$&")}"`;

/**
 * A shift's own place on its screen (`data-shift-target`): the button that
 * opens its sheet. The screen, read again after a step, keeps it where the
 * step's own button went, so the focus comes back there.
 */
export const shiftTarget = (id: string) => `[data-shift-target=${quoted(id)}]`;

/**
 * An offer's own words on "המשמרות שלי" (`data-offer-target`, its request's
 * id): once it is taken its button goes, and the focus comes back here, to
 * the words that say so. By the request, not the shift: two colleagues on
 * one shift can each give theirs away.
 */
export const offerTarget = (id: string) => `[data-offer-target=${quoted(id)}]`;
