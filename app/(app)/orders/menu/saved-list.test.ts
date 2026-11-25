import { describe, expect, it } from "vitest";
import { lastSaved } from "./saved-list";

/*
 * What a refusal in the menu's places or categories shows (accessibility,
 * part 9, after CI's third run): the list the latest save went through
 * with, while the server's own list from that answer isn't drawn yet;
 * nothing of its own once it is, so the screen shows the server's.
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
    kept.saved(moved);
    expect(kept.refused()).toBe(moved);
  });

  it("keeps the latest of several saves", () => {
    const kept = lastSaved<string>();
    kept.saved(["2", "1"]);
    const later = ["2", "3", "1"];
    kept.saved(later);
    expect(kept.refused()).toBe(later);
  });

  it("forgets a save once the server's list is drawn, and keeps one after it", () => {
    const kept = lastSaved<string>();
    kept.saved(["2", "1"]);
    kept.drawn();
    expect(kept.refused()).toBeNull();
    const after = ["1", "2"];
    kept.saved(after);
    expect(kept.refused()).toBe(after);
  });
});
