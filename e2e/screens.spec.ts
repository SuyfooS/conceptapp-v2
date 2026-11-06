import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

// The console, the door to the app and the screens for when something is
// missing, on their demos: both appearances, no data and no sign-in. What they
// do with real data is in admin, new-business, sign-in, invite and view-as.
const PAGES = [
  "/design/console",
  "/design/console/new",
  "/design/console/businesses/cafe-noa",
  "/design/console/businesses/demo-restaurant",
  "/design/shell/team/invite",
  "/design/shell/view-as",
  "/design/shell/module",
  "/design/shell/unavailable",
  "/design/screens/sign-in",
  "/design/screens/join",
  "/design/screens/join-expired",
  "/design/screens/join-claimed",
  "/design/screens/no-business",
  "/design/screens/no-access",
  "/design/screens/error",
  "/design/screens/not-found",
];

async function expectAccessible(page: Page) {
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

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} is clean`, async ({ page }) => {
        await page.goto(path);
        await expect(page).toHaveTitle(/ConceptApp$/);
        await expectAccessible(page);
      });
    }
  });
}

const e = he.errors;
const w = he.admin.newBusiness;

test("a failure shows a Hebrew screen, and trying again recovers", async ({
  page,
}) => {
  await page.goto("/design/screens/error-boundary");
  await page.getByRole("button", { name: he.design.errorDemoAction }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: e.title }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: e.home })).toHaveAttribute(
    "href",
    "/home",
  );
  await expectAccessible(page);

  await page.getByRole("button", { name: e.retry }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: he.design.errorDemoTitle }),
  ).toBeVisible();
});

test("an address that leads nowhere gets the Hebrew screen", async ({
  page,
}) => {
  await page.goto("/there-is-no-such-screen");
  await expect(
    page.getByRole("heading", { level: 1, name: e.notFound.title }),
  ).toBeVisible();
  await expectAccessible(page);
  await expect(page.getByRole("link", { name: e.home })).toHaveAttribute(
    "href",
    "/home",
  );
});

test("the wizard shows one step at a time and goes back to a taken address", async ({
  page,
}) => {
  await page.goto("/design/console/new");
  const next = page.getByRole("button", { name: w.actions.next });
  const step = (name: string) =>
    page.getByRole("heading", { level: 2, name, exact: true });

  // The first step has no way back but the link to the list.
  await expect(step(w.steps.template)).toBeVisible();
  await expect(page.getByRole("button", { name: w.actions.back })).toHaveCount(
    0,
  );
  await page
    .getByRole("radio", { name: new RegExp(w.templates["cafe-bar"].name) })
    .check();
  await next.click();

  await expect(step(w.steps.details)).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeHidden();
  await page.getByLabel(w.fields.name.label, { exact: true }).fill("קפה בדיקה");
  await page
    .getByLabel(w.fields.slug.label, { exact: true })
    .fill("demo-restaurant");
  await next.click();

  await expect(step(w.steps.accent)).toBeVisible();
  await page.getByTitle(w.accent.presets.teal).click();
  await next.click();

  await expect(step(w.steps.staff)).toBeVisible();
  await page.getByRole("button", { name: w.actions.back }).click();
  await expect(step(w.steps.accent)).toBeVisible();
  await next.click();
  await page.getByRole("button", { name: w.actions.create }).click();

  await expect(page.getByText(w.errors.slug.taken)).toBeVisible();
  await expect(step(w.steps.details)).toBeVisible();
});
