import {
  type DraftLine,
  draftKey,
  putRefusedBack,
  withoutSent,
} from "@domain/order-screens";
import type { SendBody } from "@domain/orders-sync";

/*
 * What the mode keeps in the tab for its sends (waiter mode P4): the drafts
 * by where they wait, and the rounds on their way, each by its own key. Pure,
 * so the provider's state and sessionStorage follow one set of rules, which
 * the tests hold: two sends of one draft never share a place, a round
 * settles only itself, and a line on its way never comes back into a draft.
 */

/** A round on its way: the draft it left, what goes, and its lines as drafted. */
export type PendingRound = {
  draft: string;
  body: SendBody;
  lines: DraftLine[];
};

export type SendStore = {
  drafts: Record<string, DraftLine[]>;
  /** The rounds on their way, by each round's own key (`body.key`). */
  pending: Record<string, PendingRound>;
};

export const emptySendStore: SendStore = { drafts: {}, pending: {} };

const NEW_TAKEAWAY = draftKey({ takeaway: null });

/** A round goes: only its lines leave the draft, and it waits by its key. */
export function storeSent(store: SendStore, round: PendingRound): SendStore {
  return {
    drafts: {
      ...store.drafts,
      [round.draft]: withoutSent(store.drafts[round.draft] ?? [], round.lines),
    },
    pending: { ...store.pending, [round.body.key]: round },
  };
}

/**
 * A round's answer came: it alone leaves the rounds on their way, and when
 * refused its lines go back to the front of their draft. A new takeaway's
 * first round, sent, gives it its order: what was added to the new
 * takeaway's draft while the round was on its way is that order's now, as
 * the screen showed it, below the round. A round no longer on its way (the
 * tab's store was read again for another person or business) changes
 * nothing.
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
      pending,
      drafts: {
        ...store.drafts,
        [NEW_TAKEAWAY]: [],
        [order]: [...(store.drafts[order] ?? []), ...added],
      },
    };
  }
  return {
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

/** A draft's rounds on their way, in the order they went. */
export function pendingOfDraft(
  pending: SendStore["pending"],
  draft: string,
): PendingRound[] {
  return Object.values(pending).filter((round) => round.draft === draft);
}

/** A round as the tab kept it, or null for anything else. */
function roundOf(key: string, entry: unknown): PendingRound | null {
  if (!entry || typeof entry !== "object") return null;
  const { draft, body, lines } = entry as Partial<PendingRound>;
  if (typeof draft !== "string" || !Array.isArray(lines)) return null;
  if (!body || typeof body !== "object" || body.key !== key) return null;
  return { draft, body, lines };
}

/** What the tab kept, read back: what isn't a draft or a round is dropped. */
export function storedFrom(parsed: unknown): SendStore {
  if (!parsed || typeof parsed !== "object") return emptySendStore;
  const { drafts, pending } = parsed as Partial<
    Record<keyof SendStore, unknown>
  >;
  const rounds: Record<string, PendingRound> = {};
  if (pending && typeof pending === "object") {
    for (const [key, entry] of Object.entries(pending)) {
      const round = roundOf(key, entry);
      if (round) rounds[key] = round;
    }
  }
  return {
    drafts:
      drafts && typeof drafts === "object"
        ? (drafts as Record<string, DraftLine[]>)
        : {},
    pending: rounds,
  };
}

/** Whether there is nothing to keep: no line in any draft, no round on its way. */
export function storeEmpty(store: SendStore): boolean {
  return (
    Object.values(store.drafts).every((lines) => lines.length === 0) &&
    Object.keys(store.pending).length === 0
  );
}
