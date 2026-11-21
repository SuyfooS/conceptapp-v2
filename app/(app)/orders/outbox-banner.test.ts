import { describe, expect, it } from "vitest";
import { EMPTY_OWNER, type KeptSendRefusal, type OwnerState } from "./outbox";
import { bannerLines, outboxHeld } from "./outbox-banner";
import type { PendingRound } from "./send-store";

/*
 * What the banner above the app's other screens says (waiter mode P7): a
 * round that waits goes by itself once there is a connection; one refused
 * is back in its draft and goes only when it is sent again, so the banner
 * never says of it that it will go, even beside one that waits.
 */

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const YOAV = "00000000-0000-4000-8000-000000000002";
const ITEM = "00000000-0000-4000-8000-000000000003";
const PLACE = "00000000-0000-4000-8000-000000000004";

let n = 0;
function round(draft: string, placeName: string): PendingRound {
  n += 1;
  return {
    draft,
    body: {
      business: BUSINESS,
      user: YOAV,
      key: `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`,
      target: { place: PLACE },
      lines: [{ item: ITEM, quantity: 1 }],
    },
    lines: [],
    where: { placeName, takeaway: null },
  };
}

const refusal = (placeName: string, seen = false): KeptSendRefusal => ({
  ok: false,
  failure: "choices",
  items: [ITEM],
  order: null,
  target: { place: PLACE },
  where: { placeName, takeaway: null },
  seen,
});

/** Offline, with these rounds kept and these refusals on their drafts. */
function holding(
  rounds: PendingRound[],
  refusals: Record<string, KeptSendRefusal> = {},
  asking: string[] = [],
): OwnerState {
  return {
    ...EMPTY_OWNER,
    loaded: true,
    online: false,
    store: {
      drafts: {},
      pending: Object.fromEntries(rounds.map((r) => [r.body.key, r])),
    },
    refusals,
    kept: new Set(rounds.map((r) => r.body.key)),
    asking: new Set(asking),
  };
}

describe("what the banner outside the mode says", () => {
  it("says of a refused round beside a waiting one that it is back in its draft, never that it goes", () => {
    // Table 4 waits; table 5 was refused, its lines back in its draft.
    const held = outboxHeld(
      holding([round("place:4", "4")], { "place:5": refusal("5") }),
    );
    expect(held).toMatchObject({ waiting: 1, asking: 0, refused: 1 });
    expect(held.drafts).toEqual(["place:4", "place:5"]);
    expect(held.wheres.map((where) => where.placeName)).toEqual(["4", "5"]);
    const lines = bannerLines(held);
    expect(lines).toEqual([
      { key: "waitsSome", count: 1 },
      { key: "refusedSome", count: 1 },
    ]);
    // "They go once there's a connection" is said of the waiting ones only.
    expect(lines).not.toContainEqual(expect.objectContaining({ key: "waits" }));
  });

  it("says they go by themselves when all of them wait", () => {
    const held = outboxHeld(
      holding([round("place:4", "4"), round("place:6", "6")]),
    );
    expect(bannerLines(held)).toEqual([{ key: "waits", count: 2 }]);
  });

  it("says to open and send again when all of them were refused", () => {
    const held = outboxHeld(holding([], { "place:5": refusal("5") }));
    expect(bannerLines(held)).toEqual([{ key: "refused" }]);
  });

  it("says to choose when one asks, and what was refused after it", () => {
    const asks = round("place:4", "4");
    const held = outboxHeld(
      holding([asks, round("place:6", "6")], { "place:5": refusal("5") }, [
        asks.body.key,
      ]),
    );
    expect(held).toMatchObject({ waiting: 1, asking: 1, refused: 1 });
    expect(bannerLines(held)).toEqual([
      { key: "asks" },
      { key: "refusedSome", count: 1 },
    ]);
  });

  it("leaves out a refusal its screen showed, and a round still being sent", () => {
    const sending = round("place:6", "6");
    const state = holding([round("place:4", "4")], {
      "place:5": refusal("5", true),
    });
    const held = outboxHeld({
      ...state,
      // Online, nothing failed yet: on its way, not waiting.
      online: true,
      retrying: new Set(Object.keys(state.store.pending)),
      store: {
        ...state.store,
        pending: { ...state.store.pending, [sending.body.key]: sending },
      },
    });
    expect(held).toMatchObject({ waiting: 1, asking: 0, refused: 0 });
    expect(bannerLines(held)).toEqual([{ key: "waits", count: 1 }]);
    expect(bannerLines({ waiting: 0, asking: 0, refused: 0 })).toEqual([]);
  });
});
