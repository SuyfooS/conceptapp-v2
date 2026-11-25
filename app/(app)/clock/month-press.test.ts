import { describe, expect, it } from "vitest";
import { createMonthPresses, MONTH_PRESS_MS, monthWay } from "./month-press";

/*
 * A press of the hours card's arrows, kept until the month it leads to is
 * drawn as its own page (accessibility, part 5): taken once by that month of
 * that list, and only while it is recent.
 */

function clock(start = 1_000) {
  let now = start;
  return {
    now: () => now,
    pass: (ms: number) => {
      now += ms;
    },
  };
}

describe("createMonthPresses", () => {
  it("gives the month a press led to its press, once", () => {
    const time = clock();
    const presses = createMonthPresses(time.now);
    presses.note({ list: "history", month: "2026-10", way: "earlier" });
    time.pass(800);
    expect(presses.take("history", "2026-10")).toEqual({
      list: "history",
      month: "2026-10",
      way: "earlier",
      at: 1_000,
    });
    // The same month shown again later (back from another one) takes none.
    expect(presses.take("history", "2026-10")).toBeNull();
  });

  it("keeps the press for its own month and list only", () => {
    const presses = createMonthPresses(clock().now);
    presses.note({ list: "team", month: "2026-12", way: "later" });
    expect(presses.take("team", "2026-11")).toBeNull();
    expect(presses.take("person-noa", "2026-12")).toBeNull();
    expect(presses.take("team", "2026-12")?.way).toBe("later");
  });

  it("keeps only the last press", () => {
    const presses = createMonthPresses(clock().now);
    presses.note({ list: "history", month: "2026-10", way: "earlier" });
    presses.note({ list: "history", month: "2026-12", way: "later" });
    expect(presses.take("history", "2026-10")).toBeNull();
    expect(presses.take("history", "2026-12")?.way).toBe("later");
  });

  it("lets go of a press whose month came too late, by some other way", () => {
    const time = clock();
    const presses = createMonthPresses(time.now);
    presses.note({ list: "history", month: "2026-10", way: "earlier" });
    time.pass(MONTH_PRESS_MS + 1);
    expect(presses.take("history", "2026-10")).toBeNull();
    // Gone for good, not kept for later.
    time.pass(-MONTH_PRESS_MS);
    expect(presses.take("history", "2026-10")).toBeNull();
  });

  it("takes nothing before any press", () => {
    expect(createMonthPresses().take("history", "2026-10")).toBeNull();
  });
});

describe("monthWay", () => {
  it("reads the two arrows, and nothing else", () => {
    expect(monthWay("earlier")).toBe("earlier");
    expect(monthWay("later")).toBe("later");
    for (const other of ["", "next", null, undefined]) {
      expect(monthWay(other)).toBeNull();
    }
  });
});
