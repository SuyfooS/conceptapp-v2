import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { availabilityOf, clearAvailability } from "./db";
import { signIn } from "./session";

// A seeded worker of the demo restaurant (supabase/seed.sql), which is
// closed on Shabbat (the restaurant template), sends next week's
// availability.
const WORKER = { local: "050-000-0003", e164: "+972500000003" };

const ta = he.app.availability;
const day = (weekday: keyof typeof ta.weekdays) =>
  new RegExp(`^${ta.day.split("{day}")[0]}${ta.weekdays[weekday]},`);
const before = (message: string) => message.split("{")[0] ?? message;

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

test.beforeEach(async () => {
  await clearAvailability(WORKER.e164);
});

test.afterEach(async () => {
  await clearAvailability(WORKER.e164);
});

test("a worker sends next week's availability around Shabbat", async ({
  page,
}, testInfo) => {
  await signIn(page, WORKER);
  await page.goto("/schedule");
  const entry = page.getByRole("link", { name: new RegExp(ta.title) });
  await expect(entry).toContainText(ta.entry.badge);
  await expectCleanPage(page);
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/availability$/);
  await expect(
    page.getByRole("heading", { level: 1, name: ta.title }),
  ).toBeVisible();
  await expect(page.getByText(ta.noHours)).toHaveCount(7);

  // Sunday: the usual day hours.
  const sunday = page.getByRole("group", { name: day("sun") });
  await sunday.getByRole("button", { name: ta.addRange }).click();
  await expect(sunday.getByLabel(ta.start)).toHaveValue("09:00");
  await expect(sunday.getByLabel(ta.end)).toHaveValue("17:00");

  // Friday says when Shabbat starts, and refuses hours past it.
  const friday = page.getByRole("group", { name: day("fri") });
  await expect(friday).toContainText(before(ta.candleLighting));
  await friday.getByRole("button", { name: ta.addRange }).click();
  await friday.getByLabel(ta.end).fill("23:00");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(friday.getByText(before(ta.errors.ranges.friday))).toBeVisible();
  await expect(page.getByText(ta.fix)).toBeVisible();
  await expectCleanPage(page);
  await friday.getByLabel(ta.end).fill("12:00");
  await expect(page.getByText(ta.fix)).toHaveCount(0);

  // Saturday starts at havdalah.
  const saturday = page.getByRole("group", { name: day("sat") });
  await expect(saturday).toContainText(before(ta.havdalah));
  await saturday.getByRole("button", { name: ta.addRange }).click();
  await saturday.getByLabel(ta.start).fill("12:00");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(
    saturday.getByText(before(ta.errors.ranges.saturday)),
  ).toBeVisible();
  await saturday.getByLabel(ta.start).fill("19:30");

  await page.getByLabel(ta.note).fill("מבחן ביום שלישי");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(page.getByRole("status")).toHaveText(ta.saved);
  await expect(page.getByText(before(ta.sent))).toBeVisible();
  expect(await availabilityOf(WORKER.e164)).toEqual([
    { weekday: 0, start: "09:00", end: "17:00", note: "מבחן ביום שלישי" },
    { weekday: 5, start: "08:00", end: "12:00", note: "מבחן ביום שלישי" },
    { weekday: 6, start: "19:30", end: "23:30", note: "מבחן ביום שלישי" },
  ]);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("availability-sent.png"),
    fullPage: true,
  });

  // Coming back shows the answer to edit; sending no hours is allowed.
  await page.reload();
  await expect(sunday.getByLabel(ta.start)).toHaveValue("09:00");
  await expect(page.getByLabel(ta.note)).toHaveValue("מבחן ביום שלישי");
  for (const group of [sunday, friday, saturday]) {
    await group
      .getByRole("button", { name: new RegExp(`^${before(ta.removeRange)}`) })
      .click();
  }
  await page.getByLabel(ta.note).fill("");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(page.getByRole("status")).toHaveText(ta.saved);
  expect(await availabilityOf(WORKER.e164)).toEqual([]);

  // The schedule shows it as sent.
  await page.goto("/schedule");
  await expect(entry).not.toContainText(ta.entry.badge);
  await expect(entry).toContainText(before(ta.entry.sent));
});
