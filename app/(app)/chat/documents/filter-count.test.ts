import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHOSEN_ROW,
  COUNT_WAITS_MS,
  type FocusLanding,
  filtersRead,
  focusChosenRow,
  whenFocused,
} from "./filter-count";

/*
 * The desktop documents table's count after a filter changes
 * (accessibility, part 7): said once the documents it counts are drawn,
 * and once the focus has landed again, out of the menu chosen from; and the
 * row the preview closes onto. The page is stood in for.
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

/** An element, as far as `focusLost` asks: in a menu (`inMenu`), or not. */
function element({ inMenu = false } = {}) {
  return {
    isConnected: true,
    getClientRects: () => ({ length: 1 }),
    matches: () => false,
    closest: (selectors: string) =>
      inMenu && selectors === '[role="menu"]' ? {} : null,
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

  it("waits while a menu has the focus, its choice drawn before it goes, and says it once its button has the focus back", () => {
    const page = new Page();
    // The choice just made: its item still has the focus.
    page.activeElement = element({ inMenu: true });
    const say = vi.fn();
    whenFocused(say, { doc: page });
    expect(say).not.toHaveBeenCalled();
    // To another of its items: still in the menu.
    page.focus(element({ inMenu: true }));
    expect(say).not.toHaveBeenCalled();
    // The menu gone, its button has the focus.
    page.focus(element());
    expect(say).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(COUNT_WAITS_MS);
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("says it after a moment where the focus stays in a menu", () => {
    const page = new Page();
    page.activeElement = element({ inMenu: true });
    const say = vi.fn();
    whenFocused(say, { doc: page, ms: 300 });
    vi.advanceTimersByTime(299);
    expect(say).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
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

/** The chosen row's button, noting how it was given the focus. */
function chosenRow(page: Page) {
  const button = {
    ...(element() as unknown as Record<string, unknown>),
    focused: null as FocusOptions | null | undefined,
    focus(options?: FocusOptions) {
      button.focused = options;
      page.activeElement = button as unknown as Element;
    },
  };
  return button;
}

describe("focusChosenRow", () => {
  it("gives the row the preview came from the focus, brought into view only when a key closed it", () => {
    const page = new Page();
    const row = chosenRow(page);
    const table = {
      querySelectorAll: (selectors: string) =>
        selectors === CHOSEN_ROW ? [row as unknown as Element] : [],
    };
    // The preview's button still has the focus: taken from it all the same.
    page.activeElement = element();
    expect(focusChosenRow(table, { fromKeys: true, doc: page })).toBe(row);
    expect(row.focused).toEqual({ preventScroll: false });
    // A mouse's click: the page stays where it was scrolled to.
    page.activeElement = element();
    expect(focusChosenRow(table, { fromKeys: false, doc: page })).toBe(row);
    expect(row.focused).toEqual({ preventScroll: true });
  });
});
