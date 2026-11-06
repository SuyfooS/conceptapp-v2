import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

// The passive door (Orel, 6 November 2026): one press on a person of the demo
// restaurant, seeded with these emails in supabase/seed.sql.
const e = he.auth.enter;

const person = (page: Page, key: keyof typeof e.people) =>
  page.getByRole("button", { name: new RegExp(e.people[key].name) });

test("signed-out visitors choose who they are and come in", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/enter$/);
  await expect(page.getByText(e.warning)).toBeVisible();
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // A worker: in with no phone and no code, and only a worker's reach.
  await person(page, "worker").click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();

  // The door doesn't show to someone already in.
  await page.goto("/enter");
  await expect(page).toHaveURL(/\/home$/);

  // Leaving comes back to the door, to come in as someone else.
  await page.getByRole("button", { name: he.app.home.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await person(page, "manager").click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.team.title }),
  ).toBeVisible();
});

test("the console is not on offer", async ({ page }) => {
  await page.goto("/enter");
  await person(page, "owner").click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { level: 1, name: he.admin.noAccess.title }),
  ).toBeVisible();
});
