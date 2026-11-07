import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { setDemoWording } from "./db";
import { signIn } from "./session";

// A business's own sentences (Orel, 7 November 2026): one row replaces a
// sentence wherever it shows, on the server (the tab bar) and in the browser
// (the week board), and clearing it brings the app's back.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const TAB = { key: "modules.scheduling.name", sentence: "המשמרות שלנו" };
const WEEK = { key: "app.shifts.week.this", sentence: "השבוע הזה" };

async function navItems(page: Page): Promise<string[]> {
  const nav = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  await expect(nav).toHaveCount(1);
  return (await nav.getByRole("link").allInnerTexts()).map((s) => s.trim());
}

test.afterEach(async () => {
  await setDemoWording(TAB.key, null, he.modules.scheduling.name);
  await setDemoWording(WEEK.key, null, he.app.shifts.week.this);
});

test("a business's own sentence replaces the app's, and clearing it brings it back", async ({
  page,
}, testInfo) => {
  await setDemoWording(TAB.key, TAB.sentence, he.modules.scheduling.name);
  await setDemoWording(WEEK.key, WEEK.sentence, he.app.shifts.week.this);
  await signIn(page, MANAGER);

  expect(await navItems(page)).toContain(TAB.sentence);
  expect(await navItems(page)).not.toContain(he.modules.scheduling.name);
  await page.goto("/schedule");
  await expect(
    page.getByRole("button", { name: WEEK.sentence, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("wording-schedule.png"),
    fullPage: true,
  });

  await setDemoWording(TAB.key, null, he.modules.scheduling.name);
  await setDemoWording(WEEK.key, null, he.app.shifts.week.this);
  await page.goto("/schedule");
  expect(await navItems(page)).toContain(he.modules.scheduling.name);
  await expect(
    page.getByRole("button", { name: he.app.shifts.week.this, exact: true }),
  ).toBeVisible();
});
