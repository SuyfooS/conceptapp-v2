import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  addOpenDemoEntry,
  clearPunchState,
  clearTimeEntries,
  demoActivityActions,
  setDemoRequirePunchCode,
} from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant, its manager and a worker.
// The worker's hours are written straight to the database, as if they had
// clocked in; what's tested is what a manager sees and does about them.
const MANAGER = {
  name: "שירן הדגמה",
  local: "050-000-0002",
  e164: "+972500000002",
};
const NOA = {
  name: "נועה כהן",
  local: "050-000-0003",
  e164: "+972500000003",
};

const c = he.app.clock;
const t = c.team;
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
const overdueOne = "משמרת אחת צריכה תיקון";
/** A message with its {placeholders} filled in. */
const filled = (message: string, values: Record<string, string>) =>
  message.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);

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
  await setDemoRequirePunchCode(false);
  await clearPunchState();
}

test.beforeEach(startClean);
test.afterAll(startClean);

test("a worker has no team hours", async ({ page }) => {
  await signIn(page, NOA);
  await page.goto("/clock");
  await expect(page.getByRole("link", { name: t.title })).toHaveCount(0);
  await page.goto("/clock/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});

test("a manager sees who is at work and fixes a shift left open", async ({
  page,
}, testInfo) => {
  await addOpenDemoEntry(NOA.e164, 2);
  await signIn(page, MANAGER);

  // The clock leads to the team and says how many are at work.
  await page.goto("/clock");
  await page.getByRole("link", { name: t.title }).click();
  await expect(page).toHaveURL(/\/clock\/team$/);
  const atWork = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: t.atWork.title }) });
  await expect(atWork.getByText(NOA.name)).toBeVisible();
  await expect(page.getByText(overdueOne)).toHaveCount(0);
  await expectCleanPage(page);

  // Forgotten for over a day: Today and the team both say so, before anyone asks.
  await clearTimeEntries(NOA.e164);
  await addOpenDemoEntry(NOA.e164, 30);
  await page.goto("/home");
  await expect(
    page.getByRole("main").locator('a[href="/clock"]'),
  ).toContainText(overdueOne);
  await page.goto("/clock/team");
  await expect(page.getByText(overdueOne)).toBeVisible();
  // They need fixing; they aren't at work.
  await expect(atWork.getByText(NOA.name)).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-overdue.png"),
    fullPage: true,
  });

  // Fixing it: the shift opens with its times, and it needs an end.
  await page
    .getByRole("link", { name: new RegExp(before(t.overdue.row)) })
    .click();
  await expect(page).toHaveURL(/\/clock\/team\/[0-9a-f-]+\?month=/);
  const month = new URL(page.url()).searchParams.get("month");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expectCleanPage(page);
  const main = page.getByRole("main");
  await main
    .getByRole("button", { name: new RegExp(c.history.fix) })
    .filter({ visible: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel(t.sheet.in)).not.toHaveValue("");
  await expectCleanPage(page);

  // Changing a field keeps the sheet as it is: focus stays, and a picker stays open.
  await sheet.getByLabel(t.sheet.in).press("ArrowUp");
  await expect(sheet.getByLabel(t.sheet.in)).toBeFocused();
  await sheet.getByRole("button", { name: t.sheet.saveEdit }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.needsEnd);

  // An hour after it began, on the same date or the next.
  const start = await sheet.getByLabel(t.sheet.in).inputValue();
  const hour = (Number(start.slice(0, 2)) + 1) % 24;
  await sheet
    .getByLabel(t.sheet.out)
    .fill(`${String(hour).padStart(2, "0")}${start.slice(2)}`);

  // Without a reason nothing is saved: the field says why it's needed.
  const since = new Date();
  await sheet.getByRole("button", { name: t.sheet.saveEdit }).click();
  const reasonField = sheet.getByLabel(t.sheet.reason);
  await expect(reasonField).toBeFocused();
  await expect(reasonField).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.getByText(t.failure.reasonNeeded)).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(await demoActivityActions("clock.correct", since)).toBe(0);
  await expectCleanPage(page);

  const reason = `שכחה לצאת ${Date.now()}`;
  await reasonField.fill(reason);
  await sheet.getByRole("button", { name: t.sheet.saveEdit }).click();
  await expect(sheet).toBeHidden();
  await expect(
    main.getByText("1:00", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);
  // The shift says who corrected it, and why.
  const corrected = filled(c.history.corrected, {
    name: MANAGER.name,
    note: reason,
  });
  await expect(
    main.getByText(corrected).filter({ visible: true }),
  ).toBeVisible();

  // Fixed, it leaves the list of what needs fixing.
  await page.goto("/clock/team");
  await expect(page.getByText(overdueOne)).toHaveCount(0);

  // The activity log keeps the reason.
  await page.goto("/manage/activity");
  await expect(
    page
      .getByText(
        filled(he.app.manage.activity.actions.clock.reason, { note: reason }),
      )
      .filter({ visible: true }),
  ).toBeVisible();

  // And the worker reads it in their own history.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(
    page.getByRole("main").getByText(corrected).filter({ visible: true }),
  ).toBeVisible();
  await expectCleanPage(page);
});

test("a manager adds a shift someone forgot, and hours can't be in the future", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await page.goto("/clock/team");
  const main = page.getByRole("main");
  await main
    .getByRole("link", { name: new RegExp(NOA.name) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expect(main.getByText(t.person.emptyTitle)).toBeVisible();

  // A month back, so the date is always in the past.
  const shown = page.url();
  await main
    .getByRole("link", { name: new RegExp(before(c.history.earlier)) })
    .click();
  await expect(page).not.toHaveURL(shown);
  const month = new URL(page.url()).searchParams.get("month");
  await page.getByRole("button", { name: t.person.add }).click();
  const sheet = page.getByRole("dialog");
  await expectCleanPage(page);

  // It starts in the month on screen, not today's.
  await expect(sheet.getByLabel(t.sheet.date)).toHaveValue(`${month}-01`);

  // Why it's added, kept with the shift.
  const reason = `שכחה להחתים ${Date.now()}`;
  await sheet.getByLabel(t.sheet.reason).fill(reason);

  // No end yet.
  await sheet.getByLabel(t.sheet.date).fill(`${month}-10`);
  await sheet.getByLabel(t.sheet.in).fill("08:00");
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.needsEnd);

  // The same time twice is a mistake, not a full day.
  await sheet.getByLabel(t.sheet.out).fill("08:00");
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.sameTime);

  // In the future.
  await sheet.getByLabel(t.sheet.date).fill("2999-01-01");
  await sheet.getByLabel(t.sheet.out).fill("10:30");
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.future);

  await sheet.getByLabel(t.sheet.date).fill(`${month}-10`);
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet).toBeHidden();
  await expect(
    main.getByText("2:30", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);

  // The same hours again overlap what's there. A new sheet asks why again.
  await page.getByRole("button", { name: t.person.add }).click();
  await expect(sheet.getByLabel(t.sheet.reason)).toHaveValue("");
  await sheet.getByLabel(t.sheet.date).fill(`${month}-10`);
  await sheet.getByLabel(t.sheet.in).fill("09:00");
  await sheet.getByLabel(t.sheet.out).fill("10:00");
  await sheet.getByLabel(t.sheet.reason).fill(reason);
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.times);
  await sheet.getByRole("button", { name: t.sheet.close }).click();
  await expect(sheet).toBeHidden();

  // The worker sees it in their own history, as the manager's, with why.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(
    page
      .getByText(filled(c.history.added, { name: MANAGER.name, note: reason }))
      .filter({ visible: true }),
  ).toBeVisible();
});
