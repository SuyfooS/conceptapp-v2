import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { clearAvailability, sendDemoAvailability } from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant's manager, and its two
// workers. Noa has sent next week's availability, Yoav has not.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const OWNER_NAME = "אורי הדגמה";
const NOTE = "מבחן ביום שלישי";

const ta = he.app.availability;
const tt = ta.team;
// The text of a message up to its first placeholder or tag.
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
// Any form of an ICU plural message, with # as a number.
const plural = (message: string) =>
  new RegExp(
    [...message.matchAll(/\{([^{}]+)\}/g)]
      .map((m) => (m[1] ?? "").replace("#", "\\d+"))
      .join("|"),
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
  await clearAvailability(NOA.e164);
  await clearAvailability(YOAV.e164);
  await sendDemoAvailability(NOA.e164, NOTE);
});

test.afterEach(async () => {
  await clearAvailability(NOA.e164);
});

test("a manager sees who has not sent availability", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/schedule");
  const entry = page.getByRole("link", { name: new RegExp(tt.title) });
  await expect(entry).toContainText(plural(tt.missing.count));
  await expectCleanPage(page);
  await entry.click();
  await expect(page).toHaveURL(/\/schedule\/availability\/team$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();

  const desktop = (page.viewportSize()?.width ?? 0) >= 1280;
  if (desktop) {
    // One table: a row per person, a column per day.
    const table = page.getByRole("table", { name: tt.everyone });
    const yoav = table.getByRole("row", { name: new RegExp(YOAV.name) });
    await expect(yoav).toContainText(tt.notSent);
    const noa = table.getByRole("row", { name: new RegExp(NOA.name) });
    await expect(noa).toContainText(before(tt.sentAt));
    await expect(noa).toContainText("09:00–17:00");
    await expect(noa).toContainText(NOTE);
    await expect(table).not.toContainText(OWNER_NAME);
  } else {
    const missing = page.getByRole("list", { name: tt.missing.title });
    const sent = page.getByRole("list", { name: tt.sent.title });
    await expect(missing).toContainText(YOAV.name);
    await expect(missing).not.toContainText(NOA.name);
    // Owners plan the schedule; they are not waited for.
    await expect(missing).not.toContainText(OWNER_NAME);
    const noa = sent.getByRole("listitem").filter({ hasText: NOA.name });
    await expect(noa).toContainText(before(tt.sentAt));
    await expect(noa).toContainText("09:00–17:00");
    await expect(noa).toContainText(NOTE);
  }
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-availability.png"),
    fullPage: true,
  });
});

test("a worker has no team availability screen", async ({ page }) => {
  await signIn(page, YOAV);
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(ta.title) }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(tt.title) }),
  ).toHaveCount(0);
  await page.goto("/schedule/availability/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});
