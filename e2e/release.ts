import type { Page } from "@playwright/test";

/*
 * A page from the release before, on a design twin (closing the pilot, PRs
 * 1a and 1b): no database, no sign-in, its frame's person Shiran. One build
 * is enough: a press goes out with an action id the server doesn't have
 * (its own, the last digit changed, so the same length), which Next.js
 * answers as it answers a page from the release before (409,
 * `x-nextjs-action-not-found`), and the client throws its own
 * `UnrecognizedActionError`. What the specs share: e2e/clock-release.spec.ts
 * and e2e/release.spec.ts, and the chat's, in e2e/chat.spec.ts, on the
 * demo's real /chat (its own sends only, so its reads go as they are).
 */

/** An action id of the same length that the server doesn't have. */
export const unknownId = (id: string) =>
  `${id.slice(0, -1)}${id.endsWith("0") ? "1" : "0"}`;

/**
 * Sends the presses on `path` as a page from the release before would: each
 * with an action id the server doesn't know. Returns the ids sent, and the
 * way to stop.
 */
export async function pressAsBeforeRelease(page: Page, path: string) {
  const sent: string[] = [];
  const onPath = (url: URL) => url.pathname === path;
  await page.route(onPath, async (route) => {
    const request = route.request();
    const id = request.headers()["next-action"];
    if (request.method() !== "POST" || id === undefined) {
      await route.fallback();
      return;
    }
    sent.push(id);
    const headers = await request.allHeaders();
    await route.continue({
      headers: { ...headers, "next-action": unknownId(id) },
    });
  });
  return { sent, stop: () => page.unroute(onPath) };
}

type Seen = Window & { statusWordsSeen?: string[]; beforeRelease?: boolean };

/**
 * On every page this tab loads, the reloaded one included: the words of each
 * status region as they come in (a toast leaves by itself, or at the next
 * press).
 */
export async function watchStatusWords(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as Seen).statusWordsSeen = seen;
    new MutationObserver(() => {
      for (const region of document.querySelectorAll('[role="status"]')) {
        const words = region.textContent ?? "";
        if (words && !seen.includes(words)) seen.push(words);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

/** The status words this page has said so far. */
export const statusWordsSeen = (page: Page) =>
  page.evaluate(() => (window as Seen).statusWordsSeen ?? []);

/** Marks the window as it is, to tell a whole new page from it later. */
export const markBeforeRelease = (page: Page) =>
  page.evaluate(() => {
    (window as Seen).beforeRelease = true;
  });

/** Whether this is still the window marked (`markBeforeRelease`). */
export const stillBeforeRelease = (page: Page) =>
  page.evaluate(() => (window as Seen).beforeRelease === true);

/** Counts the pages this tab loads from now on. */
export function countLoads(page: Page) {
  const loads = { count: 0 };
  page.on("load", () => {
    loads.count += 1;
  });
  return loads;
}
