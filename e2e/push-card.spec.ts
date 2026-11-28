import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { pastDrawing } from "./announcer";
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
// This browser saw the app installed (`INSTALL_NAMES.installed`,
// app/install-capture.ts).
const APP_INSTALLED = "conceptapp:app-installed";

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

/**
 * Holds the card's question to the browser (whether its worker is there)
 * on the next load after `holdCardOnNextLoad`, until `letCardCome`: Today
 * is drawn, and measured, before the card comes. Only that load.
 */
async function holdableCard(page: Page) {
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem("e2e:hold-card") === null) return;
      sessionStorage.removeItem("e2e:hold-card");
    } catch {
      return;
    }
    const container = navigator.serviceWorker;
    const ask = container.getRegistration.bind(container);
    let come = () => {};
    const held = new Promise<void>((resolve) => {
      come = resolve;
    });
    Object.assign(window, { letCardCome: come });
    container.getRegistration = async (client?: string | URL) => {
      await held;
      return ask(client);
    };
  });
}

const holdCardOnNextLoad = (page: Page) =>
  page.evaluate(() => sessionStorage.setItem("e2e:hold-card", "1"));

const letCardCome = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { letCardCome?: () => void }).letCardCome?.(),
  );

/** Whether the keyboard is on a section's title (`headingsAfter`'s). */
const onSectionTitle = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.matches("main h2, main h3") ?? false,
  );

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
  await holdableCard(page);
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
    // is drawn, so the next shift, and all above it, never move for it
    // (what comes after it moves down as it comes). The browser's answer is
    // held back here until Today is measured.
    const hero = page.getByRole("region", { name: he.app.home.hero.next });
    await holdCardOnNextLoad(page);
    await page.reload();
    await expect(hero).toBeVisible();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const heroBox = await hero.boundingBox();
    expect(heroBox).not.toBeNull();
    await expect(card).toHaveCount(0);
    await letCardCome(page);
    await expect(card).toBeVisible();
    expect(await hero.boundingBox()).toEqual(heroBox);
    const cardBox = await card.boundingBox();
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
    // Once the row went, the keyboard goes on to the next section's title.
    if (!desktop) await expect.poll(() => onSectionTitle(page)).toBe(true);

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

test("a 'לא עכשיו' that couldn't be kept brings the card back, and says so", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(90_000);
  await forgetPreferences(WORKER.id);
  await notAskedYet(page);
  try {
    await signIn(page, WORKER);
    const card = cardOf(page, "other");
    await expect(card).toBeVisible();
    // The person's mark goes to its own route (sent with keepalive, so it
    // goes as the page is hidden or closed), which says here it kept nothing.
    let sent = 0;
    await page.route("**/home/push-ask", async (route) => {
      sent += 1;
      await route.fulfill({ status: 500 });
    });
    await card.getByRole("button", { name: n.ask.dismiss }).click();
    await expect(undoOf(page, n.ask.putAway)).toHaveCount(0, {
      timeout: HOLD_MS + 10_000,
    });
    await expect(card).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: n.ask.putAwayFailed }),
    ).toBeVisible();
    expect(sent).toBe(1);
    expect((await storedPreferences(WORKER.id))?.askedAt ?? null).toBeNull();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
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

/**
 * Chrome's offer to install the app (`beforeinstallprompt`), as a fake sent
 * to the page as Chrome sends it: it answers `outcome` once asked, and
 * counts how often it was (`installAsked`). Whether the page kept it for a
 * press, stopping Chrome's own bar (`defaultPrevented`).
 */
function offerInstall(page: Page, outcome: "accepted" | "dismissed") {
  return page.evaluate((outcome) => {
    const counted = window as unknown as { installAsked?: number };
    counted.installAsked = 0;
    const event = Object.assign(
      new Event("beforeinstallprompt", { cancelable: true }),
      {
        prompt: async () => {
          counted.installAsked = (counted.installAsked ?? 0) + 1;
        },
        userChoice: Promise.resolve({ outcome, platform: "web" }),
      },
    );
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }, outcome);
}

/** How often the fake offer was asked (`offerInstall`). */
const installAsked = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { installAsked?: number }).installAsked ?? 0,
  );

// The install button on Android (closing the pilot, PR 7), on the app's own
// pages: the phone project's Pixel says Android Chrome. Headless Chromium
// sends no install event of its own, so Chrome's offer is a fake sent as
// Chrome sends it (`offerInstall`), caught by the root layout's script
// before React draws. With none, the card says where Chrome's menu does
// it; with one, its button asks Chrome on the press alone and says what
// came of it, until the page hears more (installed from the menu after a
// no, or offered again); installed, this browser offers nothing more.
// Beside the switch in the settings too. Never on the clock station's
// pages, whose own manifest installs the station. Computers are offered
// nothing.
test("on Android, Today's card and the settings offer to install the app", async ({
  page,
}, testInfo) => {
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  test.setTimeout(120_000);
  const i = he.app.notifications.install;
  const device = deviceOf(testInfo);
  const android = testInfo.project.name === "phone";
  await forgetPreferences(WORKER.id);
  await notAskedYet(page);
  try {
    await signIn(page, WORKER);
    const card = cardOf(page, device);
    await expect(card).toBeVisible();
    const menu = heT("app.notifications.install.menu", { browser: "chrome" });
    const install = card.getByRole("button", { name: i.action });

    if (!android) {
      // A computer: the event is caught all the same, and nothing is shown.
      expect(await offerInstall(page, "accepted")).toBe(true);
      await pastDrawing(page);
      await expect(card).not.toContainText(menu);
      await expect(install).toHaveCount(0);
      await page.goto("/notifications/settings");
      await expect(page.getByRole("main")).toBeVisible();
      await pastDrawing(page);
      await expect(page.getByRole("region", { name: i.title })).toHaveCount(0);
      return;
    }

    // No offer from Chrome yet: where its menu does it, and no button.
    await expect(card).toContainText(menu);
    await expect(install).toHaveCount(0);
    await expectAccessible(page);

    // Chrome's offer, kept for a press and never asked by itself.
    expect(await offerInstall(page, "dismissed")).toBe(true);
    await expect(install).toBeVisible();
    await expect(card).toContainText(i.hint);
    expect(await installAsked(page)).toBe(0);
    await expectAccessible(page);
    // Declined: it can be done later, from the menu, and the keyboard is on
    // those words once the button went.
    await install.click();
    const declined = heT("app.notifications.install.dismissed", {
      browser: "chrome",
    });
    await expect(card).toContainText(declined);
    await expect(install).toHaveCount(0);
    await expect(card.getByText(declined)).toBeFocused();
    expect(await installAsked(page)).toBe(1);
    // Nothing is kept for a no: the next visit says where the menu does it.
    await page.reload();
    await expect(card).toContainText(menu);

    // A no, then the app installed from Chrome's menu on the same page
    // (Chrome says `appinstalled` however it was installed): the words say
    // it is installed now, not that it wasn't.
    expect(await offerInstall(page, "dismissed")).toBe(true);
    await install.click();
    await expect(card).toContainText(declined);
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(card).toContainText(i.installed);
    await expect(card).not.toContainText(declined);

    // Accepted, once Chrome offers it again on the same page (removed from
    // the home screen): the button is back, and once Chrome says it is
    // installed, this browser offers nothing more, here or in the settings.
    expect(await offerInstall(page, "accepted")).toBe(true);
    await expect(install).toBeVisible();
    await expect(card).toContainText(i.hint);
    await install.click();
    await expect(card).toContainText(i.installed);
    expect(await installAsked(page)).toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), APP_INSTALLED),
      )
      .not.toBeNull();
    await page.reload();
    await expect(card).toBeVisible();
    await pastDrawing(page);
    await expect(card).not.toContainText(menu);
    await expect(card).not.toContainText(i.installed);
    await page.goto("/notifications/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: n.settings.title }),
    ).toBeVisible();
    await pastDrawing(page);
    const own = page.getByRole("main").getByRole("region", { name: i.title });
    await expect(own).toHaveCount(0);

    // Removed from the home screen, Chrome offers it again: the settings'
    // card, beside the phone's switch, installs it.
    expect(await offerInstall(page, "accepted")).toBe(true);
    await expect(own).toBeVisible();
    await expect(own).toContainText(i.hint);
    await expectAccessible(page);
    await own.getByRole("button", { name: i.action }).click();
    await expect(own).toContainText(i.installed);
    await expect(own.getByText(i.installed)).toBeFocused();
    expect(await installAsked(page)).toBe(1);

    // The clock station's pages leave Chrome's offer to Chrome: it installs
    // the station, by the station's own manifest.
    await page.goto("/station");
    await expect(page).toHaveURL(/\/station$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await offerInstall(page, "accepted")).toBe(false);
  } finally {
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
    // Once the row went, the keyboard goes on to the next section's title.
    await expect.poll(() => onSectionTitle(page)).toBe(true);
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
