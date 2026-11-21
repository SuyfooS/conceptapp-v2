import { type DraftLine, putDraftLineBack } from "@domain/order-screens";
import { describe, expect, it } from "vitest";
import {
  emptySendStore,
  type PendingRound,
  pendingOfDraft,
  refusalMoved,
  type SendStore,
  sendWaits,
  storeDraftChanged,
  storeDraftMoved,
  storeMovedBack,
  storeSent,
  storeSettled,
} from "./send-store";

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const PERSON = "00000000-0000-4000-8000-0000000000f1";
const PLACE = "00000000-0000-4000-8000-0000000000c1";
const HUMMUS = "00000000-0000-4000-8000-000000000011";
const ORDER = "00000000-0000-4000-8000-0000000000e1";
const DRAFT = `place:${PLACE}`;
const NEW_TAKEAWAY = "takeaway:new";

let next = 0;
const line = (extra: Partial<DraftLine> = {}): DraftLine => {
  next += 1;
  return {
    id: `line-${next}`,
    item: HUMMUS,
    quantity: 1,
    note: null,
    allergy: false,
    held: false,
    choices: [],
    ...extra,
  };
};

const round = (
  key: string,
  lines: DraftLine[],
  draft = DRAFT,
): PendingRound => ({
  draft,
  body: {
    business: BUSINESS,
    user: PERSON,
    key,
    target: draft === NEW_TAKEAWAY ? { takeaway: true } : { place: PLACE },
    lines: lines.map((l) => ({ item: l.item, quantity: l.quantity })),
  },
  lines,
});

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b1";

const sent = { sent: true as const, order: ORDER };
const refused = { sent: false as const };

/** What a reload reads back: the store copied, as the phone's store copies it. */
const reloaded = (store: SendStore): SendStore => structuredClone(store);

describe("the sends kept in the tab", () => {
  it("keeps two rounds of one draft apart, and settles each alone", () => {
    // Round A keeps failing on a weak network; the waiter leaves, comes
    // back, adds round B and sends it while A is still on its way.
    const a = round(A, [line()]);
    const b = round(B, [line(), line()]);
    let store = storeSent(
      { ...emptySendStore, drafts: { [DRAFT]: a.lines } },
      a,
    );
    store = storeSent({ ...store, drafts: { [DRAFT]: b.lines } }, b);
    expect(pendingOfDraft(store.pending, DRAFT)).toEqual([a, b]);
    // A reload while both wait resumes both.
    expect(pendingOfDraft(reloaded(store).pending, DRAFT)).toEqual([a, b]);

    // A lands: B is still on its way, on screen and in the tab.
    const landed = storeSettled(store, a, sent);
    expect(pendingOfDraft(landed.pending, DRAFT)).toEqual([b]);
    expect(pendingOfDraft(reloaded(landed).pending, DRAFT)).toEqual([b]);
    expect(landed.drafts[DRAFT]).toEqual([]);
  });

  it("puts a refused round's lines back, and leaves the other round on its way", () => {
    const a = round(A, [line()]);
    const b = round(B, [line()]);
    const store = storeSent(
      storeSent({ ...emptySendStore, drafts: { [DRAFT]: a.lines } }, a),
      b,
    );
    const meanwhile = line();
    const back = storeSettled(
      { ...store, drafts: { [DRAFT]: [meanwhile] } },
      a,
      refused,
    );
    expect(back.drafts[DRAFT]).toEqual([...a.lines, meanwhile]);
    expect(pendingOfDraft(back.pending, DRAFT)).toEqual([b]);
  });

  it("settles a round once: one no longer on its way changes nothing", () => {
    // The store was read again for another person or business, or the
    // answer came twice: nothing of it is put back a second time.
    const a = round(A, [line()]);
    const store = storeSent(
      { ...emptySendStore, drafts: { [DRAFT]: a.lines } },
      a,
    );
    const back = storeSettled(store, a, refused);
    expect(storeSettled(back, a, refused)).toBe(back);
    expect(storeSettled(emptySendStore, a, sent)).toBe(emptySendStore);
  });

  it("gives what was added to a new takeaway meanwhile to the order its first round opened", () => {
    // The first round of a new takeaway is on its way; the waiter adds two
    // more items, shown below it on the same screen.
    const first = round(A, [line()], NEW_TAKEAWAY);
    const added = [line(), line()];
    const store = storeSent(
      { ...emptySendStore, drafts: { [NEW_TAKEAWAY]: first.lines } },
      first,
    );
    const meanwhile = {
      ...store,
      drafts: { ...store.drafts, [NEW_TAKEAWAY]: added },
    };
    // It lands as takeaway 12: the two items are its draft, and no new
    // takeaway waits on the floor with them.
    const landed = storeSettled(meanwhile, first, sent);
    expect(landed.drafts[`takeaway:${ORDER}`]).toEqual(added);
    expect(landed.drafts[NEW_TAKEAWAY]).toEqual([]);
    expect(landed.pending).toEqual({});
    // Refused, they stay where they were, after the round's own lines.
    const back = storeSettled(meanwhile, first, refused);
    expect(back.drafts[NEW_TAKEAWAY]).toEqual([...first.lines, ...added]);
    expect(back.drafts[`takeaway:${ORDER}`]).toBeUndefined();
    // A place's round moves nothing of a new takeaway's draft.
    const atPlace = round(B, [line()]);
    const both = storeSent(meanwhile, atPlace);
    expect(storeSettled(both, atPlace, sent).drafts[NEW_TAKEAWAY]).toEqual(
      added,
    );
  });

  it("holds a new takeaway's send while its first round is on its way, whichever send it was", () => {
    // Its first round went offline; the mode was left or the tab read
    // again, so no send of the screen waits for it now. A second send would
    // open a second takeaway: the lines added meanwhile wait for the first.
    const first = round(A, [line()], NEW_TAKEAWAY);
    const store = reloaded(
      storeSent(
        { ...emptySendStore, drafts: { [NEW_TAKEAWAY]: first.lines } },
        first,
      ),
    );
    const onItsWay = pendingOfDraft(store.pending, NEW_TAKEAWAY).length;
    expect(sendWaits(NEW_TAKEAWAY, onItsWay)).toBe(true);
    // Landed or refused, nothing is on its way: the send goes.
    expect(sendWaits(NEW_TAKEAWAY, 0)).toBe(false);
    // A place's round, or an order's, joins its order: a second goes too.
    expect(sendWaits(DRAFT, 1)).toBe(false);
    expect(sendWaits(`takeaway:${ORDER}`, 1)).toBe(false);
  });

  it("takes only the lines a round sends out of the draft", () => {
    const draft = Array.from({ length: 45 }, () => line());
    const out = round(A, draft.slice(0, 40));
    const store = storeSent(
      { ...emptySendStore, drafts: { [DRAFT]: draft } },
      out,
    );
    expect(store.drafts[DRAFT]).toEqual(draft.slice(40));
  });

  it("keeps a round's place, and when it went and asks from, as they came (P7)", () => {
    const a = {
      ...round(A, [line()]),
      where: { placeName: "6", takeaway: null },
      queuedAt: 1000,
      askFrom: 2000,
    };
    expect(storeSent(emptySendStore, a).pending[A]).toEqual(a);
  });
});

describe("a draft changed from what it holds now", () => {
  it("undoes a removal over what was added since, never over an old copy", () => {
    // Salad is removed; Hummus is tapped; then "ביטול" of the removal.
    const salad = line();
    const hummus = line();
    let store: SendStore = { ...emptySendStore, drafts: { [DRAFT]: [salad] } };
    store = storeDraftChanged(store, DRAFT, () => []);
    store = storeDraftChanged(store, DRAFT, (lines) => [...lines, hummus]);
    store = storeDraftChanged(store, DRAFT, (lines) =>
      putDraftLineBack(lines, salad, 0),
    );
    expect(store.drafts[DRAFT]).toEqual([salad, hummus]);
  });

  it("never puts back a line that is on its way", () => {
    // Offline, draft [A, B]: B is removed, then A is sent, then "ביטול".
    const a = line();
    const b = line();
    let store: SendStore = { ...emptySendStore, drafts: { [DRAFT]: [a, b] } };
    store = storeDraftChanged(store, DRAFT, (lines) =>
      lines.filter((l) => l.id !== b.id),
    );
    store = storeSent(store, round(A, [a]));
    expect(store.drafts[DRAFT]).toEqual([]);
    // An undo kept from before the send would put both back: A is on its
    // way, so only B comes back, and the next send has B alone.
    store = storeDraftChanged(store, DRAFT, () => [a, b]);
    expect(store.drafts[DRAFT]).toEqual([b]);
    store = storeDraftChanged(store, DRAFT, (lines) =>
      putDraftLineBack(lines, a, 0),
    );
    expect(store.drafts[DRAFT]).toEqual([b]);
  });

  it("leaves the other drafts and the rounds as they are", () => {
    const a = line();
    const elsewhere = line();
    const store = storeSent(
      {
        ...emptySendStore,
        drafts: { [DRAFT]: [a], [NEW_TAKEAWAY]: [elsewhere] },
      },
      round(A, [a]),
    );
    const changed = storeDraftChanged(store, NEW_TAKEAWAY, (lines) =>
      lines.map((l) => ({ ...l, quantity: 2 })),
    );
    expect(changed.pending).toBe(store.pending);
    expect(changed.drafts[DRAFT]).toBe(store.drafts[DRAFT]);
    expect(changed.drafts[NEW_TAKEAWAY]).toEqual([
      { ...elsewhere, quantity: 2 },
    ]);
  });
});

describe("a draft when its order moves (P5)", () => {
  const there = "place:00000000-0000-4000-8000-0000000000c2";
  /** New ids for what goes back as a line of its own. */
  const ids = () => {
    let n = 0;
    return () => {
      n += 1;
      return `back-${n}`;
    };
  };

  it("goes with the order after what the new place holds, and back again", () => {
    const waiting = line();
    const already = line({ quantity: 2 });
    const store: SendStore = {
      ...emptySendStore,
      drafts: { [DRAFT]: [waiting], [there]: [already] },
    };
    const moved = storeDraftMoved(store, DRAFT, there);
    expect(moved.drafts[DRAFT]).toEqual([]);
    expect(moved.drafts[there]).toEqual([already, waiting]);
    expect(moved.own).toEqual({ [there]: [{ id: already.id, quantity: 2 }] });
    // Its undo takes back all but what the new place held of its own.
    const back = storeMovedBack(moved, there, DRAFT, ids());
    expect(back.drafts[DRAFT]).toEqual([waiting]);
    expect(back.drafts[there]).toEqual([already]);
    expect(back.own).toEqual({});
    // The same place: nothing changes. Nothing waiting: only what the new
    // place holds is kept, the drafts as they were.
    expect(storeDraftMoved(store, DRAFT, DRAFT)).toBe(store);
    const empty = storeDraftMoved(
      { ...emptySendStore, drafts: { [there]: [already] } },
      DRAFT,
      there,
    );
    expect(empty.drafts).toEqual({ [there]: [already] });
    expect(empty.own).toEqual({ [there]: [{ id: already.id, quantity: 2 }] });
    // Nothing known of what the place held (no move there in this tab's
    // memory): nothing moves back.
    expect(storeMovedBack(store, there, DRAFT, ids())).toBe(store);
  });

  it("takes back on its undo what was added there and what a refused round put back", () => {
    const went = line();
    const own = line({ quantity: 2 });
    const store: SendStore = {
      ...emptySendStore,
      drafts: { [DRAFT]: [went], [there]: [own] },
    };
    const moved = storeDraftMoved(store, DRAFT, there);
    // At the new place a round goes with what went and is refused there, its
    // line back at the front of the draft; and a line is added meanwhile.
    const roundThere = round(A, [went], there);
    const added = line();
    const afterRefusal = storeSettled(
      storeDraftChanged(storeSent(moved, roundThere), there, (lines) => [
        ...lines,
        added,
      ]),
      roundThere,
      refused,
    );
    expect(afterRefusal.drafts[there]).toEqual([went, own, added]);
    // The undo: everything but the place's own goes back with the order.
    const back = storeMovedBack(afterRefusal, there, DRAFT, ids());
    expect(back.drafts[DRAFT]).toEqual([went, added]);
    expect(back.drafts[there]).toEqual([own]);
  });

  it("takes back more of the place's own line than it held, as a line of its own", () => {
    // Table 5 holds a coffee; table 3's order moves there, and a coffee is
    // added for it: one tap makes 5's own plain line two.
    const coffee = line();
    const beer = line();
    const moved = storeDraftMoved(
      {
        ...emptySendStore,
        drafts: { [DRAFT]: [beer], [there]: [coffee] },
      },
      DRAFT,
      there,
    );
    const tapped = storeDraftChanged(moved, there, (lines) =>
      lines.map((l) => (l.id === coffee.id ? { ...l, quantity: 2 } : l)),
    );
    const back = storeMovedBack(tapped, there, DRAFT, ids());
    // Table 5 keeps its one coffee; table 3's order has the coffee added for
    // it and its beer, in the order table 5's draft held them.
    expect(back.drafts[there]).toEqual([coffee]);
    expect(back.drafts[DRAFT]).toEqual([
      { ...coffee, id: "back-1", quantity: 1 },
      beer,
    ]);
    // One fewer than it held: the place keeps what is left of it.
    const fewer = storeDraftChanged(
      storeDraftMoved(
        {
          ...emptySendStore,
          drafts: { [DRAFT]: [beer], [there]: [{ ...coffee, quantity: 3 }] },
        },
        DRAFT,
        there,
      ),
      there,
      (lines) =>
        lines.map((l) => (l.id === coffee.id ? { ...l, quantity: 2 } : l)),
    );
    const kept = storeMovedBack(fewer, there, DRAFT, ids());
    expect(kept.drafts[there]).toEqual([{ ...coffee, quantity: 2 }]);
    expect(kept.drafts[DRAFT]).toEqual([beer]);
  });

  it("takes back the place's own line that went out in one of the order's rounds", () => {
    // Table 5's own coffee goes in the order's round with the moved beer,
    // refused as the beer sold out: both come back to 5. Had it gone, the
    // coffee would have been the order's, so it goes back with the order.
    const coffee = line();
    const beer = line();
    const moved = storeDraftMoved(
      {
        ...emptySendStore,
        drafts: { [DRAFT]: [beer], [there]: [coffee] },
      },
      DRAFT,
      there,
    );
    const roundThere = round(A, [coffee, beer], there);
    const sent = storeSent(moved, roundThere);
    expect(sent.own).toEqual({ [there]: [] });
    const refusedThere = storeSettled(sent, roundThere, refused);
    expect(refusedThere.own).toEqual({ [there]: [] });
    expect(refusedThere.drafts[there]).toEqual([coffee, beer]);
    const back = storeMovedBack(refusedThere, there, DRAFT, ids());
    expect(back.drafts[DRAFT]).toEqual([coffee, beer]);
    expect(back.drafts[there]).toEqual([]);
    // A round from another draft leaves what the place holds of its own.
    const elsewhere = storeSent(moved, round(B, [line()], NEW_TAKEAWAY));
    expect(elsewhere.own).toBe(moved.own);
  });

  it("forgets what the old place held of its own once the order moves on", () => {
    const coffee = line();
    const onTo = "place:00000000-0000-4000-8000-0000000000c3";
    const moved = storeDraftMoved(
      { ...emptySendStore, drafts: { [there]: [coffee] } },
      DRAFT,
      there,
    );
    const onward = storeDraftMoved(moved, there, onTo);
    expect(onward.own).toEqual({ [onTo]: [] });
    expect(onward.drafts[onTo]).toEqual([coffee]);
  });

  it("takes the refusal of its last send along, unless the draft it joins has one", () => {
    const soldOut = { failure: "unavailable", items: [HUMMUS] };
    const moved = refusalMoved({ [there]: soldOut }, there, DRAFT);
    expect(moved).toEqual({ [DRAFT]: soldOut });
    // The place it goes to says its own refusal; nothing to take, or the
    // same place: nothing changes.
    const both = { [there]: soldOut, [DRAFT]: { failure: "route", items: [] } };
    expect(refusalMoved(both, there, DRAFT)).toBe(both);
    const none = { [DRAFT]: soldOut };
    expect(refusalMoved(none, there, DRAFT)).toBe(none);
    expect(refusalMoved(none, DRAFT, DRAFT)).toBe(none);
  });

  it("leaves on the undo the refusal the new place held of its own", () => {
    // Table 5's fish was refused as sold out before table 3's order, with
    // its beer, moved there. The undo takes the beer back, and 5's refusal
    // stays with its fish.
    const fish = { failure: "unavailable", items: [HUMMUS] };
    const refusals = { [there]: fish };
    expect(refusalMoved(refusals, there, DRAFT, fish)).toBe(refusals);
    // A refusal at 5 since the move is about the order's round: it goes.
    const since = { failure: "unavailable", items: [HUMMUS] };
    expect(refusalMoved({ [there]: since }, there, DRAFT, fish)).toEqual({
      [DRAFT]: since,
    });
  });
});
