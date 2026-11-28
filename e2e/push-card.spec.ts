import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { HOLD_MS } from "./build-screen";
import { standInForTurnstile } from "./captcha";
import {
  addTestDevice,
  closePushCardBusiness,
  forgetDevices,
  forgetPreferences,
  openPushCardBusiness,
  PUSH_CARD_PEOPLE,
  storedPreferences,
  withdrawPushCardShift,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { type Browser, expect, type Page, type TestInfo, test } from "./test";

// Today's card that offers notifications on the phone (closing the pilot,
// PR 6), in a real business of the spec's own: a demo business never shows
// it. It needs push set up (the VAPID keys CI makes), and waits for them.
// Headless Chromium says notifications are blocked, where the card shows
// nothing, so each page is told what a browser not asked yet says
// (`notAskedYet`). A press that turns them on needs a push service, and what
// comes of it (on, blocked, failed) is drawn on Today's twin
// (design.spec.ts, `/design/shell/today/worker?push=…`) and in the /design
// gallery. Never a push to anyone: nothing here subscribes.

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const n = he.app.notifications;
const WORKER = PUSH_CARD_PEOPLE.worker;
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
// Safari's default on an iPad: the desktop site, with a Mac's user agent.
const IPAD_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
// Where a device of this spec would send: nowhere, nothing listens there.
const NO_SERVICE = "http://127.0.0.1:9";
// A moment's card seen in this browser (`MOMENT_SEEN_KEY`, push-client.ts).
const MOMENT_SEEN = "conceptapp:push-moment-seen";

test.beforeAll(async () => {
  await openPushCardBusiness();
});

test.afterAll(async () => {
  await closePushCardBusiness();
});

/** What a browser that hasn't been asked about notifications yet says. */
async function notAskedYet(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "default",
    });
  });
}

/** "phone" on the phone project's Pixel, "other" on a computer's Chrome. */
const deviceOf = (testInfo: TestInfo) =>
  testInfo.project.name === "phone" ? "phone" : "other";

/** Today's card, by its question. */
const cardOf = (page: Page, device: "phone" | "other") =>
  page.getByRole("main").getByRole("region", {
    name: heT("app.notifications.ask.today", { device }),
  });

/** The "ביטול" that takes `words`' place. */
const undoOf = (page: Page, words: string) =>
  page
    .getByRole("status")
    .filter({ hasText: words })
    .getByRole("button", { name: he.ui.undoRow.undo });

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Give away the worker's shift on their screen, through its sheet. */
async function giveShift(page: Page) {
  const sw = he.app.shifts.swap;
  await page
    .getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) })
    .filter({ visible: true })
    .click();
  const giving = page.getByRole("dialog");
  await expect(giving).toContainText(he.app.shifts.sheet.give);
  await giving
    .getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) })
    .click();
  await expect(giving).toHaveCount(0);
}

/**
 * Another device of the same person, an iPhone (or an iPad, saying iPad or,
 * as Safari does there by default, a Mac with a touch screen): in Safari
 * (`standalone` false, and no PushManager outside the home screen), or the
 * app on its home screen, whose storage is its own, as a real iPhone keeps
 * them apart.
 */
async function iphone(
  browser: Browser,
  testInfo: TestInfo,
  {
    installed,
    ipad = false,
    desktopSite = false,
  }: { installed: boolean; ipad?: boolean; desktopSite?: boolean },
) {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    userAgent: desktopSite ? IPAD_AS_MAC : ipad ? IPAD_SAFARI : IPHONE_SAFARI,
    viewport:
      ipad || desktopSite
        ? { width: 820, height: 1180 }
        : { width: 390, height: 844 },
    hasTouch: desktopSite,
    locale: use.locale,
    baseURL: use.baseURL,
    reducedMotion: "reduce",
  });
  await standInForTurnstile(context);
  const page = await context.newPage();
  await page.addInitScript(
    ({
      installed,
      touchPoints,
    }: {
      installed: boolean;
      touchPoints: number;
    }) => {
      if (!installed) Reflect.deleteProperty(window, "PushManager");
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        get: () => installed,
      });
      // An iPad's Safari says five, a Mac's none.
      if (touchPoints > 0) {
        Object.defineProperty(navigator, "maxTouchPoints", {
          configurable: true,
          get: () => touchPoints,
        });
      }
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => "default",
      });
    },
    { installed, touchPoints: desktopSite ? 5 : 0 },
  );
  return { context, page };
}

test("Today offers notifications on the phone until 'לא עכשיו', and not after it", async ({
  page,
}, testInfo) => {
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(90_000);
  const device = deviceOf(testInfo);
  await forgetPreferences(WORKER.id);
  await notAskedYet(page);
  try {
    await signIn(page, WORKER);
    const card = cardOf(page, device);
    await expect(card).toBeVisible();
    await expect(card).toContainText(
      heT("app.notifications.ask.body", { device }),
    );
    const enable = card.getByRole("button", {
      name: heT("app.notifications.ask.enable", { device }),
    });
    const dismiss = card.getByRole("button", { name: n.ask.dismiss });
    await expect(enable).toBeVisible();
    await expect(dismiss).toBeVisible();
    await expectAccessible(page);
    // Under the hero: it comes once the browser has answered, after Today
    // is drawn, and the next shift never moves for it.
    const hero = page.getByRole("region", { name: he.app.home.hero.next });
    const heroBox = await hero.boundingBox();
    const cardBox = await card.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(cardBox?.y ?? 0).toBeGreaterThanOrEqual(
      (heroBox?.y ?? 0) + (heroBox?.height ?? 0),
    );

    // Seen is not asked: it comes again, and nothing is kept.
    await page.reload();
    await expect(card).toBeVisible();
    expect((await storedPreferences(WORKER.id))?.askedAt ?? null).toBeNull();

    // "לא עכשיו" goes at once, with a way back that brings it back.
    await dismiss.click();
    await expect(card).toHaveCount(0);
    const undo = undoOf(page, n.ask.putAway);
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(card).toBeVisible();
    await expect(dismiss).toBeFocused();
    expect((await storedPreferences(WORKER.id))?.askedAt ?? null).toBeNull();

    // Left to go, it is kept for the person, on every device of theirs. On
    // the desktop, Today is left for the person's shifts while it is still
    // held: that screen is drawn before the write lands, and giving the
    // shift away there offers nothing either (with less motion, as here,
    // the sheet closes before the screen is drawn again).
    await dismiss.click();
    await expect(undo).toBeVisible();
    const desktop = testInfo.project.name === "desktop";
    if (desktop) {
      await page
        .getByRole("region", { name: he.app.home.hero.next })
        .getByRole("link", { name: he.app.home.hero.myShifts })
        .click();
      await expect(page).toHaveURL(/\/schedule\/shifts$/);
      await giveShift(page);
      await page.waitForTimeout(1000);
      await expect(page.getByRole("region", { name: n.ask.swap })).toHaveCount(
        0,
      );
    }
    await expect
      .poll(async () => (await storedPreferences(WORKER.id))?.askedAt ?? null, {
        timeout: HOLD_MS + 10_000,
      })
      .not.toBeNull();
    await expect(undo).toHaveCount(0);

    // Gone once Today is drawn again.
    if (desktop) await page.goto("/home");
    else await page.reload();
    // What it would have shown comes from the browser a moment later.
    await expect(
      page.getByRole("region", { name: he.app.home.hero.next }),
    ).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(card).toHaveCount(0);
  } finally {
    await forgetPreferences(WORKER.id);
  }
});

test("a moment's card seen and left doesn't end Today's card", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "writes: once, on the desktop",
  );
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(90_000);
  await forgetPreferences(WORKER.id);
  await withdrawPushCardShift();
  await notAskedYet(page);
  try {
    await signIn(page, WORKER);
    const card = cardOf(page, "other");
    await expect(card).toBeVisible();

    // A shift given away: the moment's card, seen and left alone, is kept
    // in this browser, and nothing for the person.
    await page.goto("/schedule/shifts");
    await giveShift(page);
    const moment = page.getByRole("region", { name: n.ask.swap });
    await expect(moment).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), MOMENT_SEEN),
      )
      .not.toBeNull();
    expect((await storedPreferences(WORKER.id))?.askedAt ?? null).toBeNull();

    // Given away again in this browser: it doesn't come again.
    await withdrawPushCardShift();
    await page.reload();
    await giveShift(page);
    // What it would have shown comes from the browser a moment later.
    await page.waitForTimeout(1000);
    await expect(moment).toHaveCount(0);

    // Today still asks, until "לא עכשיו" or this device has them.
    await page.goto("/home");
    await expect(card).toBeVisible();
    expect((await storedPreferences(WORKER.id))?.askedAt ?? null).toBeNull();
  } finally {
    await withdrawPushCardShift();
    await forgetPreferences(WORKER.id);
  }
});

test("the accountant's Today offers them too", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  const accountant = PUSH_CARD_PEOPLE.accountant;
  await forgetPreferences(accountant.id);
  await notAskedYet(page);
  try {
    await signIn(page, accountant);
    const card = cardOf(page, "other");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", {
        name: heT("app.notifications.ask.enable", { device: "other" }),
      }),
    ).toBeVisible();
    await expectAccessible(page);
  } finally {
    await forgetPreferences(accountant.id);
  }
});

test("an iPhone's Safari shows the steps to the home screen, and the app there still asks", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(120_000);
  const owner = PUSH_CARD_PEOPLE.owner;
  await forgetPreferences(owner.id);
  const safari = await iphone(browser, testInfo, { installed: false });
  try {
    const { page } = safari;
    await signIn(page, owner);
    const steps = page.getByRole("main").getByRole("region", {
      name: heT("app.notifications.push.iosHint.title", { device: "phone" }),
    });
    await expect(steps).toBeVisible();
    await expect(steps).toContainText(
      heT("app.notifications.push.iosHint.share", { device: "phone" }),
    );
    await expect(steps).toContainText(n.push.iosHint.add);
    await expect(steps).toContainText(n.push.iosHint.open);
    // Nothing can be turned on in Safari.
    await expect(
      steps.getByRole("button", {
        name: heT("app.notifications.ask.enable", { device: "phone" }),
      }),
    ).toHaveCount(0);
    await expectAccessible(page);

    // "לא עכשיו" puts them away in this browser alone: never for the person.
    await steps.getByRole("button", { name: n.ask.dismiss }).click();
    const undo = undoOf(page, n.ask.putAwayHere);
    await expect(undo).toBeFocused();
    await expect(undo).toHaveCount(0, { timeout: HOLD_MS + 10_000 });
    await page.reload();
    await page.waitForTimeout(1000);
    await expect(steps).toHaveCount(0);
    expect((await storedPreferences(owner.id))?.askedAt ?? null).toBeNull();
  } finally {
    await safari.context.close();
  }

  // The app on the home screen, signed in again: the switch, since the one
  // offer wasn't used up in Safari.
  const app = await iphone(browser, testInfo, { installed: true });
  try {
    const { page } = app;
    await signIn(page, owner);
    const card = cardOf(page, "phone");
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", {
        name: heT("app.notifications.ask.enable", { device: "phone" }),
      }),
    ).toBeVisible();
  } finally {
    await app.context.close();
    await forgetPreferences(owner.id);
  }
});

test("an iPad's Safari says iPad, with the share button at the top", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(90_000);
  const owner = PUSH_CARD_PEOPLE.owner;
  await forgetPreferences(owner.id);
  const ipad = await iphone(browser, testInfo, {
    installed: false,
    ipad: true,
  });
  try {
    const { page } = ipad;
    await signIn(page, owner);
    const steps = page.getByRole("main").getByRole("region", {
      name: heT("app.notifications.push.iosHint.title", { device: "other" }),
    });
    await expect(steps).toBeVisible();
    await expect(steps).toContainText(
      heT("app.notifications.push.iosHint.body", { device: "other" }),
    );
    await expect(steps).toContainText(
      heT("app.notifications.push.iosHint.share", { device: "other" }),
    );
    await expectAccessible(page);
  } finally {
    await ipad.context.close();
    await forgetPreferences(owner.id);
  }
});

test("an iPad's Safari asking for the desktop site leaves the steps out once the app there has them", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(90_000);
  const owner = PUSH_CARD_PEOPLE.owner;
  await forgetPreferences(owner.id);
  await forgetDevices(owner.id);
  // Safari's default there: a Mac's user agent, and a touch screen.
  const ipad = await iphone(browser, testInfo, {
    installed: false,
    desktopSite: true,
  });
  try {
    const { page } = ipad;
    await signIn(page, owner);
    const steps = page.getByRole("main").getByRole("region", {
      name: heT("app.notifications.push.iosHint.title", { device: "other" }),
    });
    await expect(steps).toBeVisible();

    // The app on its home screen turned them on, saved as an iPad by what
    // the browser says it is (`savedDeviceLabel`, though its user agent
    // says a Mac): Safari there shows no steps from then on.
    await addTestDevice(owner.id, NO_SERVICE, "ipad");
    await page.reload();
    await expect(page.getByRole("main")).toBeVisible();
    // What it would have shown comes from the browser a moment later.
    await page.waitForTimeout(1000);
    await expect(steps).toHaveCount(0);
  } finally {
    await ipad.context.close();
    await forgetDevices(owner.id);
    await forgetPreferences(owner.id);
  }
});
