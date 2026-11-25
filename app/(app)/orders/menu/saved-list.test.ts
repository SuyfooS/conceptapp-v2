import { describe, expect, it } from "vitest";
import { lastSaved } from "./saved-list";

/*
 * What a refusal in the menu's places or categories shows (accessibility,
 * part 9, after CI's third and fourth runs): the list of the newest change
 * that saved, while the server's own list from that answer isn't drawn
 * yet, whichever of the answers came last; nothing of its own once it is,
 * so the screen shows the server's.
 */

describe("lastSaved", () => {
  it("shows the list drawn when nothing saved", () => {
    const kept = lastSaved<string>();
    expect(kept.refused()).toBeNull();
  });

  it("shows the latest save's list while the server's isn't drawn", () => {
    const kept = lastSaved<string>();
    // The move saved (its answer overtaken by the rename), then the rename
    // refused before Next drew the move's answer.
    const moved = ["1", "2", "3", "5", "4"];
    kept.saved(moved, 1);
    expect(kept.refused()).toBe(moved);
  });

  it("keeps the newest of several saves", () => {
    const kept = lastSaved<string>();
    kept.saved(["2", "1"], 1);
    const later = ["2", "3", "1"];
    kept.saved(later, 2);
    expect(kept.refused()).toBe(later);
  });

  it("keeps the newest save when an older one's answer comes after it", () => {
    // Next settles a save's promise only once its result's row is read, so
    // an earlier change's answer can come after a later one's.
    const kept = lastSaved<string>();
    const later = ["2", "3", "1"];
    kept.saved(later, 3);
    kept.saved(["2", "1"], 2);
    expect(kept.refused()).toBe(later);
  });

  it("forgets a save once the server's list is drawn, and keeps one after it", () => {
    const kept = lastSaved<string>();
    kept.saved(["2", "1"], 1);
    kept.drawn();
    expect(kept.refused()).toBeNull();
    const after = ["1", "2"];
    kept.saved(after, 2);
    expect(kept.refused()).toBe(after);
  });

  it("keeps a save whose answer came after the server's list with it was drawn", () => {
    // Next drew the move's list before the move's own promise settled.
    const kept = lastSaved<string>();
    kept.drawn();
    const moved = ["1", "2", "3", "5", "4"];
    kept.saved(moved, 1);
    expect(kept.refused()).toBe(moved);
    // Drawn again: an older answer still to come is not kept.
    kept.drawn();
    kept.saved(["9"], 1);
    expect(kept.refused()).toBeNull();
  });
});
