import { describe, expect, it } from "vitest";
import {
  cancelSaid,
  INVITE_CANCEL,
  inviteCancelTarget,
  invitesLeft,
  sectionTitle,
} from "./invite-focus";

// Where the focus goes around a deleted invite on the Team screen
// (accessibility, part 6): back on its "מחיקת ההזמנה" in whichever shape is
// on screen, else the section's title while the section stays, else the
// page's. Brought into view as it is: `inViewWhenFocused`, in
// packages/ui/focus-after.test.ts.

describe("inviteCancelTarget", () => {
  it("finds every shape's button for the invite by its id", () => {
    expect(INVITE_CANCEL).toBe("data-invite-cancel");
    expect(inviteCancelTarget("dana")).toBe('[data-invite-cancel="dana"]');
    expect(inviteCancelTarget("3f2c9a10-7b1e-4c55-9d1e-0a7b2c3d4e5f")).toBe(
      '[data-invite-cancel="3f2c9a10-7b1e-4c55-9d1e-0a7b2c3d4e5f"]',
    );
  });

  it("reads any id as itself, quotes and backslashes included", () => {
    expect(inviteCancelTarget('a"b\\c')).toBe(
      '[data-invite-cancel="a\\"b\\\\c"]',
    );
  });
});

describe("sectionTitle", () => {
  it("is the first heading of the section the element is in", () => {
    const heading = { tagName: "H2" } as unknown as Element;
    const asked: string[] = [];
    const section = {
      querySelector(selectors: string) {
        asked.push(selectors);
        return heading;
      },
    };
    const anchor = {
      closest: (selectors: string) =>
        selectors === "section" ? section : null,
    } as unknown as Element;
    expect(sectionTitle(anchor)).toBe(heading);
    expect(asked).toEqual(["h2, h3"]);
  });

  it("is none outside a section, or with nothing to start from", () => {
    const loose = { closest: () => null } as unknown as Element;
    expect(sectionTitle(loose)).toBe(null);
    expect(sectionTitle(null)).toBe(null);
    expect(sectionTitle(undefined)).toBe(null);
  });
});

describe("invitesLeft", () => {
  it("while any of the section's invites is still on screen", () => {
    expect(invitesLeft(["dana", "ron"], new Set(["dana"]))).toBe(true);
    expect(invitesLeft(["dana"], new Set())).toBe(true);
  });

  it("not once every one of them went, or with none", () => {
    expect(invitesLeft(["dana", "ron"], new Set(["dana", "ron"]))).toBe(false);
    expect(invitesLeft([], new Set())).toBe(false);
  });
});

// Who says what became of a deleted invite, in each shape: the desktop's
// table any; a phone's and a tablet's two lists each its own; and the line
// above them a refusal neither list has any more.
describe("cancelSaid", () => {
  /**
   * Which places of the screen say it, with Ido waiting for a link and
   * `listed` the open invites the screen read.
   */
  const saidBy = (
    id: string,
    what: "held" | "refusal",
    listed: readonly string[] = ["dana", "ron"],
  ) =>
    (
      [
        ["table", {}],
        ["pending", { ids: ["ido"] }],
        ["listed", { ids: listed }],
        ["strays", { strays: ["ido", ...listed] }],
      ] as const
    )
      .filter(([, where]) => cancelSaid(id, what, where))
      .map(([name]) => name);

  it("says a held invite's undo in its own list, and in the table", () => {
    expect(saidBy("ido", "held")).toEqual(["table", "pending"]);
    expect(saidBy("dana", "held")).toEqual(["table", "listed"]);
  });

  it("says why one still listed couldn't be deleted under its own list", () => {
    expect(saidBy("ron", "refusal")).toEqual(["table", "listed"]);
    expect(saidBy("ido", "refusal")).toEqual(["table", "pending"]);
  });

  // The review: Dana joined while her deletion waited, the write answered
  // "gone", and the screen, read again, lists her invite no more, so neither
  // list of a phone or a tablet has it: the line above them says it, once.
  it("says a 'gone' refusal whose invite is no longer read above the lists", () => {
    expect(saidBy("dana", "refusal", ["ron"])).toEqual(["table", "strays"]);
    // Never an undo there: one waiting is still listed where it was.
    expect(saidBy("dana", "held", ["ron"])).toEqual(["table"]);
    expect(saidBy("ron", "refusal", ["ron"])).toEqual(["table", "listed"]);
  });
});
