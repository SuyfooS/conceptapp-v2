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
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
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
  const entry = page.getByRole("link", { name: new RegExp(ts.title) });
  await expect(entry).toContainText(ts.entry.notPublished);
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);
  await expect(page.getByText(ts.mine.notPublished)).toBeVisible();
  await expect(page.getByRole("region", { name: shift("בוקר") })).toHaveCount(
    0,
  );
  await expectCleanPage(page);
});

test("a worker reads their shifts and the team's in the published schedule", async ({
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
  const entry = page.getByRole("link", { name: new RegExp(ts.title) });
  await expect(entry).toContainText(before(ts.entry.next));
  await expect(entry).toContainText("09:00");
  await entry.click();

  // Their own shift, with the position they work in.
  const mine = page.getByRole("list", { name: ts.mine.title });
  await expect(mine.getByRole("listitem")).toHaveCount(1);
  await expect(mine).toContainText("בוקר");
  await expect(mine).toContainText("ברמן/ית");
  await expect(page.getByText("7 שעות")).toBeVisible();

  // The whole team's week: who works with them, and the evening without them.
  const morning = page.getByRole("region", { name: shift("בוקר") });
  // People come in a stable order (by id): Noa, then Yoav.
  await expect(morning.getByRole("listitem")).toHaveText([
    `${NOA.name} · מלצר/ית`,
    `${YOAV.name} · ברמן/ית`,
  ]);
  await expect(morning.getByText(ts.yours)).toBeVisible();
  const evening = page.getByRole("region", { name: shift("ערב") });
  await expect(evening.getByRole("listitem")).toHaveText([NOA.name]);
  await expect(evening.getByText(ts.yours)).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("my-shifts.png"),
    fullPage: true,
  });
});
