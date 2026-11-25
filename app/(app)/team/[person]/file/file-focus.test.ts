import { describe, expect, it, vi } from "vitest";
import { focusIfLost, type Placed, titleAbove } from "./file-focus";

/*
 * Where the keyboard's focus goes on a hiring file's screen (profile H6a):
 * to "התיק נעול" when the file locks here and to the file's first heading
 * after a right code, each only when what held the focus went with the part
 * of the screen it was in, never away from where the person put it.
 */

const body = { isConnected: true };

describe("focusIfLost", () => {
  it("takes the focus that fell to the page", () => {
    const heading = { focus: vi.fn() };
    expect(focusIfLost(heading, { activeElement: body, body })).toBe(true);
    expect(heading.focus).toHaveBeenCalledTimes(1);
  });

  it("takes the focus held by nothing, or by what is gone from the page", () => {
    const heading = { focus: vi.fn() };
    expect(focusIfLost(heading, { activeElement: null, body })).toBe(true);
    // "נעילת התיק", gone with the file, before the browser moved the focus.
    expect(
      focusIfLost(heading, { activeElement: { isConnected: false }, body }),
    ).toBe(true);
    expect(heading.focus).toHaveBeenCalledTimes(2);
  });

  it("leaves the focus where the person put it", () => {
    const heading = { focus: vi.fn() };
    const tabBar = { isConnected: true };
    expect(focusIfLost(heading, { activeElement: tabBar, body })).toBe(false);
    expect(heading.focus).not.toHaveBeenCalled();
  });

  it("moves nothing without a place to put it", () => {
    expect(focusIfLost(null, { activeElement: body, body })).toBe(false);
    expect(focusIfLost(undefined, { activeElement: null, body })).toBe(false);
  });
});

// Elements standing in for the page's, each at its place in page order.
type At = Placed & { name: string; at: number };
const at = (name: string, place: number): At => ({
  name,
  at: place,
  compareDocumentPosition(other) {
    const there = (other as At).at;
    if (there === place) return 0;
    // DOCUMENT_POSITION_FOLLOWING, else DOCUMENT_POSITION_PRECEDING.
    return there > place ? 4 : 2;
  },
});

// "להשאיר פתוח" gone with the focus, the file kept open: the focus lands on
// a title, which an Enter meant for "להשאיר פתוח" can't press.
describe("titleAbove", () => {
  // The file's titles, and its controls between them.
  const identity = at("פרטים מזהים", 0);
  const bank = at("פרטי חשבון", 10);
  const show = at("הצגה", 11);
  const history = at("היסטוריה", 20);
  const lock = at("נעילת התיק", 30);
  const titles = [identity, bank, history];

  it("lands on the title of the part the focus came from, never on the control itself", () => {
    expect(titleAbove(show, titles)).toBe(bank);
    // "נעילת התיק", after the last part's title: that title.
    expect(titleAbove(lock, titles)).toBe(history);
  });

  it("lands on a title the focus came from as it is", () => {
    expect(titleAbove(bank, titles)).toBe(bank);
  });

  it("lands on the file's first title from nowhere, or from before it", () => {
    expect(titleAbove(null, titles)).toBe(identity);
    expect(titleAbove(at("כותרת העמוד", -5), titles)).toBe(identity);
  });

  it("has nowhere to land in a file with no title on screen", () => {
    expect(titleAbove(show, [])).toBeNull();
    expect(titleAbove(null, [])).toBeNull();
  });
});
