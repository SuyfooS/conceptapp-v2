import he from "../messages/he.json" with { type: "json" };
import { expect, type Page, test } from "./test";

// A screen left open across a release (closing the pilot, PR 1a), on the
// clock's twin: no database, no sign-in, its person "demo". One build is
// enough: the press goes out with an action id the server doesn't have (its
// own, the last digit changed, so the same length), which Next.js answers as
// it answers a page from the release before (409, `x-nextjs-action-not-found`),
// and the client throws its own `UnrecognizedActionError`. So this holds what
// the unit tests (app/stale-build.test.ts) can't: that the error the router
// really throws is the one `isStaleBuild` tells, that the page really loads
// again and then says the app was updated, that nothing is sent again by
// itself, and that a second such press within the minute says the failure
// rather than loading again.

const CLOCK = "/design/shell/clock";

/** An action id of the same length that the server doesn't have. */
const unknownId = (id: string) =>
  `${id.slice(0, -1)}${id.endsWith("0") ? "1" : "0"}`;

/**
 * Sends the clock's presses as a page from the release before would: each
 * with an action id the server doesn't know. Returns the ids sent, and the
 * way to stop.
 */
async function pressAsBeforeRelease(page: Page) {
  const sent: string[] = [];
  const clockPath = (url: URL) => url.pathname === CLOCK;
  await page.route(clockPath, async (route) => {
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
  return { sent, stop: () => page.unroute(clockPath) };
}

type Seen = Window & { statusWordsSeen?: string[]; beforeRelease?: boolean };

test("a press on a page from the release before loads it again once, says the app was updated, and nothing is sent again", async ({
  page,
}) => {
  const failed = page
    .getByRole("alert")
    .filter({ hasText: he.app.clock.failure.failed });
  const circle = page.locator('[data-clock="circle"]');
  // On every page this tab loads, the reloaded one included: the words of
  // each status region as they come in (a toast leaves by itself).
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
  await page.goto(CLOCK);
  await page.waitForLoadState("networkidle");
  let loads = 0;
  page.on("load", () => {
    loads += 1;
  });
  const presses = await pressAsBeforeRelease(page);
  try {
    await page.evaluate(() => {
      (window as Seen).beforeRelease = true;
    });
    const loaded = page.waitForEvent("load");
    await circle.click();
    await loaded;

    // A whole new page, at the same address: nothing was recorded, so the
    // circle is still the one to come in, and the press failed in no words.
    expect(
      await page.evaluate(() => (window as Seen).beforeRelease),
    ).toBeUndefined();
    await expect(page).toHaveURL(new RegExp(`${CLOCK}$`));
    await expect
      .poll(() => page.evaluate(() => (window as Seen).statusWordsSeen ?? []))
      .toContain(he.app.updated.toast);
    await expect(failed).toHaveCount(0);
    await expect(circle).toBeEnabled();
    // Nothing sent again by itself: the person presses.
    expect(presses.sent).toHaveLength(1);

    // Pressed again within the minute, the page still from the release
    // before: the failure, as before, and no second reload.
    await circle.click();
    await expect(failed).toBeVisible();
    expect(presses.sent).toHaveLength(2);
    expect(loads).toBe(1);
    await expect(page).toHaveURL(new RegExp(`${CLOCK}$`));
  } finally {
    await presses.stop();
  }
});
