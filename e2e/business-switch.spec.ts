import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  closeSwitchBusinesses,
  invitesBySlug,
  notificationRead,
  notifySwitchPerson,
  openSwitchBusinesses,
  removeDemoInvites,
  SWITCH_BUSINESSES,
  SWITCH_PERSON,
  seededPayMonth,
} from "./db";
import { secondPage, signIn } from "./session";
import { latestCode } from "./sms";
import { heT } from "./t";

// One login in several businesses (payroll P3b; Orel, 8 November 2026): one
// place on a staff per login and any number as an accountant. Galit keeps the
// books of both demo businesses (supabase/seed.sql) and switches between
// them: from Home on phones and tablets, from the sidebar on a desktop. The
// business opened is a cookie the server checks against the person's
// memberships, so a forged one opens their own. Demo businesses never reach
// a phone, so the lines from another business are Rotem's, in two real
// businesses made for this spec (e2e/db.ts).
const e = he.auth.enter;
const b = he.ui.businesses;
const ti = he.app.team.invite;
const j = he.auth.join;
const SHOP = e.businesses.shop.name;
const RESTAURANT = e.businesses.restaurant.name;
const DEMO_RESTAURANT = "00000000-0000-4000-b000-000000000001";
// The shop's Roni, on its staff (supabase/seed.sql), in no other invite spec
// (new-business.spec's wizard refuses his number and writes nothing).
const RONI = { local: "050-000-0012", e164: "+972500000012", name: "רוני" };

const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/** Home's line above the greeting ends with the business it is in. */
const homeIn = (page: Page, business: string) =>
  shown(page, new RegExp(`· ${business}$`));

/** In through the door, as one of the demo's people, in one business. */
async function enterAs(
  page: Page,
  business: keyof typeof e.businesses,
  key: keyof typeof e.people,
) {
  await page.goto("/enter");
  await page
    .getByRole("region", { name: e.businesses[business].name })
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/** Switch to another business the way this screen size does. */
async function switchTo(
  page: Page,
  from: string,
  to: string,
  desktop: boolean,
) {
  if (desktop) {
    await page
      .getByRole("button", { name: heT("ui.businesses.menu", { name: from }) })
      .click();
    await page.getByRole("menuitemradio", { name: new RegExp(to) }).click();
  } else {
    // Home's list: the sidebar's menu is not on these screens.
    await page
      .getByRole("button", { name: new RegExp(to) })
      .filter({ visible: true })
      .click();
  }
  await expect(page).toHaveURL(/\/home$/);
  await expect(homeIn(page, to)).toBeVisible();
}

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("Galit switches from the shop to the restaurant and sees its pay month", async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  const month = await seededPayMonth("restaurant");
  await enterAs(page, "shop", "accountant");
  await expect(homeIn(page, SHOP)).toBeVisible();

  // Both businesses, the one she is in marked; on a desktop, the sidebar.
  if (desktop) {
    await expect(
      page.getByRole("button", {
        name: heT("ui.businesses.menu", { name: SHOP }),
      }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", { level: 2, name: b.title }),
    ).toBeVisible();
    await expect(shown(page, b.here)).toBeVisible();
  }
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("businesses-home.png"),
    fullPage: true,
  });

  await switchTo(page, SHOP, RESTAURANT, desktop);
  // The choice stays: the next visit opens the restaurant again.
  await page.reload();
  await expect(homeIn(page, RESTAURANT)).toBeVisible();

  // The restaurant's month, with its people: Yoav, and none of the shop's.
  await page.goto(`/clock/pay?month=${month}`);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.pay.title }),
  ).toBeVisible();
  await expect(shown(page, "יואב לוי")).toBeVisible();
  await expect(page.getByText("תמר אברהם")).toHaveCount(0);
  await expectCleanPage(page);

  // And back to the shop.
  await page.goto("/home");
  await switchTo(page, RESTAURANT, SHOP, desktop);
});

test("on the profile, the businesses open in a sheet", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "desktop",
    "a desktop switches from the sidebar",
  );
  await enterAs(page, "restaurant", "accountant");
  await page.goto("/me");
  await page.getByRole("button", { name: new RegExp(b.switch) }).click();
  const sheet = page.getByRole("dialog", { name: b.title });
  await expect(sheet).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  await sheet.getByRole("button", { name: new RegExp(SHOP) }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(homeIn(page, SHOP)).toBeVisible();
});

test("a forged choice opens the person's own business", async ({
  page,
  baseURL,
}) => {
  await enterAs(page, "shop", "shopWorker");
  for (const value of [DEMO_RESTAURANT, "not-a-business"]) {
    await page
      .context()
      .addCookies([{ name: "ca_business", value, url: baseURL ?? "" }]);
    await page.goto("/home");
    await expect(homeIn(page, SHOP)).toBeVisible();
    await expect(page.getByText(RESTAURANT)).toHaveCount(0);
    // Nothing to switch to.
    await expect(page.getByRole("heading", { name: b.title })).toHaveCount(0);
  }
  // The shop's schedule, not the restaurant's: its week is always published.
  await page.goto("/schedule");
  await expect(page.getByText(RESTAURANT)).toHaveCount(0);
});

// The Team screen answers the same for every number (#80): an owner never
// learns that Roni works in the shop. Only Roni hears it, at /join, and only
// the console tells an inviter (console-people.spec.ts).
test("a worker on another business's staff gets a link like anyone, and only he hears why it can't be used", async ({
  page,
  browser,
}, testInfo) => {
  await removeDemoInvites([RONI.e164]);
  try {
    await enterAs(page, "restaurant", "owner");
    await page.goto("/team/invite");
    await page.getByLabel(ti.name).fill(RONI.name);
    await page.getByLabel(ti.phone).fill(RONI.local);
    await page.getByRole("button", { name: ti.submit }).click();
    await expect(
      page.getByRole("heading", {
        name: ti.ready.replace("{name}", RONI.name),
      }),
    ).toBeVisible();
    await expect(page.getByText(ti.errors.elsewhere)).toHaveCount(0);
    expect(await invitesBySlug("demo-restaurant")).toContainEqual({
      name: RONI.name,
      phone: RONI.e164,
      role: "worker",
    });
    await expectCleanPage(page);

    // The rest once, on the widest screen: it sends Roni a code.
    if (testInfo.project.name !== "desktop") return;
    const link = await page
      .getByLabel(he.app.team.link.linkFor.replace("{name}", RONI.name))
      .inputValue();
    const theirs = await secondPage(browser, testInfo);
    try {
      await theirs.goto(link);
      const since = new Date(Date.now() - 1000);
      await theirs.getByRole("button", { name: j.send }).click();
      await theirs
        .getByLabel(j.codeLabel)
        .fill(await latestCode(RONI.e164, since));
      await expect(theirs.getByText(j.elsewhere)).toBeVisible();
    } finally {
      await theirs.context().close();
    }

    // As the accountant he may keep this one's books: the same number again
    // renews his invite with the new role.
    await page.getByRole("button", { name: ti.another }).click();
    await page.getByLabel(ti.name).fill(RONI.name);
    await page.getByLabel(ti.phone).fill(RONI.local);
    await page
      .getByRole("radio", { name: new RegExp(he.app.team.roles.accountant) })
      .check();
    await page.getByRole("button", { name: ti.submit }).click();
    await expect(
      page.getByRole("heading", {
        name: ti.ready.replace("{name}", RONI.name),
      }),
    ).toBeVisible();
    expect(await invitesBySlug("demo-restaurant")).toContainEqual({
      name: RONI.name,
      phone: RONI.e164,
      role: "accountant",
    });
  } finally {
    await removeDemoInvites([RONI.e164]);
  }
});

// Rotem's businesses are made and removed here, so once, on the desktop.
test("a push or inbox line from the other business opens it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  await openSwitchBusinesses();
  try {
    const { first, second } = SWITCH_BUSINESSES;
    const menu = (name: string) =>
      page.getByRole("button", { name: heT("ui.businesses.menu", { name }) });
    await signIn(page, SWITCH_PERSON);
    // No choice made: the business she joined first.
    await expect(menu(first.name)).toBeVisible();

    // A line from the second business went to her phone. The phone asks what
    // to show (as the service worker does, without saying which device): the
    // line, in the second business's words, opening through the open route.
    const pushed = await notifySwitchPerson("second", true);
    const answer = await page.evaluate(async () => {
      const response = await fetch("/push/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: null }),
      });
      return (await response.json()) as {
        notifications: { title: string; url: string }[];
        unread: number | null;
      };
    });
    expect(answer.notifications).toEqual([
      expect.objectContaining({
        title: he.app.notifications.kinds.access.pay_granted.title,
        url: `/notifications/open/${pushed}`,
      }),
    ]);
    expect(answer.unread).toBeGreaterThanOrEqual(1);

    // Opening it switches to the second business first, then leads to its
    // hours for payroll, and the line is read.
    await page.goto(`/notifications/open/${pushed}`);
    await expect(page).toHaveURL(/\/clock\/pay$/);
    await expect(menu(second.name)).toBeVisible();
    expect(await notificationRead(pushed)).toBe(true);

    // Another site's link to a line of the first business switches nothing
    // and marks nothing.
    const inFirst = await notifySwitchPerson("first", false);
    const crossSite = await page.request.get(`/notifications/open/${inFirst}`, {
      headers: { "sec-fetch-site": "cross-site" },
      maxRedirects: 0,
    });
    expect(crossSite.status()).toBe(303);
    expect(crossSite.headers().location).toMatch(/\/notifications$/);
    expect(crossSite.headers()["set-cookie"] ?? "").not.toMatch(/ca_business/);
    expect(await notificationRead(inFirst)).toBe(false);
    await page.goto("/home");
    await expect(menu(second.name)).toBeVisible();

    // Her own opening of it, as from the inbox of the first, goes back there.
    await page.goto(`/notifications/open/${inFirst}`);
    await expect(page).toHaveURL(/\/clock\/pay$/);
    await expect(menu(first.name)).toBeVisible();
    expect(await notificationRead(inFirst)).toBe(true);
    await expectCleanPage(page);
  } finally {
    await closeSwitchBusinesses();
  }
});
