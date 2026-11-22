import { describe, expect, it, vi } from "vitest";
import { focusIfLost } from "./file-focus";

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
