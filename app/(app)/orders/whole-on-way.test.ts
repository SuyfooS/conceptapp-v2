import { describe, expect, it } from "vitest";
import type { OrdersActionResult, WholeWrite } from "./orders-types";
import {
  wholeGone,
  wholeOnWayFor,
  wholeRefusal,
  wholeWaits,
  wholeWrites,
} from "./whole-on-way";

// The writes of an order whole on their way (waiter mode P5): the send waits
// for them on every screen of the mode, they wait for a round on its way,
// none goes behind another of its order not answered yet, and a written one
// stays on its way until the mode has read the order again.

const T3 = "place:3";
const T5 = "place:5";
const T7 = "place:7";

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

/** The mode's reads after a write: each lands when told to. */
function reads() {
  const waiting: (() => void)[] = [];
  return {
    read: () => new Promise<void>((landed) => waiting.push(landed)),
    asked: () => waiting.length,
    land: () => {
      for (const landed of waiting.splice(0)) landed();
    },
  };
}

/** Lets the microtasks after an answer run. */
const settle = () => new Promise((done) => setTimeout(done, 0));

const ok: OrdersActionResult = { ok: true, value: null };
const none = () => 0;

describe("a write of the order whole on its way", () => {
  const move: WholeWrite = { order: "O", drafts: [T5, T3] };

  it("is on its way for its order, whatever the draft", () => {
    expect(wholeOnWayFor([move], "O", "takeaway:O")).toBe(true);
    expect(wholeOnWayFor([move], "P", T7)).toBe(false);
  });

  it("is on its way for a draft it touches, with no order on that screen", () => {
    // The close's "ביטול" opens the order again at table 3, whose screen has
    // no open order meanwhile: a send there would open a second one.
    expect(wholeOnWayFor([move], null, T3)).toBe(true);
    expect(wholeOnWayFor([move], null, T5)).toBe(true);
    expect(wholeOnWayFor([move], null, T7)).toBe(false);
    expect(wholeOnWayFor([], null, T3)).toBe(false);
  });

  it("waits for a round on its way from a draft it names", () => {
    expect(wholeWaits(move, (draft) => (draft === T5 ? 1 : 0))).toBe(true);
    expect(wholeWaits(move, (draft) => (draft === T3 ? 2 : 0))).toBe(true);
    expect(wholeWaits(move, (draft) => (draft === T7 ? 1 : 0))).toBe(false);
  });

  it("is held back by a round on its way, or by another write of its order or its drafts", () => {
    // The move's "ביטול" (5 back to 3) while table 5's round is on its way.
    expect(wholeRefusal(move, [], (draft) => (draft === T5 ? 1 : 0))).toBe(
      "sending",
    );
    // While the move on to table 7, or the till's close, is on its way.
    const on: WholeWrite = { order: "O", drafts: [T5, T7] };
    const close: WholeWrite = { order: "O", drafts: [T5] };
    expect(wholeRefusal(move, [on], none)).toBe("writing");
    expect(wholeRefusal(move, [close], none)).toBe("writing");
    // Another order's write touching table 3 holds it too.
    expect(wholeRefusal(move, [{ order: "P", drafts: [T3] }], none)).toBe(
      "writing",
    );
    // A round on its way says so first; nothing in the way, it goes.
    expect(wholeRefusal(move, [on], () => 1)).toBe("sending");
    expect(wholeRefusal(move, [{ order: "P", drafts: [T7] }], none)).toBe(null);
    expect(wholeRefusal(move, [], none)).toBe(null);
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
  it("are on their way from the call, and once written until a read made after it lands", async () => {
    const shown: (readonly WholeWrite[])[] = [];
    const mode = reads();
    const writes = wholeWrites(none, (going) => shown.push(going), mode.read);
    const close = gate();
    const result = writes.run({ order: "O", drafts: [T3] }, close.write);
    expect(close.calls()).toBe(1);
    expect(writes.going()).toEqual([{ order: "O", drafts: [T3] }]);
    expect(wholeOnWayFor(writes.going(), null, T3)).toBe(true);
    expect(mode.asked()).toBe(0);
    close.answer(ok);
    await expect(result).resolves.toEqual(ok);
    await settle();
    // Closed, and asked again: until that read lands the screens show the
    // order open, its close and its rounds' buttons still waiting.
    expect(mode.asked()).toBe(1);
    expect(wholeOnWayFor(writes.going(), "O", T3)).toBe(true);
    mode.land();
    await settle();
    expect(writes.going()).toEqual([]);
    expect(shown.map((going) => going.length)).toEqual([1, 0]);
  });

  it("let the way back offered as one answers go at once, before that read", async () => {
    const mode = reads();
    const writes = wholeWrites(none, () => {}, mode.read);
    const close = gate();
    const closing = writes.run({ order: "O", drafts: [T3] }, close.write);
    close.answer(ok);
    await closing;
    // The close's "ביטול", pressed while its read is on its way.
    expect(writes.refusal({ order: "O", drafts: [T3] })).toBe(null);
    const back = gate();
    const undo = writes.run({ order: "O", drafts: [T3] }, back.write);
    expect(back.calls()).toBe(1);
    expect(writes.going()).toHaveLength(2);
    // Each stays until a read made after its own answer.
    back.answer(ok);
    await undo;
    await settle();
    expect(mode.asked()).toBe(2);
    mode.land();
    await settle();
    expect(writes.going()).toEqual([]);
  });

  it("leave at once when refused or failed, and ask again all the same", async () => {
    const mode = reads();
    const writes = wholeWrites(none, () => {}, mode.read);
    const close = gate();
    const refused = writes.run({ order: "O", drafts: [T3] }, close.write);
    close.answer({ ok: false, failure: "held" });
    await expect(refused).resolves.toEqual({ ok: false, failure: "held" });
    expect(writes.going()).toEqual([]);
    const move = gate();
    const failed = writes.run({ order: "O", drafts: [T3, T5] }, move.write);
    move.fail(new Error("down"));
    await expect(failed).rejects.toThrow("down");
    expect(writes.going()).toEqual([]);
    expect(mode.asked()).toBe(2);
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
    const on: WholeWrite = { order: "O", drafts: [T5, T3] };
    expect(writes.refusal(on)).toBe("sending");
    await expect(writes.run(on, back.write)).resolves.toEqual({
      ok: false,
      failure: "sending",
    });
    expect(back.calls()).toBe(0);
    expect(writes.going()).toEqual([]);
    // It landed: the way back goes.
    onItsWay.delete(T5);
    expect(writes.refusal(on)).toBe(null);
    const result = writes.run(on, back.write);
    expect(back.calls()).toBe(1);
    back.answer(ok);
    await expect(result).resolves.toEqual(ok);
  });

  it("never go behind another of the order not answered yet", async () => {
    // Moved from 3 to 5; at table 5 the move on to 7 is on its way. The
    // first move's "ביטול" would go behind it and take the order from 7 to
    // 3, its draft left at a free table 7.
    const mode = reads();
    const writes = wholeWrites(none, () => {}, mode.read);
    const on = gate();
    const onward = writes.run({ order: "O", drafts: [T5, T7] }, on.write);
    const back = gate();
    const undo: WholeWrite = { order: "O", drafts: [T5, T3] };
    expect(writes.refusal(undo)).toBe("writing");
    await expect(writes.run(undo, back.write)).resolves.toEqual({
      ok: false,
      failure: "writing",
    });
    expect(back.calls()).toBe(0);
    expect(writes.going()).toHaveLength(1);
    // Nor the till's close of the order, nor a write touching table 7.
    expect(writes.refusal({ order: "O", drafts: [T5] })).toBe("writing");
    expect(writes.refusal({ order: "P", drafts: [T7] })).toBe("writing");
    // Another order elsewhere goes.
    expect(writes.refusal({ order: "P", drafts: ["place:8"] })).toBe(null);
    on.answer(ok);
    await onward;
    // Answered: what comes next of the order goes.
    expect(writes.refusal({ order: "O", drafts: [T7, T5] })).toBe(null);
  });
});
