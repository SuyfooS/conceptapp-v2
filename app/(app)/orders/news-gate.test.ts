import { describe, expect, it, vi } from "vitest";
import { newsGate } from "./news-gate";

/** A telling that says something. */
const says = () => vi.fn(() => true);

describe("news on the mode's one toast", () => {
  it("is told at once while no way back is offered", () => {
    const gate = newsGate();
    const show = says();
    gate.tell("ready", show);
    expect(show).toHaveBeenCalledTimes(1);
    // A toast with nothing to undo is no reason to wait.
    gate.said(false);
    gate.tell("ready", show);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it("never takes the place of a way back, and is told once it has gone", () => {
    const gate = newsGate();
    gate.said(true); // "הוחזר מהשליחה: חומוס" with "ביטול"
    const first = says();
    const newest = says();
    gate.tell("ready", first);
    gate.tell("ready", newest);
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
    const show = says();
    gate.said(true);
    gate.tell("ready", show);
    // Another undo replaced the first before it went: still waiting.
    gate.said(true);
    expect(show).not.toHaveBeenCalled();
    // A plain toast took its place: the news comes when that one goes.
    gate.said(false);
    expect(show).not.toHaveBeenCalled();
    gate.hidden();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("keeps a round that landed and what turned ready apart, and tells each in turn", () => {
    const gate = newsGate();
    // "הוגש" with "ביטול" at table 6.
    gate.said(true);
    const sent = says();
    const ready = says();
    // Table 4's round lands, then a ticket turns ready: neither drops the other.
    gate.tell("sent:round-4", sent);
    gate.tell("ready", ready);
    gate.hidden();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
    // The sent toast is drawn (no way back): the ready news waits for it,
    // and another round that lands waits behind that.
    gate.said(false);
    const later = says();
    gate.tell("sent:round-6", later);
    expect(ready).not.toHaveBeenCalled();
    gate.hidden();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(later).not.toHaveBeenCalled();
    gate.hidden();
    expect(later).toHaveBeenCalledTimes(1);
    // Nothing waits now: the next is told at once.
    gate.hidden();
    const next = says();
    gate.tell("ready", next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("tells the next at once when what came first has nothing left to say", () => {
    const gate = newsGate();
    gate.said(true);
    // Ready news whose ticket was served meanwhile, then a round that landed.
    const nothing = vi.fn(() => false);
    const sent = says();
    gate.tell("ready", nothing);
    gate.tell("sent:round-4", sent);
    gate.hidden();
    expect(nothing).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("tells newer news about the same in place of what waited, never both", () => {
    const gate = newsGate();
    const older = says();
    const newer = says();
    gate.said(true);
    gate.tell("ready", older);
    gate.said(false);
    gate.tell("ready", newer);
    gate.hidden();
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
  });
});
