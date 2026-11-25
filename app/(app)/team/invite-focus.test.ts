import { describe, expect, it } from "vitest";
import {
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
