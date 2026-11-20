import { describe, expect, it, vi } from "vitest";
import { newsGate } from "./news-gate";

describe("news on the mode's one toast", () => {
  it("is told at once while no way back is offered", () => {
    const gate = newsGate();
    const show = vi.fn();
    gate.tell(show);
    expect(show).toHaveBeenCalledTimes(1);
    // A toast with nothing to undo is no reason to wait.
    gate.said(false);
    gate.tell(show);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it("never takes the place of a way back, and is told once it has gone", () => {
    const gate = newsGate();
    gate.said(true); // "הוחזר מהשליחה: חומוס" with "ביטול"
    const first = vi.fn();
    const newest = vi.fn();
    gate.tell(first);
    gate.tell(newest);
    expect(first).not.toHaveBeenCalled();
    expect(newest).not.toHaveBeenCalled();
    // Its time is up, or "ביטול" was pressed: the newest news, once.
    gate.hidden();
    expect(first).not.toHaveBeenCalled();
    expect(newest).toHaveBeenCalledTimes(1);
    gate.hidden();
    expect(newest).toHaveBeenCalledTimes(1);
  });

  it("waits out a newer way back, and a plain toast after it", () => {
    const gate = newsGate();
    const show = vi.fn();
    gate.said(true);
    gate.tell(show);
    // Another undo replaced the first before it went: still waiting.
    gate.said(true);
    expect(show).not.toHaveBeenCalled();
    // A plain toast took its place: the news comes when that one goes.
    gate.said(false);
    expect(show).not.toHaveBeenCalled();
    gate.hidden();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("tells newer news in place of what waited, never both", () => {
    const gate = newsGate();
    const older = vi.fn();
    const newer = vi.fn();
    gate.said(true);
    gate.tell(older);
    gate.said(false);
    gate.tell(newer);
    expect(newer).toHaveBeenCalledTimes(1);
    gate.hidden();
    expect(older).not.toHaveBeenCalled();
  });
});
