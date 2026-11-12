import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  addTestDevice,
  closeSettingsBusiness,
  endQuietNow,
  forgetDevices,
  forgetPreferences,
  giveSettingsShift,
  notifySettingsOwner,
  openSettingsBusiness,
  ownerLine,
  quietUntilSoon,
  SETTINGS_PEOPLE,
  skipWaitingPushes,
  storedPreferences,
  withdrawSettingsShift,
} from "./db";
import { MockPushService } from "./mock-push";
import { signIn } from "./session";
import { heT } from "./t";

// Each person's choices for their phone (notifications part 3), in a real
// business of the spec's own: a demo business has nothing to choose. What
// only reads runs at every width; what writes runs once, on the desktop,
// and puts back what it changed. The push itself needs the generated keys CI
// sets (VAPID_*, CRON_SECRET, PUSH_TEST_ORIGIN), and those tests wait for
// them; the rest runs without.

const ORIGIN = process.env.PUSH_TEST_ORIGIN ?? "";
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
// Where a device of the tests sends when no mock is listening: nowhere.
const NO_SERVICE = "http://127.0.0.1:3199";

const n = he.app.notifications;
const s = n.settings;
const sw = he.app.shifts.swap;
const OWNER = SETTINGS_PEOPLE.owner;
const WORKER = SETTINGS_PEOPLE.worker;

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

test.beforeAll(async () => {
  await openSettingsBusiness();
});

test.afterAll(async () => {
  await closeSettingsBusiness();
});

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

const groupSwitch = (page: Page, group: keyof typeof n.groups) =>
  page.getByRole("switch", { name: n.groups[group].name, exact: true });

const quietSwitch = (page: Page) =>
  page.getByRole("switch", { name: s.quiet.label, exact: true });

const previewsSwitch = (page: Page) =>
  page.getByRole("switch", { name: s.previews.label, exact: true });

/** The phone's own switch, "התראות לטלפון" or "התראות למכשיר". */
const PHONE_SWITCH = /^התראות ל/;

/** The settings, opened as a person would, from their profile. */
async function openSettings(page: Page) {
  await page.goto("/me");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${n.title}`) })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/notifications\/settings$/);
  await expect(
    page.getByRole("heading", { level: 1, name: s.title }),
  ).toBeVisible();
}

/** Give away the shift on the person's screen, through its sheet. */
async function giveShift(page: Page) {
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
  await expect(
    page
      .getByRole("button", { name: new RegExp(`^${sw.buttons.cancel}, `) })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

test("the settings offer each choice, at every width", async ({ page }) => {
  await forgetPreferences(OWNER.id);
  await signIn(page, OWNER);
  await openSettings(page);
  // Until they choose, everything reaches the phone, with no quiet hours and
  // the line on the lock screen.
  for (const group of ["schedule", "swaps", "approvals", "team"] as const) {
    await expect(groupSwitch(page, group)).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
  await expect(quietSwitch(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel(s.quiet.from, { exact: true })).toHaveCount(0);
  await expect(previewsSwitch(page)).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByText(s.kinds.note).filter({ visible: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/ConceptApp$/);
  await expectAccessible(page);
});

test("each choice saves at once and holds across a reload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "writes: once, on desktop");
  await forgetPreferences(OWNER.id);
  try {
    await signIn(page, OWNER);
    await openSettings(page);

    await groupSwitch(page, "swaps").click();
    await expect(groupSwitch(page, "swaps")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.pushOff)
      .toEqual(["swaps"]);

    // Quiet hours start at 22:00 to 07:00, and each time saves itself.
    await quietSwitch(page).click();
    const from = page.getByLabel(s.quiet.from, { exact: true });
    const to = page.getByLabel(s.quiet.to, { exact: true });
    await expect(from).toHaveValue("22:00");
    await expect(to).toHaveValue("07:00");
    await expect
      .poll(async () => {
        const stored = await storedPreferences(OWNER.id);
        return [stored?.quietFrom, stored?.quietTo];
      })
      .toEqual(["22:00", "07:00"]);
    await from.fill("23:30");
    await from.blur();
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.quietFrom)
      .toBe("23:30");
    // The same time at both ends says why, and isn't kept.
    await to.fill("23:30");
    const same = page.getByText(s.failures.invalid).filter({ visible: true });
    await expect(same).toBeVisible();
    await to.blur();
    await expect(to).toHaveValue("07:00");
    await expect(same).toHaveCount(0);

    await previewsSwitch(page).click();
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.previews)
      .toBe(false);

    await page.reload();
    await expect(groupSwitch(page, "swaps")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(groupSwitch(page, "schedule")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(quietSwitch(page)).toHaveAttribute("aria-checked", "true");
    await expect(from).toHaveValue("23:30");
    await expect(to).toHaveValue("07:00");
    await expect(previewsSwitch(page)).toHaveAttribute("aria-checked", "false");
    expect((await storedPreferences(OWNER.id))?.quietTo).toBe("07:00");

    // Switched off, quiet hours go; on again, the same hours come back.
    await quietSwitch(page).click();
    await expect(from).toHaveCount(0);
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.quietFrom ?? null)
      .toBeNull();
    await quietSwitch(page).click();
    await expect(from).toHaveValue("23:30");
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.quietFrom)
      .toBe("23:30");
    await groupSwitch(page, "swaps").click();
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.pushOff)
      .toEqual([]);
  } finally {
    await forgetPreferences(OWNER.id);
  }
});

test("a group kept off the phone still reaches the inbox, and only the inbox", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "writes: once, on desktop");
  await forgetPreferences(OWNER.id);
  await forgetDevices(OWNER.id);
  // A device of the owner's, so a line that may reach a phone waits for it.
  await addTestDevice(OWNER.id, ORIGIN || NO_SERVICE);
  try {
    await signIn(page, OWNER);
    await openSettings(page);
    await groupSwitch(page, "swaps").click();
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.pushOff)
      .toEqual(["swaps"]);

    // The worker gives their shift away: the owner's line about it is
    // written, with nothing waiting for the phone.
    await giveSettingsShift();
    await expect
      .poll(async () => (await ownerLine("swap.offered"))?.state ?? null)
      .toBe("none");
    // A group still on waits for the phone, as before.
    await notifySettingsOwner();
    await expect
      .poll(async () => (await ownerLine("team.joined"))?.state ?? null)
      .toBe("queued");

    await page.goto("/notifications");
    await expect(
      page
        .getByRole("main")
        .getByText(n.kinds.swap.offered.title.split("{")[0]?.trim() ?? "")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  } finally {
    await withdrawSettingsShift();
    // Nothing ever sends the line left waiting: it goes no more, or the
    // next test's device would get it.
    await skipWaitingPushes(OWNER.id);
    await forgetDevices(OWNER.id);
    await forgetPreferences(OWNER.id);
  }
});

test("quiet hours hold a push until they end", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "writes: once, on desktop");
  test.skip(
    !ORIGIN || !PUBLIC_KEY || !CRON_SECRET,
    "needs VAPID keys, CRON_SECRET and PUSH_TEST_ORIGIN (CI sets them)",
  );
  test.setTimeout(90_000);
  const mock = new MockPushService(ORIGIN, PUBLIC_KEY);
  await mock.start();
  await forgetPreferences(OWNER.id);
  await forgetDevices(OWNER.id);
  // Only this test's line goes to its device, whatever ran before.
  await skipWaitingPushes(OWNER.id);
  const endpoint = await addTestDevice(OWNER.id, ORIGIN);
  // The pushes to the owner's device, whatever else the service gets.
  const mine = () =>
    mock.seen.filter((push) => push.path === new URL(endpoint).pathname);
  const send = () =>
    request.post("/cron/notifications", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
  try {
    // Quiet until a minute or two from now, set before the line comes.
    const ends = await quietUntilSoon(OWNER.id, 2);
    const id = await notifySettingsOwner();
    const held = await ownerLine("team.joined");
    expect(held?.id).toBe(id);
    expect(held?.state).toBe("queued");
    expect(held?.after).toBe(ends);
    expect(held?.later).toBe(true);

    // The minute job's call while it is quiet sends nothing.
    expect((await send()).status()).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(mine()).toHaveLength(0);
    expect((await ownerLine("team.joined"))?.state).toBe("queued");

    // They end: the next call sends it, to the owner's device.
    await endQuietNow(OWNER.id, id);
    expect((await send()).status()).toBe(202);
    await expect.poll(() => mine().length, { timeout: 15_000 }).toBe(1);
    expect(mine()[0]?.problems).toEqual([]);
    await expect
      .poll(async () => (await ownerLine("team.joined"))?.state)
      .toBe("sent");
  } finally {
    await mock.stop();
    await skipWaitingPushes(OWNER.id);
    await forgetDevices(OWNER.id);
    await forgetPreferences(OWNER.id);
  }
});

test("with details off the lock screen, a push shows its group's words alone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "writes: once, on desktop");
  await forgetPreferences(OWNER.id);
  // What the phone asks when a push arrives, as the service worker does
  // (here without saying which device): the newest line that went to it.
  const phoneShows = () =>
    page.evaluate(async () => {
      const response = await fetch("/push/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: null }),
      });
      return (await response.json()) as {
        notifications: { title: string; body?: string; url: string }[];
      };
    });
  const firstName = WORKER.name.split(" ")[0] ?? WORKER.name;
  try {
    await signIn(page, OWNER);
    const id = await notifySettingsOwner({ pushed: true });

    // Until they choose, the lock screen shows the line itself.
    const shown = await phoneShows();
    expect(shown.notifications).toEqual([
      expect.objectContaining({ url: `/notifications/open/${id}` }),
    ]);
    expect(shown.notifications[0]?.title).toContain(firstName);

    // Switched off on the settings screen: the group's words alone.
    await openSettings(page);
    await previewsSwitch(page).click();
    await expect
      .poll(async () => (await storedPreferences(OWNER.id))?.previews)
      .toBe(false);
    const hidden = await phoneShows();
    expect(hidden.notifications).toEqual([
      expect.objectContaining({
        title: n.push.notice.hidden.team,
        url: `/notifications/open/${id}`,
      }),
    ]);
    expect(hidden.notifications[0]).not.toHaveProperty("body");
    // Nothing of the line, nor of anyone in it.
    const said = JSON.stringify(hidden);
    for (const name of [WORKER.name, firstName, OWNER.name]) {
      expect(said).not.toContain(name);
    }
  } finally {
    await forgetPreferences(OWNER.id);
  }
});

test("after giving a shift away, notifications on the phone are offered once", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "writes: once, on desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");
  await forgetPreferences(WORKER.id);
  await withdrawSettingsShift();
  // A browser that hasn't been asked yet: headless Chromium says blocked.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "default",
    });
  });
  try {
    await signIn(page, WORKER);
    await page.goto("/schedule/shifts");
    await giveShift(page);
    const card = page.getByRole("region", { name: n.ask.swap });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", {
        name: heT("app.notifications.ask.enable", { device: "other" }),
      }),
    ).toBeVisible();
    // Kept as asked, for every device of theirs.
    await expect
      .poll(async () => (await storedPreferences(WORKER.id))?.askedAt ?? null)
      .not.toBeNull();
    await card.getByRole("button", { name: n.ask.dismiss }).click();
    await expect(card).toHaveCount(0);

    // Given away again: nothing more is offered.
    await withdrawSettingsShift();
    await page.reload();
    await giveShift(page);
    // What it would have shown comes from the browser a moment later.
    await page.waitForTimeout(1000);
    await expect(card).toHaveCount(0);
  } finally {
    await withdrawSettingsShift();
    await forgetPreferences(WORKER.id);
  }
});

test("the phone's section says what this browser needs", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on desktop");
  test.skip(!PUBLIC_KEY, "needs VAPID keys (CI sets them)");

  // Blocked in the browser: the words that say where to allow them, and no
  // switch that couldn't work.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "denied",
    });
  });
  await signIn(page, OWNER);
  await openSettings(page);
  await expect(
    page
      .getByText(heT("app.notifications.push.denied", { device: "other" }))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: PHONE_SWITCH })).toHaveCount(0);
  // The choices are there all the same.
  await expect(groupSwitch(page, "schedule")).toBeVisible();

  // An iPhone in Safari, not opened from the home screen: add it there first.
  const use = testInfo.project.use;
  const iphone = await browser.newContext({
    userAgent: IPHONE_SAFARI,
    viewport: { width: 390, height: 844 },
    locale: use.locale,
    baseURL: use.baseURL,
    reducedMotion: "reduce",
  });
  try {
    const phone = await iphone.newPage();
    await phone.addInitScript(() => {
      // Safari's page has no push outside a home-screen app.
      Reflect.deleteProperty(window, "PushManager");
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        get: () => false,
      });
    });
    await signIn(phone, OWNER);
    await openSettings(phone);
    await expect(
      phone.getByRole("heading", { name: n.push.iosHint.title }),
    ).toBeVisible();
    await expect(
      phone.getByText(n.push.iosHint.add).filter({ visible: true }),
    ).toBeVisible();
    await expect(phone.getByRole("switch", { name: PHONE_SWITCH })).toHaveCount(
      0,
    );
    await expect(groupSwitch(phone, "schedule")).toBeVisible();
    await expectAccessible(phone);
  } finally {
    await iphone.close();
  }
});
