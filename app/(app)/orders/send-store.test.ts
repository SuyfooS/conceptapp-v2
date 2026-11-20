import type { DraftLine } from "@domain/order-screens";
import { describe, expect, it } from "vitest";
import {
  emptySendStore,
  type PendingRound,
  pendingOfDraft,
  type SendStore,
  storedFrom,
  storeEmpty,
  storeSent,
  storeSettled,
} from "./send-store";

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const PLACE = "00000000-0000-4000-8000-0000000000c1";
const HUMMUS = "00000000-0000-4000-8000-000000000011";
const DRAFT = `place:${PLACE}`;

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

const round = (key: string, lines: DraftLine[]): PendingRound => ({
  draft: DRAFT,
  body: {
    business: BUSINESS,
    key,
    target: { place: PLACE },
    lines: lines.map((l) => ({ item: l.item, quantity: l.quantity })),
  },
  lines,
});

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b1";

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
    const landed = storeSettled(store, a, true);
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
    const refused = storeSettled(
      { ...store, drafts: { [DRAFT]: [meanwhile] } },
      a,
      false,
    );
    expect(refused.drafts[DRAFT]).toEqual([...a.lines, meanwhile]);
    expect(pendingOfDraft(refused.pending, DRAFT)).toEqual([b]);
  });

  it("takes only the lines a round sends out of the draft", () => {
    const draft = Array.from({ length: 45 }, () => line());
    const sent = round(A, draft.slice(0, 40));
    const store = storeSent(
      { ...emptySendStore, drafts: { [DRAFT]: draft } },
      sent,
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
