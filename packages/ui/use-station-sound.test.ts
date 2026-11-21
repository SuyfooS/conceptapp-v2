import { describe, expect, it } from "vitest";
import { soundOf, soundOnTap } from "./use-station-sound";

// The kitchen's screen's sound in words (waiter mode P8a): the tap that
// opens the screen leaves it on at once where the device plays already, and
// starting where the device takes a moment (an iPad), so the screen never
// flashes "הקשה להפעלת הצליל" for the tap just given; once the device
// answers, it is what the device says.

describe("the station's sound", () => {
  it("is on at once after a tap on a context that runs, and starting on one that doesn't yet", () => {
    expect(soundOnTap({ state: "running" })).toBe("on");
    expect(soundOnTap({ state: "suspended" })).toBe("starting");
  });

  it("follows the device once it answers: on while it runs, else stopped", () => {
    expect(soundOf({ state: "running" })).toBe("on");
    expect(soundOf({ state: "suspended" })).toBe("locked");
    expect(soundOf({ state: "closed" })).toBe("locked");
    expect(soundOf(null)).toBe("locked");
  });
});
