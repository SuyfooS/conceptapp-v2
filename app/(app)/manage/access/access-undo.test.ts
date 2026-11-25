import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCESS_REMOVE, accessRemove, createUndoSlot } from "./access-undo";

// The ways back on the screen of who sees pay (accessibility, part 8): each
// shown for its time, which stops while it is being reached, and the
// person's "הסרה" the focus goes back to once one is undone.

type Undo = { key: string; message: string };
const noa: Undo = { key: "noa", message: "Noa was removed" };
const yoav: Undo = { key: "yoav", message: "Yoav was removed" };

describe("createUndoSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a way back for its time, then nothing", () => {
    const changed = vi.fn();
    const slot = createUndoSlot<Undo>(6000, changed);
    slot.show(noa);
    expect(changed).toHaveBeenLastCalledWith(noa);
    expect(slot.shown()).toBe(noa);
    vi.advanceTimersByTime(5999);
    expect(slot.shown()).toBe(noa);
    vi.advanceTimersByTime(1);
    expect(changed).toHaveBeenLastCalledWith(null);
    expect(slot.shown()).toBeNull();
  });

  it("waits while it is being reached, then only the time it had left", () => {
    const changed = vi.fn();
    const slot = createUndoSlot<Undo>(6000, changed);
    slot.show(noa);
    vi.advanceTimersByTime(2000);
    slot.waits("noa", true);
    vi.advanceTimersByTime(60_000);
    expect(slot.shown()).toBe(noa);
    slot.waits("noa", false);
    vi.advanceTimersByTime(3999);
    expect(slot.shown()).toBe(noa);
    vi.advanceTimersByTime(1);
    expect(slot.shown()).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("lets an earlier way back's wait change nothing of the next one's", () => {
    const slot = createUndoSlot<Undo>(6000, () => {});
    slot.show(noa);
    slot.waits("noa", true);
    // The next person removed: Noa's row goes, and its wait ends with it.
    slot.show(yoav);
    slot.waits("yoav", true);
    slot.waits("noa", false);
    vi.advanceTimersByTime(60_000);
    expect(slot.shown()).toBe(yoav);
    // And one already gone stops nothing either.
    slot.waits("yoav", false);
    slot.waits("noa", true);
    vi.advanceTimersByTime(6000);
    expect(slot.shown()).toBeNull();
  });

  it("gives the next way back its whole time, and the earlier one's ends nothing", () => {
    const slot = createUndoSlot<Undo>(6000, () => {});
    slot.show(noa);
    vi.advanceTimersByTime(4000);
    slot.show(yoav);
    vi.advanceTimersByTime(5999);
    expect(slot.shown()).toBe(yoav);
    vi.advanceTimersByTime(1);
    expect(slot.shown()).toBeNull();
  });

  it("takes it away when cleared, and its time then calls nothing", () => {
    const changed = vi.fn();
    const slot = createUndoSlot<Undo>(6000, changed);
    slot.show(noa);
    slot.waits("noa", true);
    slot.clear();
    expect(changed).toHaveBeenLastCalledWith(null);
    slot.waits("noa", false);
    vi.advanceTimersByTime(60_000);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(slot.shown()).toBeNull();
  });
});

describe("accessRemove", () => {
  it("finds the person's remove button by their id", () => {
    expect(ACCESS_REMOVE).toBe("data-access-remove");
    expect(accessRemove("yoav")).toBe('[data-access-remove="yoav"]');
    expect(accessRemove("3f2c9a10-7b1e-4c55-9d1e-0a7b2c3d4e5f")).toBe(
      '[data-access-remove="3f2c9a10-7b1e-4c55-9d1e-0a7b2c3d4e5f"]',
    );
  });

  it("reads any id as itself, quotes and backslashes included", () => {
    expect(accessRemove('a"b\\c')).toBe('[data-access-remove="a\\"b\\\\c"]');
  });
});
