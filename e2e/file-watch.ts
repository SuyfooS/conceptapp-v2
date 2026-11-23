import { expect, type Page } from "@playwright/test";
import { FILE_TABS_CHANNEL } from "../app/(app)/team/[person]/file/file-tabs";
import { KEEP_OPEN_WAIT_MS } from "../app/(app)/team/[person]/file/open-watch";

// An open hiring file's watch (profile H6a, `watchOpenFile`), heard from the
// page as the device's other tabs hear it.

type Heard = Window & { fileChecked?: boolean };

/**
 * Listens, before the file opens on the page, for its own check as it opens
 * to be answered open, and returns the wait for that answer. Answered open,
 * the check has slid the step-up, so its answer set the cookie again, its
 * 10 seconds' wait is gone, and it tells the device's other tabs that a file
 * is in use on `channel` (the twin's has its own), which a channel of the
 * page's own hears too. A test waits for it before it clears the cookie or
 * moves the page's clock, as for a person who opens the file and then leaves
 * it alone: unanswered then, the check would race the cookie, or run its
 * wait out in the same jump and close the file. The check's response, seen
 * on the network, comes before the page has handled it, so it can't say
 * this. The wait lasts as long as the page's own: past it, the file closed.
 */
export async function hearFileCheck(
  page: Page,
  channel: string = FILE_TABS_CHANNEL,
): Promise<() => Promise<void>> {
  await page.evaluate((name) => {
    (window as Heard).fileChecked = false;
    const tabs = new BroadcastChannel(name);
    tabs.onmessage = (event: MessageEvent) => {
      if (event.data?.kind !== "active") return;
      tabs.close();
      (window as Heard).fileChecked = true;
    };
  }, channel);
  return async () => {
    await expect
      .poll(() => page.evaluate(() => (window as Heard).fileChecked === true), {
        message: "the file's own check as it opens, answered open",
        timeout: KEEP_OPEN_WAIT_MS,
      })
      .toBe(true);
  };
}
