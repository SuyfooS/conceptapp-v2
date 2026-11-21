import type { OrdersActionResult, WholeWrite } from "./orders-types";

/*
 * The writes of an order whole on their way (waiter mode P5): a close, a
 * move, the "ביטול" of either and a reopen, whichever screen of the mode sent
 * them (the order's, the till's, the toast's over another screen). Pure, so
 * the mode's provider and its tests follow one rule: a send never races one
 * of them, and none of them races a round on its way.
 */

/**
 * Whether a write of the order whole is on its way for `order`, or touching
 * `draft` (a place's with no open order on screen: the close's "ביטול" opens
 * one there, the move's brings one back): the send waits, and so does what
 * fixes, serves or fires what was sent.
 */
export function wholeOnWayFor(
  going: readonly WholeWrite[],
  order: string | null,
  draft: string,
): boolean {
  return going.some(
    (write) =>
      (order !== null && write.order === order) || write.drafts.includes(draft),
  );
}

/**
 * Whether a write of the order whole waits for a round of a draft it names,
 * on its way (`onItsWay`, the draft's rounds not answered yet): a close would
 * serve it before the kitchen saw it, and a move or the move's "ביטול" would
 * leave it refused at the place the order left, its lines in that draft.
 */
export function wholeWaits(
  write: WholeWrite,
  onItsWay: (draft: string) => number,
): boolean {
  return write.drafts.some((draft) => onItsWay(draft) > 0);
}

/** A write answered: it alone leaves those on their way, another alike stays. */
export function wholeGone(
  going: readonly WholeWrite[],
  write: WholeWrite,
): readonly WholeWrite[] {
  const at = going.indexOf(write);
  return at < 0 ? going : [...going.slice(0, at), ...going.slice(at + 1)];
}

/**
 * The mode's writes of an order whole, apart from React so their rules are
 * held by tests (the provider gives `run` to every screen as `whole`). Each
 * is on its way from its call until it answers or fails, and `show` hears
 * the list each time it changes. None goes while a round of a draft it names
 * is on its way (`onItsWay`, read at the call, as the tab has it then): it
 * answers "sending", and nothing was written.
 */
export function wholeWrites(
  onItsWay: (draft: string) => number,
  show: (going: readonly WholeWrite[]) => void,
) {
  let going: readonly WholeWrite[] = [];
  const put = (next: readonly WholeWrite[]) => {
    going = next;
    show(next);
  };
  return {
    /** What is on its way now. */
    going: (): readonly WholeWrite[] => going,
    async run(
      on: WholeWrite,
      write: () => Promise<OrdersActionResult>,
    ): Promise<OrdersActionResult> {
      if (wholeWaits(on, onItsWay)) return { ok: false, failure: "sending" };
      // Its own entry: another write alike leaves on its own answer.
      const entry: WholeWrite = { order: on.order, drafts: [...on.drafts] };
      put([...going, entry]);
      try {
        return await write();
      } finally {
        put(wholeGone(going, entry));
      }
    },
  };
}
