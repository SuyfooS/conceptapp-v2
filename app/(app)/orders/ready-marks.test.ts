import { describe, expect, it } from "vitest";
import { readyMarks } from "./ready-marks";

describe("what this phone said of a ticket's ready", () => {
  it("leaves out what was marked ready here, whichever read", () => {
    const marks = readyMarks();
    const read = marks.started();
    marks.said("bar-3", true);
    expect(marks.quietFor(read).has("bar-3")).toBe(true);
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(true);
    expect(marks.quiet("bar-3")).toBe(true);
  });

  it("keeps a ticket put back out of a sync that started before the put-back answered", () => {
    const marks = readyMarks();
    // "מוכן" on bar 3, and the sync after it starts (it reads it ready).
    marks.said("bar-3", true);
    const before = marks.started();
    // "ביטול" at once: the put-back answers while that sync still reads.
    marks.said("bar-3", false);
    const after = marks.started();
    // The slower sync answers last, still seeing it ready: no news.
    expect(marks.quietFor(before).has("bar-3")).toBe(true);
    expect(marks.quiet("bar-3")).toBe(true);
    // The sync after the put-back is newer: whatever it reads is so.
    expect(marks.quietFor(after).has("bar-3")).toBe(false);
    expect(marks.quiet("bar-3")).toBe(false);
    // Made ready again elsewhere, a later read tells it.
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(false);
  });

  it("counts the next sync as newer when none ran at the put-back", () => {
    const marks = readyMarks();
    marks.said("bar-3", true);
    marks.said("bar-3", false);
    expect(marks.quiet("bar-3")).toBe(true);
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(false);
  });

  it("leaves out a ticket marked ready again after it was put back", () => {
    const marks = readyMarks();
    const first = marks.started();
    marks.said("bar-3", false);
    marks.said("bar-3", true);
    expect(marks.quietFor(first).has("bar-3")).toBe(true);
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(true);
  });
});
