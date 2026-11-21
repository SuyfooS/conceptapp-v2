import { describe, expect, it } from "vitest";
import { inTurn, writesOnWay } from "./in-turn";

/** A write that answers when told to, and says when it was sent. */
function gate() {
  const sent: string[][] = [];
  const answers: ((ok: boolean) => void)[] = [];
  const write = (...args: string[]) => {
    sent.push(args);
    return new Promise<{ ok: boolean }>((resolve, reject) => {
      answers.push((ok) => (ok ? resolve({ ok }) : reject(new Error("down"))));
    });
  };
  return { sent, answer: (n: number, ok = true) => answers[n]?.(ok), write };
}

/** Lets every answer already given reach its waiters. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the mode's writes in turn", () => {
  it("sends a close only once the line fix sent before it has answered", async () => {
    const fix = gate();
    const close = gate();
    const writes = inTurn(
      { cancelLine: fix.write, close: close.write },
      ["close"],
      writesOnWay(),
    );
    // The fix went on leaving the order's screen; the till's close comes after.
    const cancelled = writes.cancelLine("line-1");
    const closed = writes.close("order-1");
    await settle();
    expect(fix.sent).toEqual([["line-1"]]);
    expect(close.sent).toEqual([]);
    fix.answer(0);
    await settle();
    expect(close.sent).toEqual([["order-1"]]);
    close.answer(0);
    await expect(cancelled).resolves.toEqual({ ok: true });
    await expect(closed).resolves.toEqual({ ok: true });
  });

  it("goes on after a write before it failed, and gives back its own answer", async () => {
    const fix = gate();
    const close = gate();
    const writes = inTurn(
      { cancelLine: fix.write, close: close.write },
      ["close"],
      writesOnWay(),
    );
    const cancelled = writes.cancelLine("line-1");
    const closed = writes.close("order-1");
    fix.answer(0, false);
    await expect(cancelled).rejects.toThrow("down");
    await settle();
    expect(close.sent).toEqual([["order-1"]]);
    close.answer(0, false);
    await expect(closed).rejects.toThrow("down");
  });

  it("sends at once with nothing on its way, and never waits for a write after it", async () => {
    const fix = gate();
    const close = gate();
    const writes = inTurn(
      { cancelLine: fix.write, close: close.write },
      ["close"],
      writesOnWay(),
    );
    void writes.close("order-1");
    expect(close.sent).toEqual([["order-1"]]);
    // A write that doesn't wait its turn goes at once, a close on its way or not.
    void writes.cancelLine("line-1");
    expect(fix.sent).toEqual([["line-1"]]);
  });

  it("forgets a write once it answered", async () => {
    const fix = gate();
    const close = gate();
    const onWay = writesOnWay();
    const writes = inTurn(
      { cancelLine: fix.write, close: close.write },
      ["close"],
      onWay,
    );
    void writes.cancelLine("line-1");
    expect(onWay.going.size).toBe(1);
    fix.answer(0);
    await settle();
    expect(onWay.going.size).toBe(0);
    void writes.close("order-1");
    expect(close.sent).toEqual([["order-1"]]);
  });

  it("waits for a write sent through an earlier set of writes on the same way", async () => {
    const fix = gate();
    const close = gate();
    const onWay = writesOnWay();
    // The layout drawn again gives the mode new writes; what went keeps its place.
    const before = inTurn({ cancelLine: fix.write }, [], onWay);
    const after = inTurn({ close: close.write }, ["close"], onWay);
    void before.cancelLine("line-1");
    void after.close("order-1");
    await settle();
    expect(close.sent).toEqual([]);
    fix.answer(0);
    await settle();
    expect(close.sent).toEqual([["order-1"]]);
  });
});
