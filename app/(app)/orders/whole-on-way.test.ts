import { describe, expect, it } from "vitest";
import type { OrdersActionResult, WholeWrite } from "./orders-types";
import {
  wholeGone,
  wholeOnWayFor,
  wholeWaits,
  wholeWrites,
} from "./whole-on-way";

// The writes of an order whole on their way (waiter mode P5): the send waits
// for them on every screen of the mode, and they wait for a round on its way.

const T3 = "place:3";
const T5 = "place:5";

/** A write that answers when told to. */
function gate() {
  let answer: (result: OrdersActionResult) => void = () => {};
  let fail: (error: Error) => void = () => {};
  let calls = 0;
  const write = () => {
    calls += 1;
    return new Promise<OrdersActionResult>((resolve, reject) => {
      answer = resolve;
      fail = reject;
    });
  };
  return {
    write,
    calls: () => calls,
    answer: (result: OrdersActionResult) => answer(result),
    fail: (error: Error) => fail(error),
  };
}

const ok: OrdersActionResult = { ok: true, value: null };

describe("a write of the order whole on its way", () => {
  const move: WholeWrite = { order: "O", drafts: [T5, T3] };

  it("is on its way for its order, whatever the draft", () => {
    expect(wholeOnWayFor([move], "O", "takeaway:O")).toBe(true);
    expect(wholeOnWayFor([move], "P", "place:7")).toBe(false);
  });

  it("is on its way for a draft it touches, with no order on that screen", () => {
    // The close's "ביטול" opens the order again at table 3, whose screen has
    // no open order meanwhile: a send there would open a second one.
    expect(wholeOnWayFor([move], null, T3)).toBe(true);
    expect(wholeOnWayFor([move], null, T5)).toBe(true);
    expect(wholeOnWayFor([move], null, "place:7")).toBe(false);
    expect(wholeOnWayFor([], null, T3)).toBe(false);
  });

  it("waits for a round on its way from a draft it names", () => {
    expect(wholeWaits(move, (draft) => (draft === T5 ? 1 : 0))).toBe(true);
    expect(wholeWaits(move, (draft) => (draft === T3 ? 2 : 0))).toBe(true);
    expect(wholeWaits(move, (draft) => (draft === "place:7" ? 1 : 0))).toBe(
      false,
    );
  });

  it("leaves by itself once answered, another alike staying", () => {
    const again: WholeWrite = { order: "O", drafts: [T5, T3] };
    const going = [move, again];
    expect(wholeGone(going, move)).toEqual([again]);
    expect(wholeGone(going, move)[0]).toBe(again);
    expect(wholeGone(going, { order: "O", drafts: [] })).toBe(going);
  });
});

describe("the mode's writes of an order whole", () => {
  it("are on their way from the call until the answer, for every screen", async () => {
    const shown: (readonly WholeWrite[])[] = [];
    const writes = wholeWrites(
      () => 0,
      (going) => shown.push(going),
    );
    const close = gate();
    const result = writes.run({ order: "O", drafts: [T3] }, close.write);
    expect(close.calls()).toBe(1);
    expect(writes.going()).toEqual([{ order: "O", drafts: [T3] }]);
    expect(wholeOnWayFor(writes.going(), null, T3)).toBe(true);
    close.answer(ok);
    await expect(result).resolves.toEqual(ok);
    expect(writes.going()).toEqual([]);
    expect(shown.map((going) => going.length)).toEqual([1, 0]);
  });

  it("leave once failed too, the failure handed on", async () => {
    const writes = wholeWrites(
      () => 0,
      () => {},
    );
    const move = gate();
    const result = writes.run({ order: "O", drafts: [T3, T5] }, move.write);
    move.fail(new Error("down"));
    await expect(result).rejects.toThrow("down");
    expect(writes.going()).toEqual([]);
  });

  it("never go while a round of a draft they name is on its way", async () => {
    // Table 5's send is on its way with the order moved there: its "ביטול"
    // waits for it, as moved back first the round would be refused at the
    // place the order left.
    const onItsWay = new Map([[T5, 1]]);
    const writes = wholeWrites(
      (draft) => onItsWay.get(draft) ?? 0,
      () => {},
    );
    const back = gate();
    await expect(
      writes.run({ order: "O", drafts: [T5, T3] }, back.write),
    ).resolves.toEqual({ ok: false, failure: "sending" });
    expect(back.calls()).toBe(0);
    expect(writes.going()).toEqual([]);
    // It landed: the way back goes.
    onItsWay.delete(T5);
    const result = writes.run({ order: "O", drafts: [T5, T3] }, back.write);
    expect(back.calls()).toBe(1);
    back.answer(ok);
    await expect(result).resolves.toEqual(ok);
  });

  it("keep each of two alike on its way until its own answer", async () => {
    const writes = wholeWrites(
      () => 0,
      () => {},
    );
    const first = gate();
    const second = gate();
    const one = writes.run({ order: "O", drafts: [T3] }, first.write);
    const two = writes.run({ order: "O", drafts: [T3] }, second.write);
    expect(writes.going()).toHaveLength(2);
    first.answer(ok);
    await one;
    expect(writes.going()).toHaveLength(1);
    expect(wholeOnWayFor(writes.going(), "O", T3)).toBe(true);
    second.answer(ok);
    await two;
    expect(writes.going()).toEqual([]);
  });
});
