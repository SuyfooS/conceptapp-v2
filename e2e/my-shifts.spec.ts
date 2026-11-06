import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { clearSchedule, scheduleDemoSunday } from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant, its manager and two
// workers. The restaurant template's positions include waiter ("מלצר/ית")
// and bartender ("ברמן/ית").
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };

const ts = he.app.shifts;
// Each screen size has its own layout in the page; only one is shown.
const shown = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true });
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
const first = (name: string) => name.split(" ")[0] ?? name;
const sunday = he.app.availability.weekdays.sun;
// Next week's Sunday shift by name, whatever its date.
const shift = (name: string) =>
  new RegExp(
    `^${before(ts.shift.replace("{name}", name).replace("{day}", sunday))}`,
  );

async function expectCleanPage(page: Page) {
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

test.beforeEach(async () => {
  await clearSchedule();
});

test.afterEach(async () => {
  await clearSchedule();
});

test("a worker sees nothing of a draft schedule", async ({ page }) => {
  await scheduleDemoSunday(
    { morning: [[YOAV.e164, "bartender"]], evening: [] },
    false,
  );
  await signIn(page, YOAV);
  await page.goto("/schedule");
  await expect(shown(page, ts.mine.notPublished)).toBeVisible();
  await expect(page.getByRole("region", { name: shift("בוקר") })).toHaveCount(
    0,
  );
  const entry = page.getByRole("link", { name: new RegExp(ts.title) });
  await expect(entry).toContainText(ts.entry.notPublished);
  await expectCleanPage(page);
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);
  await expect(shown(page, ts.mine.notPublished)).toBeVisible();
  await expect(page.getByRole("region", { name: shift("בוקר") })).toHaveCount(
    0,
  );
  await expectCleanPage(page);
});

test("a worker's schedule tab opens on their next shift and the team's day", async ({
  page,
}, testInfo) => {
  await scheduleDemoSunday(
    {
      morning: [
        [YOAV.e164, "bartender"],
        [NOA.e164, "waiter"],
      ],
      evening: [[NOA.e164, null]],
    },
    true,
  );
  await signIn(page, YOAV);
  await page.goto("/schedule");

  // No further tap: next week's Sunday, their own shift and position first.
  const morning = page.getByRole("region", { name: shift("בוקר") });
  await expect(morning).toContainText(ts.yours);
  await expect(morning).toContainText("09:00");
  await expect(morning).toContainText("ברמן/ית");
  await expect(morning).toContainText(first(NOA.name));
  // The same day's other shift, without them.
  const evening = page.getByRole("region", { name: shift("ערב") });
  await expect(evening).toContainText(first(NOA.name));
  await expect(evening.getByText(ts.yours)).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-tab.png"),
    fullPage: true,
  });

  // A shift opens to everyone on it, with their positions. People come in a
  // stable order (by id): Noa, then Yoav.
  await morning
    .getByRole("button", { name: new RegExp(`^${before(ts.board.open)}`) })
    .click();
  const people = page
    .getByRole("dialog")
    .getByRole("list", { name: ts.sheet.people })
    .getByRole("listitem");
  await expect(people).toHaveCount(2);
  await expect(people.nth(0)).toContainText(NOA.name);
  await expect(people.nth(0)).toContainText("מלצר/ית");
  await expect(people.nth(1)).toContainText(YOAV.name);
  await expect(people.nth(1)).toContainText("ברמן/ית");
  await expectCleanPage(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // My shifts: the next one, its position, and the hours.
  const entry = page.getByRole("link", { name: new RegExp(ts.title) });
  await expect(entry).toContainText(before(ts.entry.next));
  await expect(entry).toContainText("09:00");
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);
  const next = page.getByRole("region", { name: shift("בוקר") });
  await expect(next).toContainText(ts.hero.next);
  await expect(next).toContainText("ברמן/ית");
  await expect(shown(page, "7 שעות")).toBeVisible();
  // The team's week stays on the tab, so this screen has only their own.
  await expect(page.getByRole("region", { name: shift("ערב") })).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("my-shifts.png"),
    fullPage: true,
  });
});
