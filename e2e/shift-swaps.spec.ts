import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { clearSchedule, demoSwaps, scheduleDemoSunday } from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant and two of its workers.
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };

const sw = he.app.shifts.swap;
// Each screen size has its own layout in the page; only one is shown.
const button = (page: Page, text: string) =>
  page
    .getByRole("button", { name: new RegExp(`^${text}, `) })
    .filter({ visible: true });
const shown = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true });

async function expectCleanPage(page: Page) {
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

async function as(browser: Browser, page: Page, person: typeof NOA) {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: test.info().project.use.baseURL,
  });
  const other = await context.newPage();
  await signIn(other, person);
  await other.goto("/schedule/shifts");
  return other;
}

test.beforeEach(async () => {
  await clearSchedule();
});

test.afterEach(async () => {
  await clearSchedule();
});

test("a worker gives a shift away, a colleague takes it, the worker cancels", async ({
  page,
  browser,
}, testInfo) => {
  await scheduleDemoSunday(
    {
      morning: [[YOAV.e164, "bartender"]],
      evening: [[NOA.e164, "waiter"]],
    },
    true,
  );

  // Yoav gives away his morning.
  await signIn(page, YOAV);
  await page.goto("/schedule/shifts");
  await expect(shown(page, sw.offers.empty)).toBeVisible();
  await button(page, sw.buttons.give).click();
  await expect(shown(page, sw.open)).toBeVisible();
  await expect(button(page, sw.buttons.cancel)).toBeVisible();
  expect(await demoSwaps()).toEqual([
    { status: "open", from: YOAV.e164, to: null },
  ]);
  await expectCleanPage(page);

  // Noa sees it among the shifts she can take, and takes it.
  const noa = await as(browser, page, NOA);
  const offers = noa
    .getByRole("list", { name: sw.offers.title })
    .filter({ visible: true });
  await expect(offers.getByRole("listitem")).toHaveCount(1);
  await expect(offers).toContainText("ברמן/ית");
  await expect(offers).toContainText(
    sw.offers.from.replace("{name}", YOAV.name),
  );
  await button(noa, sw.buttons.take).click();
  await expect(shown(noa, sw.offers.takenByYou)).toBeVisible();
  await expect(button(noa, sw.buttons.take)).toHaveCount(0);
  expect(await demoSwaps()).toEqual([
    { status: "taken", from: YOAV.e164, to: NOA.e164 },
  ]);
  await expectCleanPage(noa);
  await noa.screenshot({
    path: testInfo.outputPath("shift-swaps-taken.png"),
    fullPage: true,
  });
  await noa.context().close();

  // Yoav sees who took it; until a manager decides he can still withdraw.
  await page.reload();
  await expect(shown(page, sw.taken.replace("{name}", NOA.name))).toBeVisible();
  await button(page, sw.buttons.cancel).click();
  await expect(button(page, sw.buttons.give)).toBeVisible();
  expect((await demoSwaps()).map((s) => s.status)).toEqual(["cancelled"]);
});
