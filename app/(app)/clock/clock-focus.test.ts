import { describe, expect, it } from "vitest";
import { clockState, ignoreHeldEnter, pressOver } from "./clock-focus";

/*
 * When the clock puts the focus back after a press of its own buttons
 * (accessibility, part 5): once nothing is on its way and the screen the
 * press led to is drawn, or the press was refused; and a held Enter that
 * would press what took the pressed button's place.
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

describe("ignoreHeldEnter", () => {
  const key = (name: string, repeat: boolean) => {
    const event = {
      key: name,
      repeat,
      prevented: false,
      preventDefault() {
        event.prevented = true;
      },
    };
    return event;
  };

  it("stops Enter held down from pressing what took the focus", () => {
    const held = key("Enter", true);
    ignoreHeldEnter(held);
    expect(held.prevented).toBe(true);
  });

  it("leaves a first Enter, and every other key, as they are", () => {
    for (const event of [key("Enter", false), key(" ", true), key("a", true)]) {
      ignoreHeldEnter(event);
      expect(event.prevented).toBe(false);
    }
  });
});
