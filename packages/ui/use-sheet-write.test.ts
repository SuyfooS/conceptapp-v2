import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type StartTransition,
  sheetWrites,
  useSheetWrite,
} from "./use-sheet-write";

/*
 * A refused write lets its sheet close at once (23 November 2026). A server
 * action that calls `refresh()` answers first, and the page read again
 * after it comes behind, still streaming: React's transition is pending
 * until that page is drawn. The sheet waits for the answer alone.
 */

function deferred<T = void>() {
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

/**
 * A transition as React keeps one over a server action that refreshes:
 * pending from the press until its action is over and the page read again
 * after it is drawn (`drawn()`), whichever comes last. What the action threw
 * is kept, as React hands it on.
 */
function refreshingTransition() {
  const page = deferred();
  const state = { pending: false, thrown: [] as unknown[] };
  const start: StartTransition = (action) => {
    state.pending = true;
    const done = action().catch((error: unknown) => {
      state.thrown.push(error);
    });
    void Promise.all([done, page.promise]).then(() => {
      state.pending = false;
    });
  };
  return { start, state, drawn: () => page.resolve() };
}

describe("sheetWrites", () => {
  it("holds nothing before a write", () => {
    expect(sheetWrites(refreshingTransition().start).held()).toBe(false);
  });

  it("holds the sheet from the press until the answer, not until the page is drawn", async () => {
    const transition = refreshingTransition();
    const writes = sheetWrites(transition.start);
    const answer = deferred<{ ok: false; failure: "times" }>();
    let said: string | null = null;

    writes.start(async () => {
      const result = await answer.promise;
      said = result.failure;
    });
    // At once, as the press goes: nothing can close it under the write.
    expect(writes.held()).toBe(true);
    expect(transition.state.pending).toBe(true);

    answer.resolve({ ok: false, failure: "times" });
    await settle();
    // The refusal shows, and the sheet may close while the page comes.
    expect(said).toBe("times");
    expect(writes.held()).toBe(false);
    expect(transition.state.pending).toBe(true);

    // The buttons wait for the page, so no second write goes on old data.
    transition.drawn();
    await settle();
    expect(transition.state.pending).toBe(false);
  });

  it("lets go when the write throws, and the error goes on to the transition", async () => {
    const transition = refreshingTransition();
    const writes = sheetWrites(transition.start);
    const answer = deferred();

    writes.start(() => answer.promise);
    expect(writes.held()).toBe(true);
    const offline = new Error("offline");
    answer.reject(offline);
    await settle();
    expect(writes.held()).toBe(false);
    expect(transition.state.thrown).toEqual([offline]);
  });

  // "כניסה בלי קוד" refused (25 November 2026): the sheet says why only
  // once the page read again is drawn, and React draws the refusal itself
  // only on its next turn after the answer. Kept as it comes, the hold
  // passes on with no moment free between.
  it("keeps the sheet for an answer said later, from the moment it comes until said", async () => {
    const transition = refreshingTransition();
    const writes = sheetWrites(transition.start);
    const answer = deferred<{ ok: false; failure: "alreadyIn" }>();
    const seen: boolean[] = [];
    let given: string | null = null;

    writes.start(async (keep) => {
      const result = await answer.promise;
      keep();
      given = result.failure;
    });
    answer.resolve({ ok: false, failure: "alreadyIn" });
    // Every turn from the answer on, as a close could come in at any of
    // them before the refusal is drawn.
    for (let turn = 0; turn < 10; turn++) {
      seen.push(writes.held());
      await Promise.resolve();
    }
    await settle();
    seen.push(writes.held());
    expect(given).toBe("alreadyIn");
    expect(seen.every(Boolean)).toBe(true);

    // The page read again is drawn: still held, as it is said only now.
    transition.drawn();
    await settle();
    expect(transition.state.pending).toBe(false);
    expect(writes.held()).toBe(true);

    writes.said();
    expect(writes.held()).toBe(false);
  });

  it("is not let go by said while a write is on its way", () => {
    const writes = sheetWrites(refreshingTransition().start);
    writes.start(() => deferred().promise);
    writes.said();
    expect(writes.held()).toBe(true);
  });

  it("lets a new write take over from what an earlier answer kept", async () => {
    const transition = refreshingTransition();
    const writes = sheetWrites(transition.start);
    const first = deferred();
    writes.start(async (keep) => {
      await first.promise;
      keep();
    });
    first.resolve();
    await settle();
    expect(writes.held()).toBe(true);

    // Pressed again before it was said: the new press holds the sheet, and
    // once it answers, unkept, nothing is left holding it.
    const second = deferred();
    writes.start(() => second.promise);
    expect(writes.held()).toBe(true);
    second.resolve();
    await settle();
    expect(writes.held()).toBe(false);
  });

  it("holds until the last of two writes on their way answers", async () => {
    const transition = refreshingTransition();
    const writes = sheetWrites(transition.start);
    const first = deferred();
    const second = deferred();

    writes.start(() => first.promise);
    writes.start(() => second.promise);
    first.resolve();
    await settle();
    expect(writes.held()).toBe(true);
    second.resolve();
    await settle();
    expect(writes.held()).toBe(false);
  });
});

/** What the hook gives as a screen draws. */
function Probe() {
  const write = useSheetWrite();
  return createElement(
    "p",
    null,
    `${write.pending}/${write.held()}/${typeof write.start}/${typeof write.said}`,
  );
}

describe("useSheetWrite", () => {
  it("draws with nothing pending and nothing held", () => {
    expect(renderToString(createElement(Probe))).toBe(
      "<p>false/false/function/function</p>",
    );
  });
});
