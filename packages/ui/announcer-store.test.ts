import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANNOUNCE_CLEAR_MS,
  ANNOUNCE_SAME_MS,
  createAnnouncerStore,
  NOTHING_SAID,
} from "./announcer-store";

/*
 * What the page's announcer says (accessibility, part 1): each line once, a
 * line of its own each time, the same words twice in a moment said once,
 * and every line gone a few seconds on, so nothing lingers to be found.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const texts = (lines: readonly { text: string }[]) =>
  lines.map((line) => line.text);

describe("the announcer's lines", () => {
  it("says nothing before it is asked", () => {
    expect(createAnnouncerStore().snapshot()).toBe(NOTHING_SAID);
  });

  it("adds a line of its own for each call, the same words heard again later", () => {
    const store = createAnnouncerStore();
    store.announce("3");
    vi.advanceTimersByTime(ANNOUNCE_SAME_MS);
    store.announce("3");
    const { polite } = store.snapshot();
    expect(texts(polite)).toEqual(["3", "3"]);
    expect(polite[0]?.id).not.toBe(polite[1]?.id);
  });

  it("says the same words twice in a moment once: two shapes of one screen", () => {
    const store = createAnnouncerStore();
    store.announce("Noa was removed");
    vi.advanceTimersByTime(ANNOUNCE_SAME_MS - 1);
    store.announce("Noa was removed");
    expect(texts(store.snapshot().polite)).toEqual(["Noa was removed"]);
  });

  it("keeps polite and assertive apart, and either repeats on its own", () => {
    const store = createAnnouncerStore();
    store.announce("Saved");
    store.announce("Saved", { politeness: "assertive" });
    store.announce("Not sent", { politeness: "assertive" });
    expect(texts(store.snapshot().polite)).toEqual(["Saved"]);
    expect(texts(store.snapshot().assertive)).toEqual(["Saved", "Not sent"]);
  });

  it("keeps the language a line is in", () => {
    const store = createAnnouncerStore();
    store.announce("Switching to the shop", { lang: "en" });
    store.announce("4");
    expect(store.snapshot().polite).toEqual([
      { id: 1, text: "Switching to the shop", lang: "en" },
      { id: 2, text: "4" },
    ]);
  });

  it("clears each line once it was read", () => {
    const store = createAnnouncerStore();
    store.announce("first");
    vi.advanceTimersByTime(1_000);
    store.announce("second");
    vi.advanceTimersByTime(ANNOUNCE_CLEAR_MS - 1_000);
    expect(texts(store.snapshot().polite)).toEqual(["second"]);
    vi.advanceTimersByTime(1_000);
    expect(store.snapshot().polite).toEqual([]);
  });

  it("ignores empty words", () => {
    const store = createAnnouncerStore();
    store.announce("");
    store.announce("   ");
    expect(store.snapshot()).toBe(NOTHING_SAID);
  });

  it("gives a new snapshot only when something changed, and tells its listeners", () => {
    const store = createAnnouncerStore();
    const heard = vi.fn();
    const stop = store.subscribe(heard);
    const before = store.snapshot();
    expect(store.snapshot()).toBe(before);
    store.announce("one");
    expect(heard).toHaveBeenCalledTimes(1);
    const after = store.snapshot();
    expect(after).not.toBe(before);
    expect(store.snapshot()).toBe(after);
    // Dropped as the same words: no change, nobody told.
    store.announce("one");
    expect(store.snapshot()).toBe(after);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    store.announce("two", { politeness: "assertive" });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("waits on the clock it is given", () => {
    const waits: { run: () => void; ms: number }[] = [];
    const store = createAnnouncerStore(
      { setTimeout: (run, ms) => waits.push({ run, ms }) },
      () => 0,
    );
    store.announce("one");
    expect(waits.map((wait) => wait.ms)).toEqual([ANNOUNCE_CLEAR_MS]);
    waits[0]?.run();
    expect(store.snapshot().polite).toEqual([]);
  });
});
