import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { businessBySlug } from "./db";
import { signIn } from "./session";

// Seeded onboarder (supabase/seed.sql): may open businesses but not delete
// them. admin.spec signs the same number in long before this spec runs.
const ONBOARDER = { local: "050-000-0006", e164: "+972500000006" };

const a = he.admin;
const w = a.newBusiness;

async function expectCleanPage(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const next = (page: Page) =>
  page.getByRole("button", { name: w.actions.next }).click();

test("an onboarder opens a café from the template in three steps", async ({
  page,
}, testInfo) => {
  // Unique per screen size and run: the local database keeps each one.
  const slug = `e2e-${testInfo.project.name}-${Date.now().toString(36)}`;
  const name = `קפה בדיקה ${testInfo.project.name}`;

  await signIn(page, ONBOARDER, /\/admin$/);
  await page
    .getByRole("link", { name: a.businesses.new })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/new$/);
  await expect(
    page.getByRole("heading", { level: 1, name: w.title }),
  ).toBeVisible();

  // Step 1: the kind of business.
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.template }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: new RegExp(w.templates["cafe-bar"].name) })
    .check();
  await page.screenshot({
    path: testInfo.outputPath("new-business-1-template.png"),
    fullPage: true,
  });
  await expectCleanPage(page);
  await next(page);

  // Step 2: details. Empty fields are caught before moving on.
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.details }),
  ).toBeVisible();
  await next(page);
  await expect(page.getByText(w.errors.name.required)).toBeVisible();
  await expect(page.getByText(w.errors.slug.required)).toBeVisible();

  await page.getByLabel(w.fields.name.label, { exact: true }).fill(name);
  // Taken by the seeded demo restaurant: only the server knows.
  await page
    .getByLabel(w.fields.slug.label, { exact: true })
    .fill("demo-restaurant");
  await page
    .getByLabel(w.fields.address.label, { exact: true })
    .fill("רחוב הבדיקה 5, חיפה");
  await page.screenshot({
    path: testInfo.outputPath("new-business-2-details.png"),
    fullPage: true,
  });
  await expectCleanPage(page);
  await next(page);

  // Step 3: colour, with a live preview and the summary.
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.accent }),
  ).toBeVisible();
  await page.getByTitle(w.accent.presets.teal).click();
  await expect(
    page.getByRole("radio", { name: w.accent.presets.teal }),
  ).toBeChecked();
  await expect(
    page
      .getByText("demo-restaurant", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("new-business-3-accent.png"),
    fullPage: true,
  });
  await expectCleanPage(page);
  await page.getByRole("button", { name: w.actions.create }).click();

  // The server refuses the taken slug and the form goes back to it.
  await expect(page.getByText(w.errors.slug.taken)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.details }),
  ).toBeVisible();
  await page.getByLabel(w.fields.slug.label, { exact: true }).fill(slug);
  await next(page);
  await page.getByRole("button", { name: w.actions.create }).click();

  // Back on the list, with the new business in it.
  await expect(page).toHaveURL(/\/admin\?created=/);
  await expect(
    page
      .getByRole("status")
      .getByText(a.businesses.opened.title.replace("{name}", name)),
  ).toBeVisible();
  await expect(
    page.getByText(name, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("new-business-4-opened.png"),
    fullPage: true,
  });
  await expectCleanPage(page);

  // Set up from the template in one go, and recorded.
  expect(await businessBySlug(slug)).toEqual({
    name,
    accent: "#0f766e",
    templateKey: "cafe-bar",
    modules: 5,
    audited: 1,
  });
});

test("a business manager cannot open the wizard", async ({ page }) => {
  // The shift manager; admin.spec signed them in last, before modules.spec.
  await signIn(page, { local: "050-000-0002", e164: "+972500000002" });
  await page.goto("/admin/new");
  await expect(
    page.getByRole("heading", { level: 1, name: a.noAccess.title }),
  ).toBeVisible();
  await expect(
    page.getByLabel(w.fields.name.label, { exact: true }),
  ).toHaveCount(0);
});
