import { describe, expect, it, vi } from "vitest";
import {
  type PageVisibility,
  type PageWindow,
  revealWhileShown,
  watchShown,
} from "./masked-value";

/*
 * "הצגה" on the hiring file's own ID or account (profile H5a, plan §9.1): a
 * number that arrives while the page is put away (another app, the phone
 * locked, a slow answer) never shows, even when it lands as the page comes
 * back. A page stands in for the document here.
 */

class Page extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  listening = 0;

  set(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
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

/** An answer that comes when it is let go. */
function slowAnswer(value: string | null) {
  let answer: () => void = () => {};
  const promise = new Promise<string | null>((resolve) => {
    answer = () => resolve(value);
  });
  return { ask: () => promise, answer };
}

const asPage = (page: Page) => page as unknown as PageVisibility;

/** A window with its own clock: what `watchShown` waits on and listens to. */
class Win extends EventTarget {
  timers = new Map<number, () => void>();
  next = 1;
  setTimeout = ((run: () => void) => {
    const id = this.next++;
    this.timers.set(id, run);
    return id;
  }) as unknown as Window["setTimeout"];
  clearTimeout = ((id: number) => {
    this.timers.delete(id);
  }) as unknown as Window["clearTimeout"];
  /** The minute passes. */
  tick() {
    for (const run of [...this.timers.values()]) run();
    this.timers.clear();
  }
}

const asWin = (win: Win) => win as unknown as PageWindow;

describe("watchShown", () => {
  it("hides the number after the minute", () => {
    const page = new Page();
    const win = new Win();
    const hide = vi.fn();
    watchShown(hide, 60_000, asPage(page), asWin(win));
    expect(hide).not.toHaveBeenCalled();
    win.tick();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("hides it as soon as the page is put away, or left", () => {
    const page = new Page();
    const win = new Win();
    const hide = vi.fn();
    watchShown(hide, 60_000, asPage(page), asWin(win));
    page.set("hidden");
    expect(hide).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("pagehide"));
    expect(hide).toHaveBeenCalledTimes(2);
  });

  // Next keeps a screen it leaves (hidden in an <Activity>, its state kept)
  // and runs its effects' stops as it hides it: the number goes then, so it
  // never comes back on screen when the person opens the file again.
  it("hides it when its screen goes, kept or not, and listens no more", () => {
    const page = new Page();
    const win = new Win();
    const hide = vi.fn();
    const stop = watchShown(hide, 60_000, asPage(page), asWin(win));
    expect(page.listening).toBe(1);
    stop();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(page.listening).toBe(0);
    expect(win.timers.size).toBe(0);
    page.set("hidden");
    win.dispatchEvent(new Event("pagehide"));
    expect(hide).toHaveBeenCalledTimes(1);
  });
});

describe("revealWhileShown", () => {
  it("gives the number to a page that stayed on screen", async () => {
    const page = new Page();
    const slow = slowAnswer("000000018");
    const shown = revealWhileShown(slow.ask, asPage(page));
    slow.answer();
    expect(await shown).toBe("000000018");
    expect(page.listening).toBe(0);
  });

  it("keeps it hidden when the page was put away while it came, and is back", async () => {
    const page = new Page();
    const slow = slowAnswer("000000018");
    const shown = revealWhileShown(slow.ask, asPage(page));
    page.set("hidden");
    page.set("visible");
    slow.answer();
    expect(await shown).toBe("away");
    expect(page.listening).toBe(0);
  });

  it("keeps it hidden when it lands while the page is away", async () => {
    const page = new Page();
    const slow = slowAnswer("000000018");
    const shown = revealWhileShown(slow.ask, asPage(page));
    page.set("hidden");
    slow.answer();
    expect(await shown).toBe("away");
  });

  it("keeps it hidden when asked for from a page already away", async () => {
    const page = new Page();
    page.visibilityState = "hidden";
    expect(await revealWhileShown(async () => "100001", asPage(page))).toBe(
      "away",
    );
  });

  it("says a failure as null, never the number", async () => {
    const page = new Page();
    expect(await revealWhileShown(async () => null, asPage(page))).toBeNull();
    expect(
      await revealWhileShown(() => Promise.reject(new Error()), asPage(page)),
    ).toBeNull();
    expect(page.listening).toBe(0);
  });
});
