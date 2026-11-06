import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearSchedule,
  demoSwaps,
  scheduleAssignments,
  scheduleDemoSunday,
  takenDemoSwap,
} from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant and two of its workers.
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };

const sw = he.app.shifts.swap;
const ap = he.app.swaps;
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

// Noa signs in first and Yoav second: sign-in.spec.ts runs next and asks
// for a code for Noa, which the auth server refuses within 5 seconds.
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

  // Noa gives away her evening.
  await signIn(page, NOA);
  await page.goto("/schedule/shifts");
  await expect(shown(page, sw.offers.empty)).toBeVisible();
  await button(page, sw.buttons.give).click();
  await expect(shown(page, sw.open)).toBeVisible();
  await expect(button(page, sw.buttons.cancel)).toBeVisible();
  expect(await demoSwaps()).toEqual([
    { status: "open", from: NOA.e164, to: null },
  ]);
  await expectCleanPage(page);

  // Yoav sees it among the shifts he can take, and takes it.
  const yoav = await as(browser, page, YOAV);
  const offers = yoav
    .getByRole("list", { name: sw.offers.title })
    .filter({ visible: true });
  await expect(offers.getByRole("listitem")).toHaveCount(1);
  await expect(offers).toContainText("מלצר/ית");
  await expect(offers).toContainText(
    sw.offers.from.replace("{name}", NOA.name),
  );
  await button(yoav, sw.buttons.take).click();
  await expect(shown(yoav, sw.offers.takenByYou)).toBeVisible();
  await expect(button(yoav, sw.buttons.take)).toHaveCount(0);
  expect(await demoSwaps()).toEqual([
    { status: "taken", from: NOA.e164, to: YOAV.e164 },
  ]);
  await expectCleanPage(yoav);
  await yoav.screenshot({
    path: testInfo.outputPath("shift-swaps-taken.png"),
    fullPage: true,
  });
  await yoav.context().close();

  // Noa sees who took it; until a manager decides she can still withdraw.
  await page.reload();
  await expect(
    shown(page, sw.taken.replace("{name}", YOAV.name)),
  ).toBeVisible();
  await button(page, sw.buttons.cancel).click();
  await expect(button(page, sw.buttons.give)).toBeVisible();
  expect((await demoSwaps()).map((s) => s.status)).toEqual(["cancelled"]);
});

test("a manager approves a taken request and the colleague takes the shift", async ({
  page,
}, testInfo) => {
  await scheduleDemoSunday(
    {
      morning: [[YOAV.e164, "bartender"]],
      evening: [[NOA.e164, "waiter"]],
    },
    true,
  );
  await takenDemoSwap("evening", NOA.e164, YOAV.e164);

  // The schedule's entry shows the request waiting before it is opened.
  await signIn(page, MANAGER);
  await page.goto("/schedule");
  const row = page.getByRole("link", { name: new RegExp(ap.title) });
  await expect(row).toContainText(
    ap.count.replace(/.*one \{([^}]*)\}.*/, "$1"),
  );
  await row.click();
  await expect(page).toHaveURL(/\/schedule\/swaps$/);

  const visible = (
    testInfo.project.name === "desktop"
      ? page.getByRole("table", { name: ap.list.title })
      : page.getByRole("list", { name: ap.list.title })
  ).filter({ visible: true });
  await expect(visible).toContainText(NOA.name);
  await expect(visible).toContainText(YOAV.name);
  await expect(visible).toContainText("מלצר/ית");
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("swap-approvals.png"),
    fullPage: true,
  });

  await button(page, ap.buttons.approve).click();
  await expect(shown(page, ap.empty)).toBeVisible();
  expect(await demoSwaps()).toEqual([
    { status: "approved", from: NOA.e164, to: YOAV.e164 },
  ]);
  // Yoav works both Sunday shifts now, as a waiter in the evening.
  expect(
    (await scheduleAssignments()).map(({ pattern, phone, position }) => [
      pattern,
      phone,
      position,
    ]),
  ).toEqual([
    ["morning", YOAV.e164, "bartender"],
    ["evening", YOAV.e164, "waiter"],
  ]);
  await expectCleanPage(page);

  // Back on the entry, nothing waits any more.
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(ap.title) }),
  ).toContainText(ap.entry.subtitle.replace(/.*=0 \{([^}]*)\}.*/, "$1"));
});
