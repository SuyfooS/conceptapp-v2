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
