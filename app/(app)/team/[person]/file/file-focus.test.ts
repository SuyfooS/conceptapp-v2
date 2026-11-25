import { describe, expect, it, vi } from "vitest";
import {
  DRAWN_WITHIN_MS,
  focusIfLost,
  focusWhenDrawn,
  type Placed,
  titleAbove,
} from "./file-focus";

/*
 * Where the keyboard's focus goes on a hiring file's screen (profile H6a):
 * to "התיק נעול" when the file locks here and to the file's first heading
 * after a right code, each only when what held the focus went with the part
 * of the screen it was in, never away from where the person put it; and
 * back to a title of the file as it shows again after a hold, once more
 * when the page is drawn if it is lost then.
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

/** A window standing in for the page's: its frames and timers, run by hand. */
function drawings() {
  const frames = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  let next = 1;
  const runAll = (waiting: Map<number, () => void>) => {
    const now = [...waiting.values()];
    waiting.clear();
    for (const run of now) run();
  };
  return {
    win: {
      requestAnimationFrame(run: () => void) {
        frames.set(next, run);
        return next++;
      },
      cancelAnimationFrame(frame: number) {
        frames.delete(frame);
      },
      setTimeout(run: () => void, ms: number) {
        expect(ms).toBe(DRAWN_WITHIN_MS);
        timers.set(next, run);
        return next++;
      },
      clearTimeout(timer: number | undefined) {
        if (timer !== undefined) timers.delete(timer);
      },
    },
    /** The page drawn once: what waited for the frame runs. */
    frame: () => runAll(frames),
    /** The longest wait over. */
    late: () => runAll(timers),
    waiting: () => frames.size + timers.size,
  };
}

describe("focusWhenDrawn", () => {
  it("puts the focus on the title at once, and again once the page is drawn if it is lost then", async () => {
    const page = { activeElement: body as { isConnected: boolean }, body };
    // A title that doesn't take the focus on the drawing that shows it.
    const title = { focus: vi.fn() };
    const { win, frame, waiting } = drawings();
    const { done } = focusWhenDrawn(title, page, win);
    expect(title.focus).toHaveBeenCalledTimes(1);
    frame();
    expect(title.focus).toHaveBeenCalledTimes(1);
    frame();
    expect(title.focus).toHaveBeenCalledTimes(2);
    expect(waiting()).toBe(0);
    expect(await done).toBe(true);
  });

  it("leaves a focus that landed, or one the person put elsewhere meanwhile", async () => {
    const page = { activeElement: body as { isConnected: boolean }, body };
    const title = {
      isConnected: true,
      focus: vi.fn(() => {
        page.activeElement = title;
      }),
    };
    const landed = drawings();
    const first = focusWhenDrawn(title, page, landed.win);
    landed.frame();
    landed.frame();
    expect(await first.done).toBe(true);
    expect(title.focus).toHaveBeenCalledTimes(1);

    // Put on the tab bar before the page was drawn: it stays there.
    page.activeElement = { isConnected: true };
    const other = { focus: vi.fn() };
    const moved = drawings();
    const second = focusWhenDrawn(other, page, moved.win);
    moved.frame();
    moved.frame();
    expect(await second.done).toBe(true);
    expect(other.focus).not.toHaveBeenCalled();
  });

  it("stops waiting for drawings after DRAWN_WITHIN_MS, a page no longer drawn", async () => {
    const page = { activeElement: body as { isConnected: boolean }, body };
    const title = { focus: vi.fn() };
    const { win, late, waiting } = drawings();
    const { done } = focusWhenDrawn(title, page, win);
    late();
    expect(title.focus).toHaveBeenCalledTimes(2);
    expect(waiting()).toBe(0);
    expect(await done).toBe(true);
  });

  // The file closed or held again before the page was drawn: what waits
  // for the focus to land ("התיק נשאר פתוח.") hears false, and says nothing.
  it("ends settled false when stopped, putting nothing more", async () => {
    const page = { activeElement: body as { isConnected: boolean }, body };
    const title = { focus: vi.fn() };
    const { win, frame, waiting } = drawings();
    const { done, stop } = focusWhenDrawn(title, page, win);
    stop();
    expect(waiting()).toBe(0);
    frame();
    frame();
    expect(title.focus).toHaveBeenCalledTimes(1);
    expect(await done).toBe(false);
  });

  it("stays settled true when stopped after the focus landed", async () => {
    const page = { activeElement: body as { isConnected: boolean }, body };
    const title = { focus: vi.fn() };
    const { win, frame } = drawings();
    const { done, stop } = focusWhenDrawn(title, page, win);
    frame();
    frame();
    // The file closing later runs the same stop: the line was said already.
    stop();
    expect(await done).toBe(true);
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
