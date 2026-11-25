import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COUNT_WAITS_MS,
  type FocusLanding,
  filtersRead,
  whenFocused,
} from "./filter-count";

/*
 * The desktop documents table's count after a filter changes
 * (accessibility, part 7): said once the documents it counts are drawn,
 * and once the focus is somewhere again. The page is stood in for.
 */

describe("filtersRead", () => {
  it("is the documents on screen when the person asked is the one read", () => {
    expect(filtersRead({ person: null }, null)).toBe(true);
    expect(filtersRead({ person: "noa" }, "noa")).toBe(true);
    // The server keeps ids in lower case.
    expect(
      filtersRead(
        { person: "0000000A-0000-4000-A000-000000000003" },
        "0000000a-0000-4000-a000-000000000003",
      ),
    ).toBe(true);
  });

  it("waits while another person's documents are on their way, or everyone's", () => {
    expect(filtersRead({ person: "noa" }, null)).toBe(false);
    expect(filtersRead({ person: null }, "noa")).toBe(false);
    expect(filtersRead({ person: "noa" }, "yoav")).toBe(false);
  });
});

/** An element, as far as `focusLost` asks. */
function element(drawn = true) {
  return {
    isConnected: true,
    getClientRects: () => ({ length: drawn ? 1 : 0 }),
    matches: () => false,
    closest: () => null,
    hasAttribute: () => false,
    setAttribute: () => {},
    focus: () => {},
  } as unknown as Element;
}

/** A page whose focus can be moved, telling its listeners as a browser does. */
class Page extends EventTarget implements FocusLanding {
  body = element();
  activeElement: Element | null = this.body;
  querySelectorAll() {
    return [];
  }
  focus(on: Element) {
    this.activeElement = on;
    this.dispatchEvent(new Event("focusin"));
  }
}

describe("whenFocused", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says it at once where the focus is on something", () => {
    const page = new Page();
    page.activeElement = element();
    const say = vi.fn();
    whenFocused(say, { doc: page });
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("waits for the focus to land, as a menu gives its button the focus back, and says it once", () => {
    const page = new Page();
    const say = vi.fn();
    whenFocused(say, { doc: page });
    expect(say).not.toHaveBeenCalled();
    page.focus(element());
    expect(say).toHaveBeenCalledTimes(1);
    page.focus(element());
    vi.advanceTimersByTime(COUNT_WAITS_MS);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("says it after a moment where the focus never lands", () => {
    const page = new Page();
    const say = vi.fn();
    whenFocused(say, { doc: page, ms: 300 });
    vi.advanceTimersByTime(299);
    expect(say).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("says nothing once stopped: a newer count, or the screen gone", () => {
    const page = new Page();
    const say = vi.fn();
    const stop = whenFocused(say, { doc: page });
    stop();
    page.focus(element());
    vi.advanceTimersByTime(COUNT_WAITS_MS);
    expect(say).not.toHaveBeenCalled();
  });

  it("says it at once with no page to wait on", () => {
    const say = vi.fn();
    whenFocused(say, { doc: undefined });
    expect(say).toHaveBeenCalledTimes(1);
  });
});
