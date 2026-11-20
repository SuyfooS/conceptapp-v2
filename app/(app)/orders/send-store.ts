import {
  type DraftLine,
  putRefusedBack,
  withoutSent,
} from "@domain/order-screens";
import type { SendBody } from "@domain/orders-sync";

/*
 * What the mode keeps in the tab for its sends (waiter mode P4): the drafts
 * by where they wait, and the rounds on their way, each by its own key. Pure,
 * so the provider's state and sessionStorage follow one set of rules, which
 * the tests hold: two sends of one draft never share a place, and a round
 * settles only itself.
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
 * refused its lines go back to the front of their draft.
 */
export function storeSettled(
  store: SendStore,
  round: PendingRound,
  sent: boolean,
): SendStore {
  const { [round.body.key]: _, ...pending } = store.pending;
  if (sent) return { ...store, pending };
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
