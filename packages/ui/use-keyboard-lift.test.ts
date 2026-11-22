import { createElement, createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  KEYBOARD_MIN,
  type KeyboardWindow,
  keepFocusInView,
  keyboardLift,
  NO_KEYBOARD,
  nearestScroll,
  SETTLE_MS,
  sheetLiftStyle,
  useKeyboardLift,
  watchKeyboard,
} from "./use-keyboard-lift";

/*
 * Sheets over the phone's keyboard (Orel, 22 November 2026): the keyboard
 * covers the layout viewport's foot, where a sheet stands, and the visual
 * viewport says how far. A phone 844px tall: iOS keeps the layout viewport
 * at 844 with its keyboard up, Android Chrome by default too.
 */

const TALL = 844;

describe("keyboardLift", () => {
  it("lifts nothing with no keyboard, on a phone, a tablet or a desktop", () => {
    for (const layoutHeight of [TALL, 1180, 900]) {
      expect(
        keyboardLift({
          layoutHeight,
          height: layoutHeight,
          offsetTop: 0,
          scale: 1,
        }),
      ).toEqual(NO_KEYBOARD);
    }
    expect(keyboardLift(null)).toEqual(NO_KEYBOARD);
    expect(keyboardLift(undefined)).toEqual(NO_KEYBOARD);
  });

  it("lifts by the keyboard on iOS, the layout viewport left as it was", () => {
    expect(
      keyboardLift({ layoutHeight: TALL, height: 508, offsetTop: 0, scale: 1 }),
    ).toEqual({ inset: 336, room: 508 });
  });

  it("lifts by the keyboard on Android, which shrinks only the visual viewport", () => {
    expect(
      keyboardLift({ layoutHeight: TALL, height: 544, offsetTop: 0, scale: 1 }),
    ).toEqual({ inset: 300, room: 544 });
  });

  it("lifts nothing where the browser shrinks the layout viewport with it", () => {
    // Firefox, or a page that asks Chrome to resize its content: the fixed
    // sheet moves up with the layout viewport already.
    expect(
      keyboardLift({ layoutHeight: 544, height: 544, offsetTop: 0, scale: 1 }),
    ).toEqual(NO_KEYBOARD);
  });

  // iOS moves the visual viewport down the page to show a field: the foot
  // already shows by that much, and the room over the keyboard stays.
  it("lifts less as iOS moves the visual viewport down, and nothing once the foot shows", () => {
    const at = (offsetTop: number) =>
      keyboardLift({ layoutHeight: TALL, height: 508, offsetTop, scale: 1 });
    expect(at(100)).toEqual({ inset: 236, room: 508 });
    expect(at(336)).toEqual({ inset: 0, room: 508 });
    // Bounced past the foot: never below 0.
    expect(at(360)).toEqual({ inset: 0, room: 508 });
  });

  it("lifts nothing for a pinch, wherever it moves the visual viewport", () => {
    // Zoomed in twice: the visual viewport is half the page, moved down it.
    // Read as a keyboard, it would lift the sheet by 222px.
    expect(
      keyboardLift({
        layoutHeight: TALL,
        height: 422,
        offsetTop: 200,
        scale: 2,
      }),
    ).toEqual(NO_KEYBOARD);
    expect(
      keyboardLift({ layoutHeight: TALL, height: 211, offsetTop: 0, scale: 2 }),
    ).toEqual(NO_KEYBOARD);
  });

  it("follows the phone turned, with the keyboard up and without it", () => {
    expect(
      keyboardLift({ layoutHeight: 390, height: 190, offsetTop: 0, scale: 1 }),
    ).toEqual({ inset: 200, room: 190 });
    expect(
      keyboardLift({ layoutHeight: 390, height: 390, offsetTop: 0, scale: 1 }),
    ).toEqual(NO_KEYBOARD);
  });

  it("takes less than a keyboard for none, and rounds towards more room", () => {
    expect(
      keyboardLift({
        layoutHeight: TALL,
        height: TALL - KEYBOARD_MIN + 1,
        offsetTop: 0,
        scale: 1,
      }),
    ).toEqual(NO_KEYBOARD);
    expect(
      keyboardLift({
        layoutHeight: TALL,
        height: 507.6,
        offsetTop: 0,
        scale: 1,
      }),
    ).toEqual({ inset: 337, room: 507 });
    expect(
      keyboardLift({
        layoutHeight: Number.NaN,
        height: 508,
        offsetTop: 0,
        scale: 1,
      }),
    ).toEqual(NO_KEYBOARD);
  });
});

describe("sheetLiftStyle", () => {
  it("stands the sheet 8px over the keyboard, within what is on screen", () => {
    expect(sheetLiftStyle({ inset: 336, room: 508 })).toEqual({
      "--sheet-bottom": "344px",
      "--sheet-max": "calc(492px - env(safe-area-inset-top))",
    });
    // iOS showing the foot: 8px over the keyboard, no safe area under it.
    expect(sheetLiftStyle({ inset: 0, room: 508 })).toEqual({
      "--sheet-bottom": "8px",
      "--sheet-max": "calc(492px - env(safe-area-inset-top))",
    });
  });

  it("gives nothing with no keyboard, so the sheet stays where it was", () => {
    expect(sheetLiftStyle(NO_KEYBOARD)).toBeUndefined();
  });
});

describe("nearestScroll", () => {
  const view = { top: 100, bottom: 400 };

  it("leaves a field that shows, or fills the view", () => {
    expect(nearestScroll(view, { top: 150, bottom: 200 })).toBe(0);
    expect(nearestScroll(view, { top: 50, bottom: 450 })).toBe(0);
  });

  it("moves down to a field below, and up to one above, by the nearer edge", () => {
    expect(nearestScroll(view, { top: 420, bottom: 468 })).toBe(68);
    expect(nearestScroll(view, { top: 40, bottom: 88 })).toBe(-60);
  });

  it("keeps the gap from the edge", () => {
    expect(nearestScroll(view, { top: 420, bottom: 468 }, 12)).toBe(80);
    expect(nearestScroll(view, { top: 105, bottom: 150 }, 12)).toBe(-7);
  });

  it("shows the top of a field taller than the view", () => {
    expect(nearestScroll(view, { top: 300, bottom: 700 })).toBe(200);
    expect(nearestScroll(view, { top: -300, bottom: 200 })).toBe(-200);
  });
});

/** A visual viewport whose keyboard opens, closes, and moves it. */
class View extends EventTarget {
  height: number;
  offsetTop = 0;
  scale = 1;
  listening = 0;

  constructor(height: number) {
    super();
    this.height = height;
  }

  set(change: Partial<Pick<View, "height" | "offsetTop" | "scale">>) {
    Object.assign(this, change);
    this.dispatchEvent(new Event("resize"));
  }

  move(offsetTop: number) {
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event("scroll"));
  }

  override addEventListener(
    ...args: Parameters<EventTarget["addEventListener"]>
  ) {
    this.listening += 1;
    super.addEventListener(...args);
  }

  override removeEventListener(
    ...args: Parameters<EventTarget["removeEventListener"]>
  ) {
    this.listening -= 1;
    super.removeEventListener(...args);
  }
}

/** A window with its own clock, and a visual viewport or none. */
class Win extends EventTarget {
  innerHeight: number;
  visualViewport: View | null;
  timers = new Map<number, { run: () => void; ms: number }>();
  next = 1;

  constructor(height: number, view = true) {
    super();
    this.innerHeight = height;
    this.visualViewport = view ? new View(height) : null;
  }

  setTimeout = ((run: () => void, ms: number) => {
    const id = this.next++;
    this.timers.set(id, { run, ms });
    return id;
  }) as unknown as Window["setTimeout"];

  clearTimeout = ((id: number | undefined) => {
    if (id !== undefined) this.timers.delete(id);
  }) as unknown as Window["clearTimeout"];

  /** The time to settle passes. */
  settle() {
    const due = [...this.timers.values()];
    this.timers.clear();
    for (const { run } of due) run();
  }

  /** The phone turned: both viewports change, and the window says so. */
  turn(height: number, view: number) {
    this.innerHeight = height;
    if (this.visualViewport) this.visualViewport.height = view;
    this.dispatchEvent(new Event("resize"));
  }
}

const asWin = (win: Win) => win as unknown as KeyboardWindow;

describe("watchKeyboard", () => {
  it("reads the keyboard at once, and as it opens and closes", () => {
    const win = new Win(TALL);
    const view = win.visualViewport as View;
    const onLift = vi.fn();
    watchKeyboard(asWin(win), { onLift });
    // Nothing up as the sheet opens: nothing said.
    expect(onLift).not.toHaveBeenCalled();
    view.set({ height: 508 });
    expect(onLift).toHaveBeenLastCalledWith({ inset: 336, room: 508 });
    view.set({ height: TALL });
    expect(onLift).toHaveBeenLastCalledWith(NO_KEYBOARD);
    expect(onLift).toHaveBeenCalledTimes(2);
  });

  it("reads a keyboard already up when the sheet opens", () => {
    const win = new Win(TALL);
    (win.visualViewport as View).height = 544;
    const onLift = vi.fn();
    watchKeyboard(asWin(win), { onLift });
    expect(onLift).toHaveBeenCalledWith({ inset: 300, room: 544 });
  });

  it("follows iOS moving the visual viewport, and says nothing when nothing changed", () => {
    const win = new Win(TALL);
    const view = win.visualViewport as View;
    const onLift = vi.fn();
    watchKeyboard(asWin(win), { onLift });
    view.set({ height: 508 });
    view.move(336);
    expect(onLift).toHaveBeenLastCalledWith({ inset: 0, room: 508 });
    view.move(336);
    view.set({ height: 508 });
    expect(onLift).toHaveBeenCalledTimes(2);
  });

  it("lifts nothing for a pinch", () => {
    const win = new Win(TALL);
    const view = win.visualViewport as View;
    const onLift = vi.fn();
    watchKeyboard(asWin(win), { onLift });
    view.set({ height: 422, scale: 2 });
    view.move(200);
    expect(onLift).not.toHaveBeenCalled();
  });

  it("follows the phone turned", () => {
    const win = new Win(TALL);
    const view = win.visualViewport as View;
    const onLift = vi.fn();
    watchKeyboard(asWin(win), { onLift });
    view.set({ height: 508 });
    win.turn(390, 190);
    expect(onLift).toHaveBeenLastCalledWith({ inset: 200, room: 190 });
  });

  it("measures the layout viewport where it is given, else takes innerHeight", () => {
    // Safari's innerHeight can follow the visual viewport: the scrim's
    // height is the layout viewport's.
    const win = new Win(508);
    const view = win.visualViewport as View;
    view.height = 508;
    const onLift = vi.fn();
    watchKeyboard(asWin(win), { onLift, layoutHeight: () => TALL });
    expect(onLift).toHaveBeenLastCalledWith({ inset: 336, room: 508 });

    const bare = new Win(TALL);
    (bare.visualViewport as View).height = 508;
    const onBare = vi.fn();
    watchKeyboard(asWin(bare), { onLift: onBare, layoutHeight: () => 0 });
    expect(onBare).toHaveBeenLastCalledWith({ inset: 336, room: 508 });
  });

  it("brings the field into sight once the keyboard stands still, not on its way", () => {
    const win = new Win(TALL);
    const view = win.visualViewport as View;
    const onSettled = vi.fn();
    watchKeyboard(asWin(win), { onLift: () => {}, onSettled });
    // Android sends a resize each step of the keyboard's way up.
    view.set({ height: 700 });
    view.set({ height: 600 });
    view.set({ height: 544 });
    expect(win.timers.size).toBe(1);
    expect([...win.timers.values()][0]?.ms).toBe(SETTLE_MS);
    expect(onSettled).not.toHaveBeenCalled();
    win.settle();
    expect(onSettled).toHaveBeenCalledTimes(1);
    // The keyboard closing brings nothing into sight.
    view.set({ height: TALL });
    expect(win.timers.size).toBe(0);
  });

  it("listens no more once stopped, and brings nothing into sight after", () => {
    const win = new Win(TALL);
    const view = win.visualViewport as View;
    const onLift = vi.fn();
    const onSettled = vi.fn();
    let windowListening = 0;
    const add = win.addEventListener.bind(win);
    const remove = win.removeEventListener.bind(win);
    win.addEventListener = (...args: Parameters<typeof add>) => {
      windowListening += 1;
      add(...args);
    };
    win.removeEventListener = (...args: Parameters<typeof remove>) => {
      windowListening -= 1;
      remove(...args);
    };
    const stop = watchKeyboard(asWin(win), { onLift, onSettled });
    expect(view.listening).toBe(2);
    expect(windowListening).toBe(1);
    view.set({ height: 508 });
    stop();
    expect(view.listening).toBe(0);
    expect(windowListening).toBe(0);
    expect(win.timers.size).toBe(0);
    view.set({ height: TALL });
    win.turn(390, 190);
    expect(onLift).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("lifts nothing, ever, where there is no visualViewport", () => {
    const win = new Win(TALL, false);
    const onLift = vi.fn();
    const stop = watchKeyboard(asWin(win), { onLift });
    win.turn(508, 508);
    stop();
    expect(onLift).not.toHaveBeenCalled();
  });
});

describe("keepFocusInView", () => {
  /** A sheet's body from 100 to 400 on screen, and what has the focus in it. */
  function body(field: { top: number; bottom: number } | null, inside = true) {
    const focused = field
      ? { getBoundingClientRect: () => ({ ...field }) }
      : null;
    const scroller = {
      scrollTop: 40,
      ownerDocument: { activeElement: focused },
      contains: (node: unknown) => inside && node === focused,
      getBoundingClientRect: () => ({ top: 100, bottom: 400 }),
    };
    return scroller;
  }
  const keep = (scroller: ReturnType<typeof body>) =>
    keepFocusInView(scroller as unknown as HTMLElement);

  it("scrolls the body alone to the field, 12px clear of its edge", () => {
    const scroller = body({ top: 420, bottom: 468 });
    keep(scroller);
    expect(scroller.scrollTop).toBe(40 + 80);
  });

  it("leaves a field that shows, one outside the body, and no focus at all", () => {
    for (const scroller of [
      body({ top: 150, bottom: 200 }),
      body({ top: 420, bottom: 468 }, false),
      body(null),
    ]) {
      keep(scroller);
      expect(scroller.scrollTop).toBe(40);
    }
    expect(() => keepFocusInView(null)).not.toThrow();
  });
});

/** What the hook gives a sheet not drawn yet. */
function Probe() {
  const lift = useKeyboardLift(null, createRef<HTMLElement>());
  return createElement("p", null, `${lift.inset} ${lift.room}`);
}

describe("useKeyboardLift", () => {
  it("lifts nothing on the server, before the sheet is drawn", () => {
    expect(renderToString(createElement(Probe))).toBe("<p>0 null</p>");
  });
});
