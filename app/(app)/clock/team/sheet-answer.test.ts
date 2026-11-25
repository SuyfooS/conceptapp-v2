import { type StartTransition, sheetWrites } from "@ui/use-sheet-write";
import { describe, expect, it } from "vitest";
import { type SheetAnswer, sendFromSheet } from "./sheet-answer";

/*
 * A refusal from one of the person's hours sheets (25 November 2026): its
 * form draws it on React's next turn after the answer, and a close coming in
 * between (✕, Escape, the scrim, a swipe) took it along unsaid. The write
 * now keeps the sheet from the moment the refusal comes until the form has
 * drawn it (`said`). Done, it lets go at once, as the sheet closes itself.
 */

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Lets every answer and continuation already due run. */
const settle = () => new Promise((done) => setTimeout(done, 0));

/** Runs the write: what the transition waits for after it is not the matter here. */
const run: StartTransition = (action) => {
  void action();
};

/** A sheet's writes, with one sent from it whose answer comes when told. */
function sent<Failure>() {
  const writes = sheetWrites(run);
  const answer = deferred<SheetAnswer<Failure>>();
  const seen = {
    done: 0,
    refused: [] as [Failure | "failed", string | undefined][],
  };
  writes.start((keep) =>
    sendFromSheet(keep, () => answer.promise, {
      done: () => {
        seen.done += 1;
      },
      refused: (failure, month) => {
        seen.refused.push([failure, month]);
      },
    }),
  );
  return { writes, answer, seen };
}

/**
 * Whether the sheet is held at each turn from now on, then once all due has
 * run: a close could come in at any of them before the form draws.
 */
async function heldEachTurn(held: () => boolean): Promise<boolean[]> {
  const seen: boolean[] = [];
  for (let turn = 0; turn < 10; turn++) {
    seen.push(held());
    await Promise.resolve();
  }
  await settle();
  seen.push(held());
  return seen;
}

describe("sendFromSheet", () => {
  it("keeps the sheet for a refusal from the moment it comes until the form has said it", async () => {
    const { writes, answer, seen } = sent<"overlap">();
    expect(writes.held()).toBe(true);

    answer.resolve({ ok: false, failure: "overlap" });
    const held = await heldEachTurn(writes.held);
    expect(seen.refused).toEqual([["overlap", undefined]]);
    expect(held.every(Boolean)).toBe(true);

    // Drawn, the form says so: the sheet may close.
    writes.said();
    expect(writes.held()).toBe(false);
  });

  it("refuses a write that failed to go as failed, kept the same", async () => {
    const { writes, answer, seen } = sent<"overlap">();
    answer.reject(new Error("offline"));
    const held = await heldEachTurn(writes.held);
    expect(seen.refused).toEqual([["failed", undefined]]);
    expect(held.every(Boolean)).toBe(true);
    writes.said();
    expect(writes.held()).toBe(false);
  });

  it("hands on the month a refusal names", async () => {
    const { answer, seen } = sent<"monthClosed">();
    answer.resolve({ ok: false, failure: "monthClosed", month: "2026-10" });
    await settle();
    expect(seen.refused).toEqual([["monthClosed", "2026-10"]]);
  });

  it("keeps nothing once done: the sheet closes itself", async () => {
    const { writes, answer, seen } = sent<"overlap">();
    answer.resolve({ ok: true });
    await settle();
    expect(seen).toEqual({ done: 1, refused: [] });
    expect(writes.held()).toBe(false);
  });
});
