import {
  type DraftLine,
  draftKey,
  putRefusedBack,
  withoutSent,
} from "@domain/order-screens";
import type { OutboxWhere } from "@domain/orders-outbox";
import type { SendBody } from "@domain/orders-sync";

/*
 * What the mode keeps for its sends (waiter mode P4): the drafts by where
 * they wait, and the rounds on their way, each by its own key. Pure, so the
 * outbox (outbox.ts, P7) and the twins follow one set of rules, which the
 * tests hold: two sends of one draft never share a place, a round settles
 * only itself, and a line on its way never comes back into a draft.
 */

/** A round on its way: the draft it left, what goes, and its lines as drafted. */
export type PendingRound = {
  draft: string;
  body: SendBody;
  lines: DraftLine[];
  /** Where it goes, to name it on any screen (P7). */
  where?: OutboxWhere;
  /** When it went first, by the phone's clock (P7). */
  queuedAt?: number;
  /** From when its ten minutes count before it asks (P7). */
  askFrom?: number;
};

/** A line a place's draft held of its own as an order moved there, and how many. */
export type OwnLine = { id: string; quantity: number };

export type SendStore = {
  drafts: Record<string, DraftLine[]>;
  /** The rounds on their way, by each round's own key (`body.key`). */
  pending: Record<string, PendingRound>;
  /**
   * What a place's draft held of its own as an order moved there (P5), by
   * that draft, until the move's "ביטול" or the order moves on: it stays
   * there on the "ביטול". Kept in memory only, as the "ביטול" is: never on
   * the phone's store.
   */
  own?: Record<string, OwnLine[]>;
};

export const emptySendStore: SendStore = { drafts: {}, pending: {} };

const NEW_TAKEAWAY = draftKey({ takeaway: null });

/**
 * A round goes: only its lines leave the draft, and it waits by its key. A
 * place's own line that goes in it goes as the order's now there, and is the
 * order's from then on (back from a refusal too).
 */
export function storeSent(store: SendStore, round: PendingRound): SendStore {
  const own = store.own?.[round.draft];
  const sent = new Set(round.lines.map((line) => line.id));
  return {
    ...store,
    drafts: {
      ...store.drafts,
      [round.draft]: withoutSent(store.drafts[round.draft] ?? [], round.lines),
    },
    pending: { ...store.pending, [round.body.key]: round },
    ...(own?.some((line) => sent.has(line.id))
      ? {
          own: {
            ...store.own,
            [round.draft]: own.filter((line) => !sent.has(line.id)),
          },
        }
      : {}),
  };
}

/**
 * A round's answer came: it alone leaves the rounds on their way, and when
 * refused its lines go back to the front of their draft. A new takeaway's
 * first round, sent, gives it its order: what was added to the new
 * takeaway's draft while the round was on its way is that order's now, as
 * the screen showed it, below the round. A round no longer on its way
 * (settled already, in another tab) changes nothing.
 */
export function storeSettled(
  store: SendStore,
  round: PendingRound,
  answer: { sent: true; order: string } | { sent: false },
): SendStore {
  if (!store.pending[round.body.key]) return store;
  const { [round.body.key]: _, ...pending } = store.pending;
  if (answer.sent) {
    const added = store.drafts[NEW_TAKEAWAY] ?? [];
    if (round.draft !== NEW_TAKEAWAY || added.length === 0) {
      return { ...store, pending };
    }
    const order = draftKey({ takeaway: answer.order });
    return {
      ...store,
      pending,
      drafts: {
        ...store.drafts,
        [NEW_TAKEAWAY]: [],
        [order]: [...(store.drafts[order] ?? []), ...added],
      },
    };
  }
  return {
    ...store,
    pending,
    drafts: {
      ...store.drafts,
      [round.draft]: putRefusedBack(
        store.drafts[round.draft] ?? [],
        round.lines,
      ),
    },
  };
}

/**
 * A draft changed from what it holds now, never from a copy taken earlier
 * (an undo kept for 8 seconds, a tap while the screen draws): what was added
 * or sent meanwhile stays as it is. A line on its way in a round never comes
 * back into a draft, so nothing is sent twice.
 */
export function storeDraftChanged(
  store: SendStore,
  draft: string,
  change: (lines: DraftLine[]) => DraftLine[],
): SendStore {
  const sent = Object.values(store.pending).flatMap((round) => round.lines);
  return {
    ...store,
    drafts: {
      ...store.drafts,
      [draft]: withoutSent(change(store.drafts[draft] ?? []), sent),
    },
  };
}

/** A draft's lines joined by others, after what it holds, each line once. */
function joined(there: readonly DraftLine[], coming: readonly DraftLine[]) {
  const known = new Set(there.map((line) => line.id));
  return [...there, ...coming.filter((line) => !known.has(line.id))];
}

/**
 * An order moved (P5): the draft waiting at its old place goes with it,
 * after what the new place's draft holds, each line once. What the new
 * place held is its own (`own`), to stay there on the move's "ביטול"
 * (`storeMovedBack`); the old place has none now. From what both hold now;
 * `drafts` stays the same object when no line moved.
 */
export function storeDraftMoved(
  store: SendStore,
  from: string,
  to: string,
): SendStore {
  if (from === to) return store;
  const there = store.drafts[to] ?? [];
  const { [from]: _, ...others } = store.own ?? {};
  const own = {
    ...others,
    [to]: there.map(({ id, quantity }) => ({ id, quantity })),
  };
  const held = store.drafts[from] ?? [];
  if (held.length === 0) return { ...store, own };
  return {
    ...store,
    own,
    drafts: { ...store.drafts, [from]: [], [to]: joined(there, held) },
  };
}

/**
 * The move's "ביטול" (P5), from the place the order moved to (`from`) back
 * to `to`: everything that place's draft holds but its own (`own`) goes back
 * with it, all the order's: the lines that went, those added there
 * meanwhile, more of one of its own lines than it held (a tap there adds to
 * its own plain line of the item), as a line of its own (`newId`), and what
 * went out in one of the order's rounds and came back refused. With nothing
 * known of what the place held (no move there in this tab's memory),
 * nothing moves. `drafts` stays the same object when no line moved.
 */
export function storeMovedBack(
  store: SendStore,
  from: string,
  to: string,
  newId: () => string,
): SendStore {
  const own = store.own?.[from];
  if (own === undefined || from === to) return store;
  const { [from]: _, ...others } = store.own ?? {};
  const held = new Map(own.map((line) => [line.id, line.quantity]));
  const staying: DraftLine[] = [];
  const going: DraftLine[] = [];
  for (const line of store.drafts[from] ?? []) {
    const was = held.get(line.id);
    if (was === undefined) going.push(line);
    else if (line.quantity > was) {
      staying.push({ ...line, quantity: was });
      going.push({ ...line, id: newId(), quantity: line.quantity - was });
    } else staying.push(line);
  }
  if (going.length === 0) return { ...store, own: others };
  return {
    ...store,
    own: others,
    drafts: {
      ...store.drafts,
      [from]: staying,
      [to]: joined(store.drafts[to] ?? [], going),
    },
  };
}

/**
 * Why a draft's last send was refused goes with its lines when its order
 * moves, or moves back (P5), to say why where they now wait, never at a
 * place the order left; unless the draft they join has a refusal of its
 * own, or the refusal is `own`: the one the place held of its own as the
 * order came, about its own lines, which stay. Only when lines moved.
 */
export function refusalMoved<R>(
  refusals: Record<string, R>,
  from: string,
  to: string,
  own: R | null = null,
): Record<string, R> {
  const refusal = refusals[from];
  if (
    refusal === undefined ||
    refusal === own ||
    from === to ||
    to in refusals
  ) {
    return refusals;
  }
  const { [from]: _, ...rest } = refusals;
  return { ...rest, [to]: refusal };
}

/**
 * Whether a draft's send waits for its own round still on its way: a new
 * takeaway's first round gives it its order, and a send before that lands
 * would open a second takeaway (a place's or an order's joins its order).
 * What is added meanwhile stays in the draft, and is that order's once the
 * round lands (`storeSettled`), whichever send it was: the screen's own, or
 * the outbox's again, as the app opened or came back online.
 */
export function sendWaits(draft: string, onItsWay: number): boolean {
  return draft === NEW_TAKEAWAY && onItsWay > 0;
}

/** A draft's rounds on their way, in the order they went. */
export function pendingOfDraft(
  pending: SendStore["pending"],
  draft: string,
): PendingRound[] {
  return Object.values(pending).filter((round) => round.draft === draft);
}
