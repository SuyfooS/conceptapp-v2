import { describe, expect, it } from "vitest";
import {
  afterDecision,
  NOTHING_WAITING,
  nextInLine,
  requestTarget,
  WAITING_TITLE,
} from "./next-request";

/*
 * Where a manager goes on once the request they decided left the list with
 * the focus (accessibility, part 3): the next one's heading down, else the
 * one above, else the card saying nothing waits.
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

describe("requestTarget", () => {
  it("finds a request's heading by its id", () => {
    expect(requestTarget("00000000-0000-4000-a000-000000000002")).toBe(
      '[data-request-target="00000000-0000-4000-a000-000000000002"]',
    );
  });

  it("keeps a quote or a backslash inside the attribute's value", () => {
    expect(requestTarget('a"b\\c')).toBe('[data-request-target="a\\"b\\\\c"]');
  });
});

describe("afterDecision", () => {
  // The headings, not the decision buttons: Enter held on a decided
  // "אישור" would go on to approve the next. And not the line of what was
  // decided: its live region says it, so the focus there would say it twice.
  it("tries the next requests' headings, then the empty card and the title", () => {
    expect(afterDecision(["a", "b", "c"], "b")).toEqual([
      requestTarget("c"),
      requestTarget("a"),
      NOTHING_WAITING,
      WAITING_TITLE,
    ]);
  });

  it("goes to the card saying nothing waits once nothing else does", () => {
    expect(afterDecision(["a"], "a")[0]).toBe(NOTHING_WAITING);
  });
});
