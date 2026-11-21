import type {
  OrdersActionResult,
  WholeRefusal,
  WholeWrite,
} from "./orders-types";

/*
 * The writes of an order whole on their way (waiter mode P5): a close, a
 * move, the "ביטול" of either and a reopen, whichever screen of the mode sent
 * them (the order's, the till's, the toast's over another screen). Pure, so
 * the mode's provider and its tests follow one rule: a send never races one
 * of them, none of them races a round on its way, and none races another of
 * the same order.
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

/**
 * Why a write of the order whole can't go now, or null when it can: a round
 * of a draft it names on its way ("sending"), or another write of the same
 * order, or of a draft it names, not answered yet (`flying`, "writing"). An
 * undo pressed then is of what that write is changing: gone after it, it
 * would undo it in part (the move's "ביטול" behind a move on, the draft left
 * at a free place), or be refused and its words take that write's own
 * "ביטול" away.
 */
export function wholeRefusal(
  write: WholeWrite,
  flying: readonly WholeWrite[],
  onItsWay: (draft: string) => number,
): WholeRefusal | null {
  if (wholeWaits(write, onItsWay)) return "sending";
  const clashes = flying.some(
    (other) =>
      other.order === write.order ||
      other.drafts.some((draft) => write.drafts.includes(draft)),
  );
  return clashes ? "writing" : null;
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
 * held by tests (the provider gives `run` to every screen as `whole`). None
 * goes while `refusal` names a reason (read at the call, as the outbox has it
 * then): it answers that, and nothing was written. Each is on its way from
 * its call until it answers or fails, and once written, until a read the
 * mode made after the answer has landed (`read`): until then the screens
 * still show the order as it was, open at its old place, and would offer
 * what it no longer takes. `show` hears the list each time it changes. Only
 * a write not answered yet keeps another of its order from going: the
 * "ביטול" offered as one answers goes at once.
 */
export function wholeWrites(
  onItsWay: (draft: string) => number,
  show: (going: readonly WholeWrite[]) => void,
  read: () => Promise<void> = () => Promise.resolve(),
) {
  let going: readonly WholeWrite[] = [];
  let flying: readonly WholeWrite[] = [];
  const put = (next: readonly WholeWrite[]) => {
    going = next;
    show(next);
  };
  const refusal = (on: WholeWrite) => wholeRefusal(on, flying, onItsWay);
  return {
    /** What is on its way now, or written and not read again yet. */
    going: (): readonly WholeWrite[] => going,
    /**
     * Why `on` can't go now, decided at once: a way back pressed is offered
     * again, or says why, before the toast lets go of the news behind it.
     */
    refusal,
    async run(
      on: WholeWrite,
      write: () => Promise<OrdersActionResult>,
    ): Promise<OrdersActionResult> {
      const refused = refusal(on);
      if (refused !== null) return { ok: false, failure: refused };
      // Its own entry: another write alike leaves on its own answer.
      const entry: WholeWrite = { order: on.order, drafts: [...on.drafts] };
      flying = [...flying, entry];
      put([...going, entry]);
      const leave = () => put(wholeGone(going, entry));
      let result: OrdersActionResult;
      try {
        result = await write();
      } catch (error) {
        flying = wholeGone(flying, entry);
        leave();
        void read();
        throw error;
      }
      flying = wholeGone(flying, entry);
      if (result.ok) {
        // Written: on its way for the screens until they read it so.
        void read().then(leave, leave);
      } else {
        leave();
        void read();
      }
      return result;
    },
  };
}
