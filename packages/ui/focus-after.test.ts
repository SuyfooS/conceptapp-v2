import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  arrived,
  canTakeFocus,
  type DocLike,
  FOCUS_LANDING,
  firstOnScreen,
  focusFirst,
  focusLost,
  focusWhenGone,
  onScreen,
  PAGE_TITLE,
  watchFocusIn,
} from "./focus-after";

/*
 * Where the keyboard's focus goes once what held it went (accessibility,
 * part 1). Elements and the page are stood in for: what an element answers
 * here is all the helpers read.
 */

/** A page: what has the focus, its body, and what a selector finds. */
class Page implements DocLike {
  activeElement: Element | null = null;
  body: Element;
  found = new Map<string, Element[]>();
  constructor() {
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
