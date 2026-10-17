import { describe, expect, it } from "vitest";
import { positions, shiftPatterns, shiftsOn } from "./staffing";

const morning = {
  key: "morning",
  name: "Morning",
  days: [0, 1, 2],
  start: "09:00",
  end: "16:00",
  needed: 3,
};
const evening = {
  ...morning,
  key: "evening",
  name: "Evening",
  start: "16:00",
  end: "00:00",
};
const friday = {
  ...morning,
  key: "friday",
  days: [5],
  start: "08:00",
  end: "14:30",
};

describe("positions", () => {
  it("takes keyed, named positions", () => {
    expect(positions.parse([{ key: "cook", name: " Cook " }])).toEqual([
      { key: "cook", name: "Cook" },
    ]);
  });

  it("refuses repeated keys, bad keys and empty names", () => {
    const cook = { key: "cook", name: "Cook" };
    expect(positions.safeParse([cook, cook]).success).toBe(false);
    expect(positions.safeParse([{ key: "Cook", name: "Cook" }]).success).toBe(
      false,
    );
    expect(positions.safeParse([{ key: "cook", name: "  " }]).success).toBe(
      false,
    );
  });
});

describe("shift patterns", () => {
  it("takes shifts, including one that ends at midnight", () => {
    expect(shiftPatterns.parse([morning, evening, friday])).toHaveLength(3);
  });

  it("refuses repeated keys, repeated or missing days and empty shifts", () => {
    expect(shiftPatterns.safeParse([morning, morning]).success).toBe(false);
    for (const bad of [
      { ...morning, days: [1, 1] },
      { ...morning, days: [] },
      { ...morning, days: [7] },
      { ...morning, end: "09:00" },
      { ...morning, needed: 0 },
    ]) {
      expect(shiftPatterns.safeParse([bad]).success).toBe(false);
    }
  });

  it("lists a day's shifts, earliest first", () => {
    const all = shiftPatterns.parse([evening, friday, morning]);
    expect(shiftsOn(all, 1).map((s) => s.key)).toEqual(["morning", "evening"]);
    expect(shiftsOn(all, 5).map((s) => s.key)).toEqual(["friday"]);
    expect(shiftsOn(all, 6)).toEqual([]);
  });
});
