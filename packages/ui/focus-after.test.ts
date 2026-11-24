import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrived,
  canTakeFocus,
  type DocLike,
  FOCUS_LANDING,
  firstOnScreen,
  focusFirst,
  focusLost,
  focusWhenGone,
  landOnTitle,
  onScreen,
  PAGE_TITLE,
  type WatchDrawing,
  watchDrawing,
  watchFocusIn,
} from "./focus-after";

/*
 * Where the keyboard's focus goes once what held it went (accessibility,
 * part 1). Elements and the page are stood in for: what an element answers
 * here is all the helpers read.
 */

/**
 * A page: what has the focus, its body, what a selector finds, and the
 * events a landing listens to (a focus moving, a key, a press).
 */
class Page extends EventTarget implements DocLike {
  activeElement: Element | null = null;
  body: Element;
  found = new Map<string, Element[]>();
  constructor() {
    super();
    this.body = new Spot(this, "body") as unknown as Element;
    this.activeElement = this.body;
  }
  querySelectorAll(selectors: string): Element[] {
    return this.found.get(selectors) ?? [];
  }
}

/** An element on the page, as far as the helpers ask. */
class Spot {
  isConnected = true;
  rects = 1;
  disabled = false;
  inert = false;
  closingDialog = false;
  dialog = false;
  attributes = new Map<string, string>();
  focused: FocusOptions | undefined | null = null;
  constructor(
    readonly page: Page,
    readonly tag = "div",
  ) {}
  getClientRects() {
    return { length: this.rects };
  }
  matches(selectors: string) {
    if (selectors === ":disabled") return this.disabled;
    if (selectors === '[role="dialog"]') return this.dialog;
    // What takes the focus by itself.
    return ["button", "a", "input"].includes(this.tag);
  }
  closest(selectors: string) {
    if (selectors === "[inert]") return this.inert ? this : null;
    if (selectors === '[role="dialog"][data-state="closed"]') {
      return this.closingDialog ? this : null;
    }
    return null;
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  focus(options?: FocusOptions) {
    this.focused = options;
    this.page.activeElement = this as unknown as Element;
    // As a browser does: the page has its new focus by then.
    this.page.dispatchEvent(new Event("focusin"));
  }
}

const el = (spot: Spot) => spot as unknown as Element;

function page() {
  const at = new Page();
  const spot = (tag?: string) => new Spot(at, tag);
  return { at, spot };
}

describe("onScreen and canTakeFocus", () => {
  it("is an element still drawn with a box", () => {
    const { spot } = page();
    const button = spot("button");
    expect(onScreen(button)).toBe(true);
    button.rects = 0;
    expect(onScreen(button)).toBe(false);
    button.rects = 1;
    button.isConnected = false;
    expect(onScreen(button)).toBe(false);
    expect(onScreen(null)).toBe(false);
    expect(onScreen("main h1")).toBe(false);
  });

  it("takes the focus unless disabled or inert", () => {
    const { spot } = page();
    const button = spot("button");
    expect(canTakeFocus(button)).toBe(true);
    button.disabled = true;
    expect(canTakeFocus(button)).toBe(false);
    button.disabled = false;
    button.inert = true;
    expect(canTakeFocus(button)).toBe(false);
  });
});

describe("focusLost", () => {
  it("is lost with nothing, or the body, holding it", () => {
    const { at } = page();
    expect(focusLost(at)).toBe(true);
    at.activeElement = null;
    expect(focusLost(at)).toBe(true);
  });

  it("is lost on an element gone, not drawn, or disabled while it waits", () => {
    const { at, spot } = page();
    const button = spot("button");
    button.focus();
    expect(focusLost(at)).toBe(false);
    button.isConnected = false;
    expect(focusLost(at)).toBe(true);
    button.isConnected = true;
    // A screen kept hidden in an <Activity>.
    button.rects = 0;
    expect(focusLost(at)).toBe(true);
    button.rects = 1;
    button.disabled = true;
    expect(focusLost(at)).toBe(true);
  });

  it("is lost in a sheet that is closing, and on a sheet's own frame", () => {
    const { at, spot } = page();
    const choice = spot("button");
    choice.closingDialog = true;
    choice.focus();
    expect(focusLost(at)).toBe(true);
    const frame = spot();
    frame.dialog = true;
    frame.focus();
    expect(focusLost(at)).toBe(true);
  });

  it("is never lost where there is no page", () => {
    expect(focusLost(undefined)).toBe(false);
  });
});

describe("firstOnScreen", () => {
  it("keeps the order, skips what went, and reads selectors in the root", () => {
    const { at, spot } = page();
    const gone = spot("button");
    gone.isConnected = false;
    const hidden = spot("button");
    hidden.rects = 0;
    const second = spot("button");
    at.found.set("[data-remove]", [el(hidden), el(second)]);
    const later = spot("button");
    expect(
      firstOnScreen([null, el(gone), "[data-remove]", el(later)], at),
    ).toBe(second);
    expect(firstOnScreen([el(later), el(second)], at)).toBe(later);
    expect(firstOnScreen(["[nothing]"], at)).toBeNull();
    expect(firstOnScreen(["[data-remove]"], null)).toBeNull();
  });
});

describe("focusFirst", () => {
  it("focuses the first that can take it, brought into view", () => {
    const { at, spot } = page();
    const disabled = spot("button");
    disabled.disabled = true;
    const button = spot("button");
    expect(focusFirst([el(disabled), el(button)], { doc: at })).toBe(button);
    expect(at.activeElement).toBe(button);
    expect(button.focused).toEqual({ preventScroll: false });
  });

  it("falls back on the page's title, given a tabindex, without moving the page", () => {
    const { at, spot } = page();
    const title = spot("h1");
    at.found.set(PAGE_TITLE, [el(title)]);
    const gone = spot("button");
    gone.isConnected = false;
    expect(focusFirst([el(gone)], { doc: at })).toBe(title);
    expect(title.attributes.get("tabindex")).toBe("-1");
    expect(title.attributes.has(FOCUS_LANDING)).toBe(true);
    expect(title.focused).toEqual({ preventScroll: true });
  });

  it("gives a line a tabindex, never a button", () => {
    const { at, spot } = page();
    const line = spot("p");
    expect(focusFirst([el(line)], { doc: at })).toBe(line);
    expect(line.attributes.get("tabindex")).toBe("-1");
    at.activeElement = at.body;
    const button = spot("button");
    focusFirst([el(button)], { doc: at });
    expect(button.attributes.has("tabindex")).toBe(false);
    expect(button.attributes.has(FOCUS_LANDING)).toBe(false);
  });

  // The browser draws its own ring, in a colour of its own, round a title
  // focused after a key: only what this gave a tabindex is marked for none.
  it("marks what it gave a tabindex for no ring, and only that", () => {
    const { at, spot } = page();
    const title = spot("h1");
    focusFirst([el(title)], { doc: at });
    expect(title.attributes.has(FOCUS_LANDING)).toBe(true);
    at.activeElement = at.body;
    const line = spot("p");
    line.setAttribute("tabindex", "-1");
    focusFirst([el(line)], { doc: at });
    expect(at.activeElement).toBe(line);
    expect(line.attributes.has(FOCUS_LANDING)).toBe(false);
    expect(
      readFileSync("app/globals.css", "utf8").replace(/\s+/g, " "),
    ).toContain(`[${FOCUS_LANDING}]:focus { outline: none; }`);
  });

  it("does nothing while the focus is where the person put it", () => {
    const { at, spot } = page();
    const there = spot("button");
    there.focus();
    const other = spot("button");
    expect(focusFirst([el(other)], { doc: at })).toBeNull();
    expect(at.activeElement).toBe(there);
    expect(focusFirst([el(other)], { doc: at, onlyIfLost: false })).toBe(other);
  });

  it("never focuses the body, and with no title asked for gives nothing", () => {
    const { at, spot } = page();
    at.found.set(PAGE_TITLE, [at.body]);
    expect(focusFirst([at.body], { doc: at })).toBeNull();
    const title = spot("h1");
    at.found.set(PAGE_TITLE, [el(title)]);
    expect(focusFirst([], { doc: at, title: false })).toBeNull();
    expect(at.activeElement).toBe(at.body);
  });

  it("reads its selectors in the root it is given, the title in the page", () => {
    const { at, spot } = page();
    const field = new Page();
    const remove = spot("button");
    field.found.set("[data-file-remove]", [el(remove)]);
    expect(focusFirst(["[data-file-remove]"], { doc: at, root: field })).toBe(
      remove,
    );
  });
});

// What went had the focus: where it lands never moves the page, so
// someone who scrolled on while a hold counted stays where they are.
describe("focusWhenGone", () => {
  it("focuses the first that can take it without moving the page", () => {
    const { at, spot } = page();
    const gone = spot("button");
    gone.isConnected = false;
    const line = spot("p");
    expect(focusWhenGone([el(gone), el(line)], { doc: at })).toBe(line);
    expect(line.focused).toEqual({ preventScroll: true });
  });

  it("falls back on the title, and leaves a focus the person put", () => {
    const { at, spot } = page();
    const title = spot("h1");
    at.found.set(PAGE_TITLE, [el(title)]);
    expect(focusWhenGone([], { doc: at })).toBe(title);
    expect(title.focused).toEqual({ preventScroll: true });
    const there = spot("button");
    there.focus();
    expect(focusWhenGone([el(spot("button"))], { doc: at })).toBeNull();
    expect(at.activeElement).toBe(there);
  });
});

/**
 * The page's drawing, run by the test: `redraw` is the browser saying the
 * page changed. What it calls is kept once stopped, to show a landing that
 * ended moves nothing even then.
 */
function drawing() {
  const watched = { drawn: (() => {}) as () => void, stopped: false };
  const watch: WatchDrawing = (_, drawn) => {
    watched.drawn = drawn;
    return () => {
      watched.stopped = true;
    };
  };
  return { watch, watched, redraw: () => watched.drawn() };
}

/** Home drawn again: the title that had the focus gone, another in its place. */
function drawnAgain(at: Page, gone: Spot, next: Spot) {
  gone.isConnected = false;
  at.found.set(PAGE_TITLE, [el(next)]);
}

// A switch of business that arrived: the first screen to see it may be the
// sidebar's, while Home is still its skeleton, and Next draws Home again
// once the redirect is back. The focus lands on the title Home draws, and
// never takes the person's.
describe("landOnTitle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("puts the focus on the title, and on the one drawn in its place", () => {
    const { at, spot } = page();
    // The pressed row went: the focus is nowhere.
    const row = spot("button");
    row.focus();
    row.isConnected = false;
    const skeleton = spot("h1");
    at.found.set(PAGE_TITLE, [el(skeleton)]);
    const { watch, watched, redraw } = drawing();
    landOnTitle({ ms: 15_000, doc: at, watch });
    expect(at.activeElement).toBe(skeleton);
    expect(skeleton.focused).toEqual({ preventScroll: true });
    // Home drawn whole, in place of its skeleton.
    const title = spot("h1");
    drawnAgain(at, skeleton, title);
    redraw();
    expect(at.activeElement).toBe(title);
    expect(title.attributes.get("tabindex")).toBe("-1");
    expect(title.focused).toEqual({ preventScroll: true });
    // Drawn again with the title still there: nothing moves, nothing ends.
    redraw();
    expect(at.activeElement).toBe(title);
    expect(watched.stopped).toBe(false);
  });

  it("waits for a title not drawn yet", () => {
    const { at, spot } = page();
    const { watch, redraw } = drawing();
    landOnTitle({ ms: 15_000, doc: at, watch });
    expect(at.activeElement).toBe(at.body);
    redraw();
    expect(at.activeElement).toBe(at.body);
    const title = spot("h1");
    at.found.set(PAGE_TITLE, [el(title)]);
    redraw();
    expect(at.activeElement).toBe(title);
  });

  it("leaves a focus that is not lost, and lands once it is", () => {
    // A menu gave its own button the focus back; then the frame is drawn
    // again, and the button with it.
    const { at, spot } = page();
    const menu = spot("button");
    menu.focus();
    const title = spot("h1");
    at.found.set(PAGE_TITLE, [el(title)]);
    const { watch, redraw } = drawing();
    landOnTitle({ ms: 15_000, doc: at, watch });
    expect(at.activeElement).toBe(menu);
    expect(title.focused).toBeNull();
    menu.isConnected = false;
    redraw();
    expect(at.activeElement).toBe(title);
  });

  it("ends once the focus is put anywhere else", () => {
    const { at, spot } = page();
    const first = spot("h1");
    at.found.set(PAGE_TITLE, [el(first)]);
    const { watch, watched, redraw } = drawing();
    landOnTitle({ ms: 15_000, doc: at, watch });
    expect(at.activeElement).toBe(first);
    const card = spot("a");
    card.focus();
    expect(watched.stopped).toBe(true);
    // Even with what it went to gone and the title drawn again.
    card.isConnected = false;
    const next = spot("h1");
    drawnAgain(at, first, next);
    redraw();
    expect(next.focused).toBeNull();
  });

  it("ends on a key or a press", () => {
    for (const type of ["keydown", "pointerdown"]) {
      const { at, spot } = page();
      const first = spot("h1");
      at.found.set(PAGE_TITLE, [el(first)]);
      const { watch, watched, redraw } = drawing();
      landOnTitle({ ms: 15_000, doc: at, watch });
      at.dispatchEvent(new Event(type));
      expect(watched.stopped).toBe(true);
      const next = spot("h1");
      drawnAgain(at, first, next);
      redraw();
      expect(next.focused).toBeNull();
    }
  });

  it("ends when the focus left its title while that is still drawn", () => {
    const { at, spot } = page();
    const first = spot("h1");
    at.found.set(PAGE_TITLE, [el(first)]);
    const { watch, watched, redraw } = drawing();
    landOnTitle({ ms: 15_000, doc: at, watch });
    // Blurred, with no element taking it.
    at.activeElement = at.body;
    redraw();
    expect(watched.stopped).toBe(true);
    expect(at.activeElement).toBe(at.body);
  });

  it("ends when the browser goes back or forward", () => {
    const { at, spot } = page();
    const first = spot("h1");
    at.found.set(PAGE_TITLE, [el(first)]);
    const { watch, watched, redraw } = drawing();
    const history = new EventTarget();
    landOnTitle({ ms: 15_000, doc: at, watch, history });
    history.dispatchEvent(new Event("popstate"));
    expect(watched.stopped).toBe(true);
    // The screen gone back to draws its own title: the focus stays put.
    const next = spot("h1");
    drawnAgain(at, first, next);
    redraw();
    expect(next.focused).toBeNull();
  });

  it("ends after its time", () => {
    const { at, spot } = page();
    const { watch, watched, redraw } = drawing();
    landOnTitle({ ms: 1_000, doc: at, watch });
    vi.advanceTimersByTime(999);
    expect(watched.stopped).toBe(false);
    vi.advanceTimersByTime(1);
    expect(watched.stopped).toBe(true);
    const title = spot("h1");
    at.found.set(PAGE_TITLE, [el(title)]);
    redraw();
    expect(title.focused).toBeNull();
  });

  it("ends on the stop it returns, and listens no more", () => {
    const { at, spot } = page();
    const first = spot("h1");
    at.found.set(PAGE_TITLE, [el(first)]);
    const { watch, watched, redraw } = drawing();
    const stop = landOnTitle({ ms: 15_000, doc: at, watch });
    stop();
    expect(watched.stopped).toBe(true);
    const next = spot("h1");
    drawnAgain(at, first, next);
    redraw();
    expect(next.focused).toBeNull();
    // A second stop does nothing.
    expect(() => stop()).not.toThrow();
  });

  it("does nothing where there is no page", () => {
    expect(() => landOnTitle({ ms: 1_000 })()).not.toThrow();
  });
});

describe("watchDrawing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("watches the body for elements added, removed, shown or hidden, not a tabindex", () => {
    const seen = {
      callback: null as (() => void) | null,
      observed: [] as { target: unknown; options: unknown }[],
      disconnected: false,
    };
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(callback: () => void) {
          seen.callback = callback;
        }
        observe(target: unknown, options: unknown) {
          seen.observed.push({ target, options });
        }
        disconnect() {
          seen.disconnected = true;
        }
      },
    );
    const { at } = page();
    let drawn = 0;
    const stop = watchDrawing(at, () => {
      drawn += 1;
    });
    expect(seen.observed).toEqual([
      {
        target: at.body,
        options: {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "hidden", "inert"],
        },
      },
    ]);
    seen.callback?.();
    expect(drawn).toBe(1);
    stop();
    expect(seen.disconnected).toBe(true);
  });

  it("watches nothing without a MutationObserver", () => {
    const { at } = page();
    expect(() => watchDrawing(at, () => {})()).not.toThrow();
  });
});

/** An element whose focus is watched, with what is inside it. */
class Box extends EventTarget {
  inside = new Set<unknown>();
  contains(node: unknown) {
    return node === this || this.inside.has(node);
  }
}

const focusEvent = (type: string, relatedTarget: unknown = null) =>
  Object.assign(new Event(type), { relatedTarget });

describe("watchFocusIn", () => {
  it("keeps that it had the focus through a fall to nowhere", () => {
    const box = new Box();
    const watch = watchFocusIn(box);
    expect(watch.had()).toBe(false);
    box.dispatchEvent(focusEvent("focusin"));
    expect(watch.had()).toBe(true);
    // The button disabled or removed: the focus went nowhere.
    box.dispatchEvent(focusEvent("focusout"));
    expect(watch.had()).toBe(true);
  });

  it("forgets it on a move outside, and not on one inside", () => {
    const box = new Box();
    const button = {};
    box.inside.add(button);
    const watch = watchFocusIn(box);
    box.dispatchEvent(focusEvent("focusin"));
    box.dispatchEvent(focusEvent("focusout", button));
    expect(watch.had()).toBe(true);
    box.dispatchEvent(focusEvent("focusout", {}));
    expect(watch.had()).toBe(false);
  });

  // React focuses an `autoFocus` button while it draws it, before the
  // effect that watches its row runs.
  it("starts from a focus already inside it", () => {
    const box = new Box();
    const button = {};
    box.inside.add(button);
    expect(
      watchFocusIn(box, { activeElement: button as unknown as Element }).had(),
    ).toBe(true);
    expect(
      watchFocusIn(box, { activeElement: {} as unknown as Element }).had(),
    ).toBe(false);
    expect(watchFocusIn(box, { activeElement: null }).had()).toBe(false);
  });

  it("listens no more once stopped", () => {
    const box = new Box();
    const watch = watchFocusIn(box);
    watch.stop();
    box.dispatchEvent(focusEvent("focusin"));
    expect(watch.had()).toBe(false);
  });
});

// A screen shown again from a hidden <Activity> runs its effects again with
// what arrived long ago: the focus moves only when it first arrives.
describe("arrived", () => {
  it("says a value has arrived once, and not when the effect runs again with it", () => {
    const seen = { current: null as object | null };
    const refusal = { failure: "failed" };
    expect(arrived(seen, refusal)).toBe(true);
    expect(arrived(seen, refusal)).toBe(false);
    expect(arrived(seen, refusal)).toBe(false);
  });

  it("takes nothing there for nothing arrived, and keeps what was seen", () => {
    const seen = { current: null as object | null };
    expect(arrived(seen, null)).toBe(false);
    const card = { shifts: 2 };
    expect(arrived(seen, card)).toBe(true);
    expect(arrived(seen, null)).toBe(false);
    expect(arrived(seen, card)).toBe(false);
  });

  it("says a new one has arrived, even with the same words (a refusal again)", () => {
    const seen = { current: null as object | null };
    expect(arrived(seen, { failure: "failed" })).toBe(true);
    expect(arrived(seen, { failure: "failed" })).toBe(true);
  });
});
