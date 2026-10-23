import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { signIn } from "./session";
import { setDemoModule } from "./sms";

// Seeded in supabase/seed.sql. Every module starts on for the demo restaurant.
// The worker here is not the one sign-in.spec.ts uses: the auth server
// refuses a second code to the same number within 5 seconds.
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
  return (await nav.getByRole("link").allInnerTexts()).map((s) => s.trim());
}

const m = he.modules;

test.afterEach(async () => {
  await setDemoModule("reservations", true);
});

test("the owner's navigation follows the business's modules", async ({
  page,
}, testInfo) => {
  await signIn(page, OWNER);
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.reservations.name,
    m.storefront.name,
  ]);
  // Module cards only: owners and managers also get a link to their team.
  const cards = page.getByRole("main").locator('a:not([href="/team"])');
  await expect(cards).toHaveCount(3);
  await expect(cards.filter({ hasText: m.reservations.name })).toBeVisible();
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

  // Switching reservations off removes it everywhere, with no code change.
  await setDemoModule("reservations", false);
  await page.goto("/home");
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.storefront.name,
  ]);
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: m.reservations.name })).toHaveCount(0);
  await expectUnavailable(page, "/reservations");

  // And switching it back on restores it.
  await setDemoModule("reservations", true);
  await page.goto("/home");
  expect(await navItems(page)).toContain(m.reservations.name);
});

test("a worker does not see manager-only modules", async ({ page }) => {
  await signIn(page, WORKER);
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    m.scheduling.name,
    m.time_clock.name,
    m.reservations.name,
  ]);
  await expectUnavailable(page, "/storefront");
});
