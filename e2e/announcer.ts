import type { Locator, Page } from "@playwright/test";
import { ANNOUNCE_SAME_MS } from "../packages/ui/announcer-store";

/** The page's announcer (`@ui/announcer`): said at once, or after what is being read. */
export const announcer = (page: Page, politeness: "assertive" | "polite") =>
  page.locator(`[data-announcer="${politeness}"]`);

/** Marks what the announcer said so far, so a new line is told apart. */
export const heardSoFar = (region: Locator) =>
  region.locator("p").evaluateAll((lines) => {
    for (const line of lines) line.setAttribute("data-heard", "");
  });

/** A line the announcer said since `heardSoFar`, in these words. */
export const saidSince = (region: Locator, words: string) =>
  region.locator("p:not([data-heard])").filter({ hasText: words });

/**
 * Waits out the announcer's moment for the same words (`ANNOUNCE_SAME_MS`):
 * the same words said again within it are said once, for two shapes of one
 * screen. A test presses again far sooner than anyone would, so before a
 * press whose answer has the same words as the line just seen, it waits
 * that moment, and a little more for the clocks of the test and the page.
 */
export const pastSameWords = (page: Page) =>
  page.waitForTimeout(ANNOUNCE_SAME_MS + 50);

/** Where `noteFocusWhenSaid` keeps its note, on the page's window. */
type FocusNote = { focusWhenSaid?: boolean | null };

/**
 * Notes, from now on, where the focus is when `words` first appear in a
 * live region (a status, or what has `aria-live`): a screen reader says them
 * after what the focus reads then, while a focus that moves after them cuts
 * them off. `focusWhenSaid` then tells whether the focus was on `selector`,
 * null until they appear. Before the step that says them; refused when they
 * are said already.
 */
export const noteFocusWhenSaid = (
  page: Page,
  words: string,
  selector: string,
) =>
  page.evaluate(
    ({ words, selector }) => {
      const note = window as unknown as FocusNote;
      note.focusWhenSaid = null;
      const live =
        '[role="status"]:not([aria-live="off"]), [aria-live]:not([aria-live="off"])';
      const saying = () =>
        [...document.querySelectorAll(live)].some((region) =>
          region.textContent?.includes(words),
        );
      if (saying()) throw new Error(`already said: ${words}`);
      const observer = new MutationObserver(() => {
        if (!saying()) return;
        note.focusWhenSaid = document.activeElement?.matches(selector) ?? false;
        observer.disconnect();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    { words, selector },
  );

/** What `noteFocusWhenSaid` saw: the focus on its selector, or not yet said. */
export const focusWhenSaid = (page: Page) =>
  page.evaluate(() => (window as unknown as FocusNote).focusWhenSaid ?? null);

/** Where `noteIfSaid` keeps what it saw, on the page's window. */
type SaidNote = { said?: Record<string, boolean> };

/**
 * Notes, from now on, whether `words` ever appear in a live region (a
 * status, or what has `aria-live`), however briefly: `wasSaid` then tells.
 * For words that must not be said, asked once something said later has
 * been drawn (`pastDrawing`, or a later step's own words), so words that
 * would come late are not missed by a look that came first. Before the
 * step; refused when they are said already.
 */
export const noteIfSaid = (page: Page, words: string) =>
  page.evaluate((words) => {
    const note = window as unknown as SaidNote;
    const said = note.said ?? {};
    note.said = said;
    said[words] = false;
    const live =
      '[role="status"]:not([aria-live="off"]), [aria-live]:not([aria-live="off"])';
    const saying = () =>
      [...document.querySelectorAll(live)].some((region) =>
        region.textContent?.includes(words),
      );
    if (saying()) throw new Error(`already said: ${words}`);
    const observer = new MutationObserver(() => {
      if (!saying()) return;
      said[words] = true;
      observer.disconnect();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, words);

/** Whether `words` reached a live region since `noteIfSaid`. */
export const wasSaid = (page: Page, words: string) =>
  page.evaluate(
    (words) => (window as unknown as SaidNote).said?.[words] ?? false,
    words,
  );

/**
 * Waits until the page has drawn twice more, and a little after: words a
 * step would say late (a toast's, set in an effect after the drawing that
 * shows it) are in the page by then. At most a second for the drawings, for
 * a page the browser draws no longer.
 */
export async function pastDrawing(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const late = setTimeout(resolve, 1000);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            clearTimeout(late);
            resolve();
          }),
        );
      }),
  );
  await page.waitForTimeout(250);
}
