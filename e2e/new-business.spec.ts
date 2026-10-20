import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { businessBySlug, invitesBySlug } from "./db";
import { signIn } from "./session";

// Seeded onboarder and platform admin (supabase/seed.sql). admin.spec signs
// both numbers in long before this spec runs, so the SMS resend cooldown
// never trips.
const ONBOARDER = { local: "050-000-0006", e164: "+972500000006" };
const PLATFORM_ADMIN = { local: "050-000-0005", e164: "+972500000005" };

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

const remaining = (count: number) =>
  count === 0
    ? "הכול מוכן"
    : count === 1
      ? "נשאר דבר אחד"
      : `נשארו ${count} דברים`;

test("an onboarder opens a café from the template, with no staff yet", async ({
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

  // Step 3: colour, with a live preview.
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.accent }),
  ).toBeVisible();
  await page.getByTitle(w.accent.presets.teal).click();
  await expect(
    page.getByRole("radio", { name: w.accent.presets.teal }),
  ).toBeChecked();
  await page.screenshot({
    path: testInfo.outputPath("new-business-3-accent.png"),
    fullPage: true,
  });
  await expectCleanPage(page);
  await next(page);

  // Step 4: the staff list, left empty.
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.staff }),
  ).toBeVisible();
  await expect(page.getByText("עוד לא נוספו אנשים").first()).toBeVisible();
  // The summary, beside the form on desktop and closing this step on
  // phones and tablets.
  await expect(
    page
      .getByText("demo-restaurant", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: w.actions.create }).click();

  // The server refuses the taken slug and the form goes back to it.
  await expect(page.getByText(w.errors.slug.taken)).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.details }),
  ).toBeVisible();
  await page.getByLabel(w.fields.slug.label, { exact: true }).fill(slug);
  await next(page);
  await next(page);
  await page.getByRole("button", { name: w.actions.create }).click();

  // The checklist: open, with an address, but nobody invited yet.
  await expect(page).toHaveURL(`/admin/businesses/${slug}?created=1`);
  await expect(
    page
      .getByRole("status")
      .getByText(a.setup.opened.title.replace("{name}", name)),
  ).toBeVisible();
  await expect(page.getByText(remaining(2))).toBeVisible();
  await expect(page.getByText(a.setup.people.empty)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("new-business-5-checklist.png"),
    fullPage: true,
  });
  await expectCleanPage(page);

  // The list leads back to it.
  await page.getByRole("link", { name: a.setup.back }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page
    .getByRole("link", { name: new RegExp(name) })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(`/admin/businesses/${slug}`);
  await expect(page.getByRole("status")).toHaveCount(0);

  // Set up from the template in one go, and recorded.
  expect(await businessBySlug(slug)).toEqual({
    name,
    accent: "#0f766e",
    templateKey: "cafe-bar",
    modules: 5,
    audited: 1,
  });
  expect(await invitesBySlug(slug)).toEqual([]);
});

test("a platform admin opens a restaurant and invites its staff", async ({
  page,
}, testInfo) => {
  const slug = `e2e-staff-${testInfo.project.name}-${Date.now().toString(36)}`;
  const name = `מסעדת בדיקה ${testInfo.project.name}`;

  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/new");

  await page
    .getByRole("radio", { name: new RegExp(w.templates.restaurant.name) })
    .check();
  await next(page);
  await page.getByLabel(w.fields.name.label, { exact: true }).fill(name);
  await page.getByLabel(w.fields.slug.label, { exact: true }).fill(slug);
  await page
    .getByLabel(w.fields.address.label, { exact: true })
    .fill("רחוב הבדיקה 7, תל אביב");
  await next(page);
  await next(page);

  // A pasted list with one line to fix. Fictional numbers; nothing is sent.
  await expect(
    page.getByRole("heading", { level: 2, name: w.steps.staff }),
  ).toBeVisible();
  const list = page.getByLabel(w.staff.label, { exact: true });
  await list.fill(
    [
      "רונית בדיקה 050-000-0701 בעלים",
      "שי בדיקה, מנהל, 0500000702",
      "תמר בדיקה 03-1234567",
    ].join("\n"),
  );
  await expect(page.getByText("שורה אחת צריכה תיקון")).toBeVisible();
  await expect(
    page.getByText(`שורה 3 · ${w.staff.lineErrors.invalidPhone}`),
  ).toBeVisible();
  await page.getByRole("button", { name: w.actions.create }).click();
  await expect(page.getByText(w.errors.staff.invalid)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/new$/);

  await list.fill(
    [
      "רונית בדיקה 050-000-0701 בעלים",
      "שי בדיקה, מנהל, 0500000702",
      "תמר בדיקה 050-000-0703",
    ].join("\n"),
  );
  await expect(page.getByText("3 אנשים יוזמנו").first()).toBeVisible();
  const invited = page.getByRole("list", { name: w.staff.listLabel });
  await expect(invited.getByRole("listitem")).toHaveCount(3);
  await expect(invited.getByText("050-000-0701")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("new-business-staff.png"),
    fullPage: true,
  });
  await expectCleanPage(page);
  await page.getByRole("button", { name: w.actions.create }).click();

  // The checklist: everything done, and the three people invited.
  await expect(page).toHaveURL(`/admin/businesses/${slug}?created=1`);
  await expect(page.getByText(remaining(0))).toBeVisible();
  for (const person of ["רונית בדיקה", "שי בדיקה", "תמר בדיקה"]) {
    await expect(
      page.getByText(person, { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
  }
  await page.screenshot({
    path: testInfo.outputPath("new-business-staff-checklist.png"),
    fullPage: true,
  });
  await expectCleanPage(page);

  expect(await businessBySlug(slug)).toMatchObject({
    name,
    templateKey: "restaurant",
    modules: 5,
    audited: 1,
  });
  expect(await invitesBySlug(slug)).toEqual([
    { name: "רונית בדיקה", phone: "+972500000701", role: "owner" },
    { name: "שי בדיקה", phone: "+972500000702", role: "manager" },
    { name: "תמר בדיקה", phone: "+972500000703", role: "worker" },
  ]);
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
