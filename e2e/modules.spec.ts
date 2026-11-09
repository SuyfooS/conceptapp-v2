import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { signIn } from "./session";
import { setDemoModule } from "./sms";

// Seeded in supabase/seed.sql. The demo restaurant starts with the schedule,
// the clock and lists, the modules that are built; a test that needs another switches it
// on itself, as the ConceptApp team would from the console.
// The worker here is not the one sign-in.spec.ts uses: the auth server
// refuses a second code to the same number within its resend wait
// (`[auth.sms] max_frequency`).
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const WORKER = { local: "050-000-0004", e164: "+972500000004" };

/**
 * A module screen that is off or out of reach shows the in-app not-found
 * screen. The status stays 200: the shell has already streamed (Next.js
 * keeps the status once streaming starts and adds noindex).
 */
async function expectUnavailable(page: Page, path: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
}

/** Names of the main navigation items visible at this width, in order. */
async function navItems(page: Page): Promise<string[]> {
  const nav = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  await expect(nav).toHaveCount(1);
  // The label alone: an item may also carry a count (unread notifications).
  return (await nav.locator("[data-nav-label]").allInnerTexts()).map((s) =>
    s.trim(),
  );
}

const m = he.modules;

test.afterEach(async () => {
  await setDemoModule("reservations", false);
  await setDemoModule("storefront", false);
  await setDemoModule("scheduling", true);
});

test("the owner's navigation follows the business's modules", async ({
  page,
}, testInfo) => {
  await signIn(page, OWNER);
  // Only what is built: no tab leads to an empty screen.
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.lists.name,
  ]);
  const rows = page
    .getByRole("main")
    .locator('a[href="/clock"], a[href="/reservations"]');
  await expect(rows).toHaveCount(1);

  // Switching a module on adds its tab and its row on Today, with no code
  // change.
  await setDemoModule("reservations", true);
  await page.goto("/home");
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.lists.name,
    m.reservations.name,
  ]);
  // A module with nothing of its own to say yet keeps one row on Today.
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: m.reservations.name })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("home-all-modules.png"),
    fullPage: true,
  });

  // A module screen opens from the nav and is accessible.
  await page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    .getByRole("link", { name: m.reservations.name })
    .click();
  await expect(page).toHaveURL(/\/reservations$/);
  await expect(
    page.getByRole("heading", { level: 1, name: m.reservations.name }),
  ).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Switching it off again removes it everywhere.
  await setDemoModule("reservations", false);
  await page.goto("/home");
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.lists.name,
  ]);
  await expect(rows).toHaveCount(1);
  await expect(rows.filter({ hasText: m.reservations.name })).toHaveCount(0);
  await expectUnavailable(page, "/reservations");
});

test("switching scheduling off takes its part of Today with it", async ({
  page,
}) => {
  const h = he.app.home;
  await signIn(page, OWNER);
  const hero = page.getByRole("region", { name: h.hero.businessNext });
  const scheduling = page.getByRole("main").locator('a[href^="/schedule"]');
  await expect(hero).toBeVisible();
  await expect(scheduling.first()).toBeVisible();

  await setDemoModule("scheduling", false);
  await page.goto("/home");
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.time_clock.name,
    m.lists.name,
  ]);
  await expect(hero).toHaveCount(0);
  await expect(scheduling).toHaveCount(0);
  await expect(page.getByText(h.who.title)).toHaveCount(0);
  // The rest of Today is still there, and so is the way to the profile,
  // where signing out is.
  await expect(
    page.getByRole("main").locator('a[href="/clock"]'),
  ).toBeVisible();
  await expect(page.getByRole("main").locator('a[href="/team"]')).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: he.app.me.open, exact: true }),
  ).toBeVisible();

  await setDemoModule("scheduling", true);
  await page.goto("/home");
  await expect(hero).toBeVisible();
});

test("a worker does not see manager-only modules", async ({ page }) => {
  await setDemoModule("storefront", true);
  await signIn(page, WORKER);
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.lists.name,
  ]);
  await expectUnavailable(page, "/storefront");
});
