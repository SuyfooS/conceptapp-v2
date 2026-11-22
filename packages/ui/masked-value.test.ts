import { describe, expect, it } from "vitest";
import { type PageVisibility, revealWhileShown } from "./masked-value";

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
