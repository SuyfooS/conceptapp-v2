import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { availabilityOf, clearAvailability } from "./db";
import { signIn } from "./session";

// A seeded worker of the demo restaurant (supabase/seed.sql), which is
// closed on Shabbat (the restaurant template), sends next week's
// availability.
const WORKER = { local: "050-000-0003", e164: "+972500000003" };

const ta = he.app.availability;
type Weekday = keyof typeof ta.weekdays;
// A day on the screen: a row on phones, a card from tablet up, one at a time.
const dayButton = (page: Page, weekday: Weekday) =>
  page.getByRole("button", {
    name: ta.dayName.replace("{day}", ta.weekdays[weekday]),
  });
// The text of a message up to its first placeholder or tag.
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
// A tap on a day opens its hours in a sheet, titled with the date too.
async function openDay(page: Page, weekday: Weekday) {
  await dayButton(page, weekday).click();
  const sheet = page.getByRole("dialog", {
    name: new RegExp(`^${ta.day.split("{day}")[0]}${ta.weekdays[weekday]},`),
  });
  await expect(sheet).toBeVisible();
  return sheet;
}
async function finishSheet(sheet: Locator) {
  await sheet.getByRole("button", { name: ta.sheet.done }).click();
  await expect(sheet).toHaveCount(0);
}
const removeButton = (sheet: Locator) =>
  sheet.getByRole("button", { name: new RegExp(`^${before(ta.removeRange)}`) });
async function writeNote(page: Page, note: string) {
  await page.getByRole("button", { name: ta.note }).click();
  const sheet = page.getByRole("dialog", { name: ta.note });
  await sheet.getByRole("textbox", { name: ta.note }).fill(note);
  await finishSheet(sheet);
}

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
  await expect(
    page.getByRole("button").filter({ hasText: ta.noHours }),
  ).toHaveCount(7);

  // Sunday opens with the usual day hours, and one tap keeps them.
  const sunday = await openDay(page, "sun");
  await expect(sunday.getByLabel(ta.start)).toHaveValue("09:00");
  await expect(sunday.getByLabel(ta.end)).toHaveValue("17:00");
  await expectCleanPage(page);
  await finishSheet(sunday);
  await expect(dayButton(page, "sun")).toContainText("09:00–17:00");

  // Closing a day without "done" leaves it as it was.
  const monday = await openDay(page, "mon");
  await monday.getByRole("button", { name: ta.sheet.close }).click();
  await expect(monday).toHaveCount(0);
  await expect(dayButton(page, "mon")).toContainText(ta.noHours);

  // Friday says when Shabbat starts, and refuses hours past it.
  await expect(dayButton(page, "fri")).toContainText(
    before(ta.candleLightingShort),
  );
  const friday = await openDay(page, "fri");
  await expect(friday).toContainText(before(ta.candleLighting));
  await friday.getByLabel(ta.end).fill("23:00");
  await friday.getByRole("button", { name: ta.sheet.done }).click();
  await expect(friday.getByText(before(ta.errors.ranges.friday))).toBeVisible();
  await expectCleanPage(page);
  await friday.getByLabel(ta.end).fill("12:00");
  await expect(friday.getByText(before(ta.errors.ranges.friday))).toHaveCount(
    0,
  );
  await finishSheet(friday);

  // Saturday starts at havdalah.
  await expect(dayButton(page, "sat")).toContainText(before(ta.havdalahShort));
  const saturday = await openDay(page, "sat");
  await expect(saturday).toContainText(before(ta.havdalah));
  await saturday.getByLabel(ta.start).fill("12:00");
  await saturday.getByRole("button", { name: ta.sheet.done }).click();
  await expect(
    saturday.getByText(before(ta.errors.ranges.saturday)),
  ).toBeVisible();
  // Havdalah moves with the season (about 17:30 in winter, past 20:30 in
  // summer), so the hour comes from the sheet, never a fixed time.
  const havdalah = /\d{2}:\d{2}/.exec(
    (await saturday.getByText(before(ta.havdalah)).textContent()) ?? "",
  )?.[0];
  if (!havdalah) throw new Error("no havdalah time on Saturday's sheet");
  await saturday.getByLabel(ta.start).fill(havdalah);
  await finishSheet(saturday);

  await writeNote(page, "מבחן ביום שלישי");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(
    page.getByRole("status").filter({ hasText: ta.saved }),
  ).toBeVisible();
  await expect(page.getByText(before(ta.sent))).toBeVisible();
  expect(await availabilityOf(WORKER.e164)).toEqual([
    { weekday: 0, start: "09:00", end: "17:00", note: "מבחן ביום שלישי" },
    { weekday: 5, start: "08:00", end: "12:00", note: "מבחן ביום שלישי" },
    { weekday: 6, start: havdalah, end: "23:30", note: "מבחן ביום שלישי" },
  ]);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("availability-sent.png"),
    fullPage: true,
  });

  // Coming back shows the answer to edit; sending no hours is allowed.
  await page.reload();
  await expect(dayButton(page, "sun")).toContainText("09:00–17:00");
  await expect(page.getByRole("button", { name: ta.note })).toContainText(
    "מבחן ביום שלישי",
  );
  const again = await openDay(page, "sun");
  await expect(again.getByLabel(ta.start)).toHaveValue("09:00");
  // A removal can be taken back.
  await removeButton(again).click();
  await expect(again.getByLabel(ta.start)).toHaveCount(0);
  await again.getByRole("button", { name: ta.sheet.undo }).click();
  await expect(again.getByLabel(ta.start)).toHaveValue("09:00");
  await removeButton(again).click();
  await finishSheet(again);
  await expect(dayButton(page, "sun")).toContainText(ta.noHours);
  for (const weekday of ["fri", "sat"] as const) {
    const sheet = await openDay(page, weekday);
    await removeButton(sheet).click();
    await finishSheet(sheet);
  }
  await writeNote(page, "");
  await page.getByRole("button", { name: ta.submit }).click();
  await expect(
    page.getByRole("status").filter({ hasText: ta.saved }),
  ).toBeVisible();
  expect(await availabilityOf(WORKER.e164)).toEqual([]);

  // The schedule shows it as sent.
  await page.goto("/schedule");
  await expect(entry).not.toContainText(ta.entry.badge);
  await expect(entry).toContainText(before(ta.entry.sent));
});
