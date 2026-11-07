import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  allowDemoReset,
  demoBusinessDetails,
  demoShopWeek,
  setDemoBusinessDetails,
} from "./db";

// The passive door (Orel, 6 November 2026): one press on a person of a demo
// business, seeded with these emails in supabase/seed.sql.
const e = he.auth.enter;

const person = (page: Page, key: keyof typeof e.people) =>
  page.getByRole("button", { name: new RegExp(e.people[key].name) });

/** Names of the main navigation items visible at this width, in order. */
async function navItems(page: Page): Promise<string[]> {
  const nav = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  await expect(nav).toHaveCount(1);
  return (await nav.getByRole("link").allInnerTexts()).map((s) => s.trim());
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

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

test("the door offers a restaurant and a shop, each with its people", async ({
  page,
}, testInfo) => {
  await page.goto("/enter");
  for (const business of Object.values(e.businesses)) {
    await expect(
      page.getByRole("heading", { level: 2, name: business.name }),
    ).toBeVisible();
  }
  for (const key of Object.keys(e.people) as (keyof typeof e.people)[]) {
    await expect(person(page, key)).toBeVisible();
  }
  await expect(page.getByText(e.warning)).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath("enter-door.png"),
    fullPage: true,
  });
});

test("in the shop, this week is already published and no tab is empty", async ({
  page,
}, testInfo) => {
  await page.goto("/enter");
  await person(page, "shopWorker").click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByText(e.businesses.shop.name).filter({ visible: true }).first(),
  ).toBeVisible();
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    he.modules.scheduling.name,
    he.modules.time_clock.name,
  ]);
  const week = await demoShopWeek();
  expect(week.published).toBe(true);
  expect(week.assigned).toBeGreaterThan(0);
  await expectAccessible(page);

  // Both tabs open a real screen. This week reads as published on the
  // schedule, whichever day of the week it is.
  const notFound = page.getByRole("heading", {
    level: 1,
    name: he.app.notFound.title,
  });
  await page.goto("/schedule");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(notFound).toHaveCount(0);
  await page
    .getByRole("button", { name: he.app.shifts.week.this, exact: true })
    .click();
  await expect(page.getByText(/פורסם ב-/).first()).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("enter-shop-schedule.png"),
    fullPage: true,
  });

  await page.goto("/clock");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(notFound).toHaveCount(0);
  await expectAccessible(page);
});

// The restaurant as supabase/seed.sql starts it.
const SEEDED_RESTAURANT = {
  name: e.businesses.restaurant.name,
  accent: "#2563eb",
  address: "רחוב הדגמה 1, תל אביב",
  shabbatCity: "telAviv",
};

test("the door puts the demo back the way it started", async ({
  page,
}, testInfo) => {
  const changed = "שם ששונה בבדיקה";
  // Another screen size may have reset it seconds ago; this test's reset
  // must not be skipped for that.
  await allowDemoReset();
  await setDemoBusinessDetails({ ...SEEDED_RESTAURANT, name: changed });
  try {
    const r = e.reset;
    const open = page.getByRole("button", { name: r.open });
    await page.goto("/enter");
    await open.click();
    await expect(open).toHaveAttribute("aria-expanded", "true");
    // The warning is read out first.
    await expect(page.getByText(r.body)).toBeFocused();
    await expectAccessible(page);
    await page.screenshot({
      path: testInfo.outputPath("enter-reset.png"),
      fullPage: true,
    });
    // Changing one's mind leaves everything as it is.
    await page.getByRole("button", { name: r.cancel }).click();
    await expect(page.getByText(r.body)).toHaveCount(0);
    await expect(open).toBeFocused();
    expect((await demoBusinessDetails()).name).toBe(changed);

    await open.click();
    await page.getByRole("button", { name: r.confirm }).click();
    await expect(
      page.getByRole("status").filter({ hasText: r.done }),
    ).toBeVisible();
    await expect(open).toBeFocused();
    expect(await demoBusinessDetails()).toEqual(SEEDED_RESTAURANT);
    // The shop's week is published again straight after.
    expect((await demoShopWeek()).published).toBe(true);
  } finally {
    // Whatever failed above, later specs find the restaurant as seeded.
    if ((await demoBusinessDetails()).name === changed) {
      await setDemoBusinessDetails(SEEDED_RESTAURANT);
    }
  }
});
