import { describe, expect, it } from "vitest";
import {
  afterDecision,
  decideTarget,
  NOTHING_WAITING,
  nextInLine,
  SETTLED_LINE,
  WAITING_TITLE,
} from "./next-request";

/*
 * Where a manager goes on once the request they decided left the list with
 * the focus (accessibility, part 3): the next one down, else the one above,
 * else what was decided.
 */

describe("nextInLine", () => {
  it("goes on down first, nearest first, then back up, nearest first", () => {
    expect(nextInLine(["a", "b", "c", "d"], "b")).toEqual(["c", "d", "a"]);
    expect(nextInLine(["a", "b", "c"], "c")).toEqual(["b", "a"]);
    expect(nextInLine(["a", "b", "c"], "a")).toEqual(["b", "c"]);
  });

  it("has none to go on to when it was the only one", () => {
    expect(nextInLine(["a"], "a")).toEqual([]);
  });

  it("keeps the order of the rest for one no longer listed", () => {
    expect(nextInLine(["a", "b"], "z")).toEqual(["a", "b"]);
  });
});

describe("decideTarget", () => {
  it("finds a request's decision buttons by its id", () => {
    expect(decideTarget("00000000-0000-4000-a000-000000000002")).toBe(
      '[data-decide="00000000-0000-4000-a000-000000000002"]',
    );
  });

  it("keeps a quote or a backslash inside the attribute's value", () => {
    expect(decideTarget('a"b\\c')).toBe('[data-decide="a\\"b\\\\c"]');
  });
});

describe("afterDecision", () => {
  it("tries the next requests, then what was decided, the empty card and the title", () => {
    expect(afterDecision(["a", "b", "c"], "b")).toEqual([
      decideTarget("c"),
      decideTarget("a"),
      SETTLED_LINE,
      NOTHING_WAITING,
      WAITING_TITLE,
    ]);
  });

  it("goes to what was decided once nothing else waits", () => {
    expect(afterDecision(["a"], "a")[0]).toBe(SETTLED_LINE);
  });
});
