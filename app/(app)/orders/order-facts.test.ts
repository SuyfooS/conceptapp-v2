import { describe, expect, it } from "vitest";
import { factsFrom } from "./order-facts";
import type { OrdersFrame } from "./orders-types";

// What the orders' shared parts read (waiter mode P8a): a station's own
// facts when it gives them, else the mode's frame and clock, and nowhere
// else.

const frame: OrdersFrame = {
  business: "b",
  userId: "u",
  viewing: false,
  takes: true,
  runs: true,
  clock: null,
  prepares: [],
  own: [],
  names: { yoav: "Yoav" },
  departments: { kitchen: "Kitchen" },
  departmentOrder: ["kitchen"],
  screens: [],
  lateAfterMinutes: 20,
  timeZone: "Asia/Jerusalem",
};

describe("the orders' facts", () => {
  it("are the mode's frame and clock inside the mode", () => {
    expect(factsFrom(null, { frame, now: 1000 })).toEqual({
      timeZone: "Asia/Jerusalem",
      departments: { kitchen: "Kitchen" },
      names: { yoav: "Yoav" },
      lateAfterMinutes: 20,
      now: 1000,
    });
  });

  it("are a station's own where it gives them, the mode or not", () => {
    const station = {
      timeZone: "Europe/London",
      departments: {},
      names: {},
      lateAfterMinutes: 15,
      now: 5,
    };
    expect(factsFrom(station, null)).toBe(station);
    expect(factsFrom(station, { frame, now: 1000 })).toBe(station);
  });

  it("are nowhere outside both", () => {
    expect(() => factsFrom(null, null)).toThrow();
  });
});
