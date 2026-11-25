import { describe, expect, it } from "vitest";
import { clockState, closeHeldForRefusal, pressOver } from "./clock-focus";

/*
 * When the clock puts the focus back after a press of its own buttons
 * (accessibility, part 5): once nothing is on its way and the screen the
 * press led to is drawn, or the press was refused. A held Enter is
 * `@ui/focus-after`'s (`ignoreHeldEnter`).
 */

describe("clockState", () => {
  it("tells apart off the clock, at work and on a break", () => {
    const off = clockState(null, null);
    const working = clockState({ id: "e1" }, null);
    const onBreak = clockState({ id: "e1" }, { id: "b1" });
    expect(new Set([off, working, onBreak]).size).toBe(3);
  });

  it("tells one shift from another, and one break from the next", () => {
    expect(clockState({ id: "e1" }, null)).not.toBe(
      clockState({ id: "e2" }, null),
    );
    expect(clockState({ id: "e1" }, { id: "b1" })).not.toBe(
      clockState({ id: "e1" }, { id: "b2" }),
    );
  });
});

describe("pressOver", () => {
  const working = clockState({ id: "e1" }, null);
  const onBreak = clockState({ id: "e1" }, { id: "b1" });

  it("is never over without a press", () => {
    expect(pressOver(null, { busy: false, state: onBreak })).toBe(false);
  });

  it("waits while something is on its way", () => {
    const press = { from: working, refused: false };
    expect(pressOver(press, { busy: true, state: onBreak })).toBe(false);
    expect(
      pressOver({ ...press, refused: true }, { busy: true, state: working }),
    ).toBe(false);
  });

  it("is over once the screen the press led to is drawn", () => {
    const press = { from: working, refused: false };
    expect(pressOver(press, { busy: false, state: onBreak })).toBe(true);
  });

  it("waits for that screen when the answer came first", () => {
    const press = { from: working, refused: false };
    expect(pressOver(press, { busy: false, state: working })).toBe(false);
  });

  it("is over at once for a refusal, which changes nothing", () => {
    const press = { from: working, refused: true };
    expect(pressOver(press, { busy: false, state: working })).toBe(true);
  });
});

// "כניסה בלי קוד" refused (the third check): the sheet says why only once
// the page read again is drawn, so a close meanwhile would lose it.
describe("closeHeldForRefusal", () => {
  it("keeps the close while a refusal waits to be said", () => {
    expect(
      closeHeldForRefusal(false, { failure: "alreadyIn", said: null }),
    ).toBe(true);
  });

  it("lets it close once said, or with nothing refused", () => {
    expect(
      closeHeldForRefusal(false, { failure: "alreadyIn", said: "alreadyIn" }),
    ).toBe(false);
    expect(closeHeldForRefusal(false, { failure: null, said: null })).toBe(
      false,
    );
  });

  it("holds for a new refusal while an older one is still shown", () => {
    expect(
      closeHeldForRefusal(false, { failure: "noAccess", said: "alreadyIn" }),
    ).toBe(true);
  });

  it("never holds an opening", () => {
    expect(
      closeHeldForRefusal(true, { failure: "alreadyIn", said: null }),
    ).toBe(false);
  });
});
