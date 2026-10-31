import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearAvailability,
  clearSchedule,
  scheduleAssignments,
  sendDemoAvailability,
} from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant (restaurant template:
// a morning shift 09:00–16:00 for three people from Sunday to Thursday),
// its manager and two workers. Noa sends 09:00–17:00 for next Sunday;
// Yoav sends nothing.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };

const tb = he.app.build;
// The text of a message up to its first placeholder or tag.
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
// Any form of an ICU plural message, with # as a number.
const plural = (message: string) =>
  new RegExp(
    [...message.matchAll(/\{([^{}]+)\}/g)]
      .map((m) => (m[1] ?? "").replace("#", "\\d+"))
      .join("|"),
  );
// Next week's Sunday morning shift, whatever its date.
const sundayMorning = new RegExp(
  `^${before(
    tb.shift
      .replace("{name}", "בוקר")
      .replace("{day}", he.app.availability.weekdays.sun),
  )}`,
);

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
  await clearSchedule();
  await clearAvailability(NOA.e164);
  await clearAvailability(YOAV.e164);
  await sendDemoAvailability(NOA.e164, "אפשר גם בערב");
});

test.afterEach(async () => {
  await clearSchedule();
  await clearAvailability(NOA.e164);
});

test("a manager puts people on next week's shifts", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/schedule");
  const entry = page.getByRole("link", { name: new RegExp(tb.title) });
  await expect(entry).toContainText(tb.entry.subtitleDraft);
  await expect(entry).toContainText(plural(tb.gaps));
  await expectCleanPage(page);
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/build$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();

  // Phone and tablet open on the week's first day; desktop shows it all.
  const shift = page.getByRole("region", { name: sundayMorning });
  await expect(shift).toHaveCount(1);
  await expect(shift).toContainText(tb.nobody);
  const add = shift.getByLabel(tb.add);
  // Noa said she is free, Yoav has not answered.
  await expect(
    add.locator(`optgroup[label="${tb.groups.available}"] option`, {
      hasText: NOA.name,
    }),
  ).toHaveCount(1);
  await expect(
    add.locator(`optgroup[label="${tb.groups.noAnswer}"] option`, {
      hasText: YOAV.name,
    }),
  ).toHaveCount(1);
  await add.selectOption({ label: NOA.name });
  await expect(shift.getByRole("listitem")).toContainText([NOA.name]);
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164 },
  ]);

  // Saved: it comes back after a reload, with when it was saved.
  await page.reload();
  const saved = page.getByRole("region", { name: sundayMorning });
  await expect(saved.getByRole("listitem")).toContainText([NOA.name]);
  await expect(page.getByText(before(tb.savedAt))).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-build.png"),
    fullPage: true,
  });

  // Taking her off and saving leaves the shift empty again.
  await saved
    .getByRole("button", {
      name: tb.remove.replace("{name}", NOA.name),
    })
    .click();
  await expect(saved).toContainText(tb.nobody);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments()).toEqual([]);
});

test("a worker has no schedule building screen", async ({ page }) => {
  await signIn(page, YOAV);
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(he.app.availability.title) }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(tb.title) }),
  ).toHaveCount(0);
  await page.goto("/schedule/build");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});
