import { type DraftLine, putDraftLineBack } from "@domain/order-screens";
import { describe, expect, it } from "vitest";
import {
  emptySendStore,
  type PendingRound,
  pendingOfDraft,
  type SendStore,
  storeDraftChanged,
  storedFrom,
  storeEmpty,
  storeSent,
  storeSettled,
} from "./send-store";

const BUSINESS = "00000000-0000-4000-8000-000000000001";
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

/** What a reload reads back: the store as JSON, through sessionStorage. */
const reloaded = (store: SendStore) =>
  storedFrom(JSON.parse(JSON.stringify(store)));

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

  it("takes only the lines a round sends out of the draft", () => {
    const draft = Array.from({ length: 45 }, () => line());
    const out = round(A, draft.slice(0, 40));
    const store = storeSent(
      { ...emptySendStore, drafts: { [DRAFT]: draft } },
      out,
    );
    expect(store.drafts[DRAFT]).toEqual(draft.slice(40));
  });

  it("reads back only what it wrote", () => {
    expect(storedFrom(null)).toEqual(emptySendStore);
    expect(storedFrom("nope")).toEqual(emptySendStore);
    // A round under another key than its own, or with no draft, is dropped.
    const a = round(A, [line()]);
    expect(
      storedFrom({
        drafts: {},
        pending: { [B]: a, [A]: { body: a.body, lines: a.lines } },
      }).pending,
    ).toEqual({});
    expect(storeEmpty(emptySendStore)).toBe(true);
    expect(storeEmpty({ drafts: { [DRAFT]: [] }, pending: {} })).toBe(true);
    expect(storeEmpty(storeSent(emptySendStore, a))).toBe(false);
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
