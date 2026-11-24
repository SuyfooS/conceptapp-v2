import { describe, expect, it } from "vitest";
import {
  afterPerson,
  afterWrite,
  BUILDER_STATUS,
  listHeading,
  personButton,
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
      '[data-sheet-heading="noAnswer"]',
      '[data-sheet-heading="unavailable"]',
      '[data-sheet-heading="assigned"]',
    ]);
  });

  it("goes to the list's heading after its last person", () => {
    expect(afterPerson("remove", ["noa", "itay"], "itay", "assigned")).toEqual([
      '[data-remove-person="itay"]',
      '[data-sheet-heading="assigned"]',
    ]);
  });

  it("never goes back to the people before", () => {
    expect(
      afterPerson("remove", ["noa", "itay", "shiran"], "itay", "assigned"),
    ).toEqual([
      '[data-remove-person="itay"]',
      '[data-remove-person="shiran"]',
      '[data-sheet-heading="assigned"]',
    ]);
  });

  it("goes to the heading for someone the list no longer has", () => {
    expect(afterPerson("add", ["noa"], "maya", "available")).toEqual([
      '[data-add-person="maya"]',
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
      '[data-sheet-heading="available"]',
      '[data-sheet-heading="assigned"]',
    ]);
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
