import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  addDemoShift,
  clearPunchState,
  clearSchedule,
  clearTimeEntries,
  scheduleDemoToday,
  setDemoRequirePunchCode,
  setDemoUnpaidBreaks,
} from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant, its manager and a worker.
// The clock is the real one, so nothing here depends on the hour; each test
// starts with no hours on the clock.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { local: "050-000-0003", e164: "+972500000003" };

const c = he.app.clock;

const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });

/** The circle, by the last words of its name: the time may come before them. */
const circle = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`(^|\\s)${label}$`) });

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
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

async function startClean() {
  await clearTimeEntries(NOA.e164);
  await clearTimeEntries(MANAGER.e164);
  await setDemoUnpaidBreaks(false);
  // One press clocks in here: no code asked for, whatever ran before.
  await setDemoRequirePunchCode(false);
  await clearPunchState();
}

test.beforeEach(startClean);
test.afterAll(startClean);

test("a worker clocks in, goes on a break, comes back and leaves", async ({
  page,
}, testInfo) => {
  await signIn(page, NOA);
  await page.goto("/clock");
  await expect(title(page, c.title.off)).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("clock-off.png"),
    fullPage: true,
  });

  await circle(page, c.circle.in).click();
  await expect(title(page, c.title.working)).toBeVisible();
  await expect(page.getByText(c.breakRule.paid)).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("clock-working.png"),
    fullPage: true,
  });

  // Today says so too, and the row leads back here.
  await page.goto("/home");
  const row = page.getByRole("main").locator('a[href="/clock"]');
  await expect(row).toContainText(c.todayLine.working.split("<")[0] ?? "");
  await row.click();
  await expect(title(page, c.title.working)).toBeVisible();

  await page.getByRole("button", { name: c.startBreak }).click();
  await expect(title(page, c.title.break)).toBeVisible();
  await expectCleanPage(page);
  await circle(page, c.circle.back).click();
  await expect(title(page, c.title.working)).toBeVisible();

  // Leaving can be taken back right after.
  await circle(page, c.circle.out).click();
  await expect(title(page, c.title.off)).toBeVisible();
  await page.getByRole("button", { name: c.undo }).click();
  await expect(title(page, c.title.working)).toBeVisible();

  // On a break, leaving is still one press away, and taking it back returns
  // to the break.
  await page.getByRole("button", { name: c.startBreak }).click();
  await expect(title(page, c.title.break)).toBeVisible();
  await page.getByRole("button", { name: c.endShift }).click();
  await expect(title(page, c.title.off)).toBeVisible();
  await page.getByRole("button", { name: c.undo }).click();
  await expect(title(page, c.title.break)).toBeVisible();
  await page.getByRole("button", { name: c.endShift }).click();
  await expect(title(page, c.title.off)).toBeVisible();

  // It stays after a fresh load.
  await page.reload();
  await expect(title(page, c.title.off)).toBeVisible();
});

test("the month's hours and the history count what was worked", async ({
  page,
}, testInfo) => {
  // Two hours last month with half an hour off them, half an hour this month.
  await addDemoShift(NOA.e164, { monthsAgo: 1, minutes: 120, unpaidBreak: 30 });
  await addDemoShift(NOA.e164, { monthsAgo: 0, minutes: 30, unpaidBreak: 0 });

  await signIn(page, NOA);
  await page.goto("/clock");
  const hours = page.getByRole("definition");
  await expect(hours.nth(0)).toContainText("0:30");
  await expect(hours.nth(1)).toContainText("1:30");

  await page.getByRole("link", { name: c.history.title }).click();
  await expect(page).toHaveURL(/\/clock\/history$/);
  await expect(title(page, c.history.title)).toBeVisible();
  await expectCleanPage(page);
  const main = page.getByRole("main");
  await expect(
    main.getByText("0:30", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);

  // The month before: its total, its shift and the break that came off it.
  await main
    .getByRole("link", { name: c.history.earlier.split("{")[0] ?? "" })
    .click();
  await expect(page).toHaveURL(/month=\d{4}-\d{2}$/);
  await expect(
    main.getByText("1:30", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("clock-history.png"),
    fullPage: true,
  });

  // Nothing further back: the screen says what to do.
  await main
    .getByRole("link", { name: c.history.earlier.split("{")[0] ?? "" })
    .click();
  await expect(main.getByText(c.history.empty.title)).toBeVisible();
  await expectCleanPage(page);

  // A month ahead of today or nonsense in the address shows this month.
  await page.goto("/clock/history?month=2999-01");
  await expect(
    main.getByText("0:30", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);
});

test("the clock knows the person's own shift today, and nobody else's", async ({
  page,
}) => {
  // All day, so nothing here depends on the hour.
  await clearSchedule();
  await scheduleDemoToday([[NOA.e164, null]], { start: "00:00", end: "23:59" });
  try {
    await signIn(page, NOA);
    await page.goto("/clock");
    await expect(page.getByRole("main")).toContainText("00:00–23:59");

    await page.context().clearCookies();
    await signIn(page, MANAGER);
    await page.goto("/clock");
    await expect(page.getByText(c.line.noShift)).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("00:00–23:59");
  } finally {
    await clearSchedule();
  }
});

test("a manager chooses that breaks come off the hours", async ({ page }) => {
  await signIn(page, MANAGER);
  await page.goto("/manage/time_clock");
  const unpaid = page.getByRole("switch", {
    name: he.modules.time_clock.settings.unpaidBreaks.label,
  });
  await expect(unpaid).toHaveAttribute("aria-checked", "false");
  // Whether a code is asked for is the owner's to change.
  await expect(
    page.getByText(he.modules.time_clock.settings.requirePunchCode.label),
  ).toHaveCount(0);
  await unpaid.click();
  await expect(
    page.getByText(he.app.manage.saved, { exact: true }),
  ).toBeVisible();

  // And the person on the clock is told.
  await page.goto("/clock");
  await circle(page, c.circle.in).click();
  await expect(title(page, c.title.working)).toBeVisible();
  await expect(page.getByText(c.breakRule.unpaid)).toBeVisible();
  await circle(page, c.circle.out).click();
  await expect(title(page, c.title.off)).toBeVisible();
});
