import type { SwapIntent } from "./actions";

/**
 * What a swap step that went through says, in its screen's toast: the same
 * words the card then shows, so a screen reader hears what came of it
 * wherever the focus is. Keys of the `app` messages.
 */
export const SWAP_DONE = {
  give: "shifts.swap.open",
  take: "shifts.swap.offers.takenByYou",
  cancel: "shifts.swap.cancelled",
} as const satisfies Record<SwapIntent, string>;

/**
 * A shift's own place on its screen (`data-shift-target`): the button that
 * opens its sheet, or the line of an offer to take it. The screen, read
 * again after a step, keeps it where the step's own button went, so the
 * focus comes back there.
 */
export const shiftTarget = (id: string) =>
  `[data-shift-target="${id.replace(/["\\]/g, "\\$&")}"]`;
