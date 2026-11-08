import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { signIn } from "./session";

// Seeded in supabase/seed.sql: two people on the ConceptApp team (in no
// business) and the demo restaurant's shift manager. Numbers no other spec
// signs in with, so the auth server's resend wait never trips.
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const ONBOARDER = { local: "050-000-0006", e164: "+972500000006" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };

const a = he.admin;

/** The business list shows the demo restaurant in the shape for this width. */
async function expectDemoRestaurant(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: a.businesses.title }),
  ).toBeVisible();
  await expect(
    page.getByText("מסעדת הדגמה", { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText(a.businesses.templates.restaurant).filter({ visible: true }),
  ).not.toHaveCount(0);
}

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/enter$/);
});

test("a platform admin lands in the console and sees every business", async ({
  page,
}, testInfo) => {
  // Home sends the team to the console: they are in no business.
  await signIn(page, ADMIN, /\/admin$/);
  await expectDemoRestaurant(page);
  await expect(
    page
      .getByRole("navigation", { name: he.ui.appShell.mainNav })
      .filter({ visible: true })
      .getByRole("link", { name: a.nav.businesses }),
  ).toHaveAttribute("aria-current", "page");

  await page.screenshot({
    path: testInfo.outputPath("admin-businesses.png"),
    fullPage: true,
  });
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // The console has its own way out, and it closes the session.
  await page.getByRole("button", { name: a.account.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/enter$/);
});

test("an onboarder sees the business list too", async ({ page }) => {
  await signIn(page, ONBOARDER, /\/admin$/);
  await expectDemoRestaurant(page);
});

test("a business manager has no access to the console", async ({ page }) => {
  await signIn(page, MANAGER);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { level: 1, name: a.noAccess.title }),
  ).toBeVisible();
  await expect(page.getByText("מסעדת הדגמה")).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.getByRole("link", { name: a.noAccess.home }).click();
  await expect(page).toHaveURL(/\/home$/);
});
