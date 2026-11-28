import he from "../messages/he.json" with { type: "json" };
import {
  countLoads,
  markBeforeRelease,
  pressAsBeforeRelease,
  statusWordsSeen,
  stillBeforeRelease,
  watchStatusWords,
  wordsSaid,
} from "./release";
import { expect, test } from "./test";

// A screen left open across a release (closing the pilot, PR 1a), on the
// clock's twin: no database, no sign-in, its frame's person Shiran. One
// build is enough: the press goes out with an action id the server doesn't
// have (e2e/release.ts), and the client throws its own
// `UnrecognizedActionError`. So this holds what the unit tests
// (app/stale-build.test.ts) can't: that the error the router really throws
// is the one `isStaleBuild` tells, that the page really loads again and
// then says the app was updated (the frame says it since PR 1b, as on every
// screen: e2e/release.spec.ts), that nothing is sent again by itself, and
// that a second such press within the minute says the failure rather than
// loading again.

const CLOCK = "/design/shell/clock";

test("a press on a page from the release before loads it again once, says the app was updated, and nothing is sent again", async ({
  page,
}) => {
  const failed = page
    .getByRole("alert")
    .filter({ hasText: he.app.clock.failure.failed });
  const circle = page.locator('[data-clock="circle"]');
  await watchStatusWords(page);
  await page.goto(CLOCK);
  await page.waitForLoadState("networkidle");
  const loads = countLoads(page);
  const presses = await pressAsBeforeRelease(page, CLOCK);
  try {
    await markBeforeRelease(page);
    const loaded = page.waitForEvent("load");
    await circle.click();
    await loaded;

    // A whole new page, at the same address: nothing was recorded, so the
    // circle is still the one to come in, and the press failed in no words.
    // The frame says the update through the page's announcer, and shows it.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${CLOCK}$`));
    await expect.poll(() => wordsSaid(page)).toContain(he.app.updated.toast);
    await expect
      .poll(() => statusWordsSeen(page))
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
    expect(loads.count).toBe(1);
    await expect(page).toHaveURL(new RegExp(`${CLOCK}$`));
  } finally {
    await presses.stop();
  }
});
