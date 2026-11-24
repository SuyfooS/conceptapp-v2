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

/** A status region's words as they came in, and its `aria-live` then. */
export type CameIn = { live: string; words: string };

type Noted = Window & { statusWordsCameIn?: CameIn[] };

/**
 * Notes, from now on, the new words of each status region on the page (a
 * toast's, `role="status"`) as they come in, with the `aria-live` the region
 * had then: a screen reader says a polite region's new words as they come,
 * and an `aria-live` turned "off" after them takes nothing back, so how a
 * region ends up shows only what it says next. Returns what came in so far.
 */
export async function noteStatusWords(
  page: Page,
): Promise<() => Promise<CameIn[]>> {
  await page.evaluate(() => {
    const came: CameIn[] = [];
    (window as Noted).statusWordsCameIn = came;
    const regions = () => document.querySelectorAll('[role="status"]');
    const had = new WeakMap<Element, string>();
    for (const region of regions()) had.set(region, region.textContent ?? "");
    new MutationObserver(() => {
      for (const region of regions()) {
        const words = region.textContent ?? "";
        if (had.get(region) === words) continue;
        had.set(region, words);
        // A role of status alone is polite.
        const live = region.getAttribute("aria-live") ?? "polite";
        if (words) came.push({ live, words });
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return () => page.evaluate(() => (window as Noted).statusWordsCameIn ?? []);
}
