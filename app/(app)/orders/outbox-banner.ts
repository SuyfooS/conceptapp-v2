import type { OutboxWhere } from "@domain/orders-outbox";
import type { OwnerState } from "./outbox";

/*
 * What the banner above the app's other screens says (waiter mode P7),
 * from what the outbox holds for the person here. Pure, for the tests: a
 * round that waits goes by itself once there is a connection, but one that
 * was refused is back in its draft and goes only when someone sends it
 * again, so the banner never says of a refused one that it will go.
 */

/** What hasn't gone, by kind, and where. */
export type OutboxHeld = {
  /** Kept on the phone, waiting for a connection or tried again. */
  waiting: number;
  /** Past ten minutes, asking whether to send or remove. */
  asking: number;
  /** Refused, back in their draft, and no screen showed it yet. */
  refused: number;
  /** The drafts they belong to, oldest round first. */
  drafts: string[];
  /** Where each goes, rounds first, then refusals that know theirs. */
  wheres: OutboxWhere[];
};

const NOWHERE: OutboxWhere = { placeName: null, takeaway: null };

/** What the person here has that hasn't gone. */
export function outboxHeld(held: OwnerState): OutboxHeld {
  const rounds = Object.values(held.store.pending).filter(
    (round) =>
      held.asking.has(round.body.key) ||
      (held.kept.has(round.body.key) &&
        (!held.online || held.retrying.has(round.body.key))),
  );
  const refused = Object.entries(held.refusals).filter(
    ([, refusal]) => !refusal.seen,
  );
  const asking = rounds.filter((round) =>
    held.asking.has(round.body.key),
  ).length;
  return {
    waiting: rounds.length - asking,
    asking,
    refused: refused.length,
    drafts: [
      ...new Set([
        ...rounds.map((round) => round.draft),
        ...refused.map(([draft]) => draft),
      ]),
    ],
    wheres: [
      ...rounds.map((round) => round.where ?? NOWHERE),
      ...refused.flatMap(([, refusal]) =>
        refusal.where ? [refusal.where] : [],
      ),
    ],
  };
}

/** One sentence under the banner's title (`app.orders.outbox.banner.*`). */
export type BannerLine =
  /** All of them wait: they go by themselves. */
  | { key: "waits"; count: number }
  /** Some wait, beside refused ones: only those go by themselves. */
  | { key: "waitsSome"; count: number }
  /** One asks: open it and choose. */
  | { key: "asks" }
  /** All of them were refused: open and send again. */
  | { key: "refused" }
  /** Some were refused, beside others: those are back in their draft. */
  | { key: "refusedSome"; count: number };

/** The banner's sentences, in order: what waits or asks, then what was refused. */
export function bannerLines({
  waiting,
  asking,
  refused,
}: Pick<OutboxHeld, "waiting" | "asking" | "refused">): BannerLine[] {
  const rest: BannerLine[] =
    refused > 0 ? [{ key: "refusedSome", count: refused }] : [];
  if (asking > 0) return [{ key: "asks" }, ...rest];
  if (waiting > 0) {
    return refused > 0
      ? [{ key: "waitsSome", count: waiting }, ...rest]
      : [{ key: "waits", count: waiting }];
  }
  return refused > 0 ? [{ key: "refused" }] : [];
}
