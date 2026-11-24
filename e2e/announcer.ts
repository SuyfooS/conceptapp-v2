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
