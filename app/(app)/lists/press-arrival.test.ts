import { describe, expect, it } from "vitest";
import {
  arrivalTaken,
  cameFromPress,
  leavingFor,
  removedArrival,
  sentArrival,
} from "./press-arrival";

// The way back that takes the focus only right after the press that left
// for it (accessibility, part 8): a list just sent, a template just removed.

describe("an arrival from a press", () => {
  it("is there for the screen right after the press, as often as it draws, until taken", () => {
    leavingFor(sentArrival("list-1"));
    expect(cameFromPress(sentArrival("list-1"))).toBe(true);
    // Drawn again before it is taken (a second drawing): the same.
    expect(cameFromPress(sentArrival("list-1"))).toBe(true);
    arrivalTaken(sentArrival("list-1"));
    // Back to it later, or the address opened again: no press.
    expect(cameFromPress(sentArrival("list-1"))).toBe(false);
  });

  it("is none for a screen no press left for: a reload, another list, another kind", () => {
    expect(cameFromPress(sentArrival("list-2"))).toBe(false);
    leavingFor(sentArrival("list-2"));
    expect(cameFromPress(sentArrival("list-3"))).toBe(false);
    expect(cameFromPress(removedArrival("list-2"))).toBe(false);
    arrivalTaken(sentArrival("list-3"));
    expect(cameFromPress(sentArrival("list-2"))).toBe(true);
    arrivalTaken(sentArrival("list-2"));
  });

  it("is one at a time: a later press replaces an earlier one never taken", () => {
    leavingFor(removedArrival("template-1"));
    leavingFor(sentArrival("list-4"));
    expect(cameFromPress(removedArrival("template-1"))).toBe(false);
    expect(cameFromPress(sentArrival("list-4"))).toBe(true);
    arrivalTaken(sentArrival("list-4"));
  });
});
