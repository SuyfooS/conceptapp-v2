import { describe, expect, it } from "vitest";
import {
  afterPerson,
  afterWrite,
  BUILDER_STATUS,
  listHeading,
  type PlacedAfterWrite,
  personButton,
  placeAfterWrite,
  runningLineAfter,
  SHARE_WEEK,
} from "./builder-focus";

// Where the builder puts the focus once what held it went (accessibility,
// part 4): the selectors `focusFirst` reads, in order.
describe("afterPerson", () => {
  it("goes to the next person's same button, then the list's heading, then the lists after it", () => {
    expect(
      afterPerson("add", ["uri", "omer", "dana"], "uri", "noAnswer", [
        "unavailable",
        "assigned",
      ]),
    ).toEqual([
      '[data-add-person="uri"]',
      '[data-add-person="omer"]',
      '[data-add-person="dana"]',
      "[data-running-line]",
      '[data-sheet-heading="noAnswer"]',
      '[data-sheet-heading="unavailable"]',
      '[data-sheet-heading="assigned"]',
    ]);
  });

  it("goes to the list's heading after its last person", () => {
    expect(afterPerson("remove", ["noa", "itay"], "itay", "assigned")).toEqual([
      '[data-remove-person="itay"]',
      "[data-running-line]",
      '[data-sheet-heading="assigned"]',
    ]);
  });

  it("never goes back to the people before", () => {
    expect(
      afterPerson("remove", ["noa", "itay", "shiran"], "itay", "assigned"),
    ).toEqual([
      '[data-remove-person="itay"]',
      '[data-remove-person="shiran"]',
      "[data-running-line]",
      '[data-sheet-heading="assigned"]',
    ]);
  });

  it("goes to the heading for someone the list no longer has", () => {
    expect(afterPerson("add", ["noa"], "maya", "available")).toEqual([
      '[data-add-person="maya"]',
      "[data-running-line]",
      '[data-sheet-heading="available"]',
    ]);
  });

  // A press takes the person's own button away for good, so it is never
  // found then; the sheet drawn again as the clock reaches the shift draws
  // it again, and the focus stays on that person, not the next.
  it("tries the person's own button first", () => {
    expect(
      afterPerson("add", ["omer", "michal"], "omer", "available", ["assigned"]),
    ).toEqual([
      '[data-add-person="omer"]',
      '[data-add-person="michal"]',
      "[data-running-line]",
      '[data-sheet-heading="available"]',
      '[data-sheet-heading="assigned"]',
    ]);
  });

  // The clock took every "×" (all on it kept as it begins) or every "+"
  // (nobody joins once it is over): the line that says why comes before the
  // headings, which come after it on the sheet. A press under way takes a
  // button away too, and the line of the stage the sheet stood at is no
  // reason for that.
  it("goes to the line that says the shift began or ended, once the clock moved it on", () => {
    expect(afterPerson("remove", ["roni"], "roni", "assigned")).toEqual([
      '[data-remove-person="roni"]',
      "[data-running-line]",
      '[data-sheet-heading="assigned"]',
    ]);
    expect(
      afterPerson("add", ["omer"], "omer", "available", ["assigned"], "now"),
    ).toEqual([
      '[data-add-person="omer"]',
      '[data-running-line]:not([data-running-line="now"])',
      '[data-sheet-heading="available"]',
      '[data-sheet-heading="assigned"]',
    ]);
  });
});

describe("runningLineAfter", () => {
  it("is any such line before the shift began, and only a later stage's after", () => {
    expect(runningLineAfter(null)).toBe("[data-running-line]");
    expect(runningLineAfter("now")).toBe(
      '[data-running-line]:not([data-running-line="now"])',
    );
    expect(runningLineAfter("over")).toBe(
      '[data-running-line]:not([data-running-line="over"])',
    );
  });
});

describe("personButton and listHeading", () => {
  it("quote what they are given, quotes and backslashes too", () => {
    expect(personButton("add", 'a"b\\c')).toBe(
      '[data-add-person="a\\"b\\\\c"]',
    );
    expect(personButton("remove", "7c1e")).toBe('[data-remove-person="7c1e"]');
    expect(listHeading("busy")).toBe('[data-sheet-heading="busy"]');
  });
});

describe("afterWrite", () => {
  it("goes to sharing after a first publish, else to where the week stands", () => {
    expect(afterWrite(true)).toEqual([SHARE_WEEK, BUILDER_STATUS]);
    expect(afterWrite(false)).toEqual([BUILDER_STATUS]);
  });
});

// Once per write, and once more for its own reading after the toast; never
// for a reading after that, nor for the same write shown again.
describe("placeAfterWrite", () => {
  const saved = "2026-11-24T08:00:00.000Z";
  const later = "2026-11-24T08:05:00.000Z";

  it("places nothing without a write's toast", () => {
    expect(placeAfterWrite(null, null, true)).toBeNull();
    expect(placeAfterWrite({ at: saved, waiting: false }, null, false)).toBe(
      null,
    );
  });

  it("places the focus once a write's toast shows, its reading come or not", () => {
    expect(placeAfterWrite(null, saved, true)).toEqual({
      at: saved,
      waiting: true,
    });
    expect(placeAfterWrite(null, saved, false)).toEqual({
      at: saved,
      waiting: false,
    });
  });

  it("places it once more when the write's own reading comes after the toast", () => {
    const first = placeAfterWrite(null, saved, true);
    expect(first).toEqual({ at: saved, waiting: true });
    const again = placeAfterWrite(first, saved, false);
    expect(again).toEqual({ at: saved, waiting: false });
    // A reading after that one (another manager's write): nothing moves.
    expect(placeAfterWrite(again, saved, false)).toBeNull();
  });

  it("places nothing for a reading after a write whose own came with it", () => {
    const seen: PlacedAfterWrite = { at: saved, waiting: false };
    expect(placeAfterWrite(seen, saved, false)).toBeNull();
  });

  it("places nothing for the same write shown again", () => {
    // A screen shown again from a hidden <Activity>, its reading still to come.
    expect(placeAfterWrite({ at: saved, waiting: true }, saved, true)).toBe(
      null,
    );
  });

  it("places it for the next write", () => {
    expect(placeAfterWrite({ at: saved, waiting: false }, later, true)).toEqual(
      { at: later, waiting: true },
    );
  });
});
