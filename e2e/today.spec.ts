import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearAvailability,
  clearSchedule,
  demoSwaps,
  scheduleDemoSunday,
  scheduleDemoToday,
  sendDemoAvailability,
  takenDemoSwap,
} from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant, its manager and two
// workers. The restaurant template's positions include waiter ("מלצר/ית") and
// bartender ("ברמן/ית"). The clock is the real one, so nothing here depends on
// the hour or the day: next week's shifts always lie ahead, and a shift today
// is listed under who works today whether or not it ended.
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };

const h = he.app.home;
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
const main = (page: Page) => page.getByRole("main");
const linkTo = (page: Page, href: string) =>
  main(page).locator(`a[href="${href}"]`);

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
  await clearAvailability(YOAV.e164);
});

test.afterEach(async () => {
  await clearSchedule();
  await clearAvailability(YOAV.e164);
});

test("before anything is published, a worker is told what to do next", async ({
  page,
}, testInfo) => {
  await signIn(page, YOAV);
  await expect(
    page.getByRole("heading", { level: 1, name: /, יואב$/ }),
  ).toBeVisible();

  const hero = page.getByRole("region", { name: h.hero.next });
  await expect(hero).toContainText(h.hero.notPublished.title);
  await expect(hero).toContainText(h.hero.notPublished.worker);
  await expect(
    main(page).getByRole("heading", { level: 2, name: h.who.title }),
  ).toHaveCount(0);

  // Their own availability, and nothing a manager deals with.
  const tile = main(page).getByRole("link", {
    name: new RegExp(h.needs.availability.due.value),
  });
  await expect(tile).toHaveAttribute("href", "/schedule/availability");
  await expect(linkTo(page, "/schedule/swaps")).toHaveCount(0);
  await expect(linkTo(page, "/schedule/build")).toHaveCount(0);
  await expect(linkTo(page, "/schedule/availability/team")).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("today-not-published.png"),
    fullPage: true,
  });

  // Once it is sent, the tile says so and the hero offers to change it.
  await sendDemoAvailability(YOAV.e164, "");
  await page.reload();
  await expect(tile).toHaveCount(0);
  await expect(
    main(page).getByRole("link", {
      name: new RegExp(h.needs.availability.sent.value),
    }),
  ).toBeVisible();
  await hero.getByRole("link", { name: h.hero.updateAvailability }).click();
  await expect(page).toHaveURL(/\/schedule\/availability$/);
});

test("a worker reads their next shift and who else works it", async ({
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

  const hero = page.getByRole("region", { name: h.hero.next });
  await expect(hero).toContainText("בוקר");
  await expect(hero).toContainText("09:00");
  await expect(hero).toContainText(
    `${before(h.hero.until)}16:00, ברמן/ית, ${before(h.hero.with)}נועה`,
  );
  // The clock is not built yet, so the hero has nothing to punch.
  await expect(hero.getByRole("button")).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("today-worker.png"),
    fullPage: true,
  });

  // Next week is published, this one is not.
  await expect(main(page)).toContainText(h.who.notPublished);

  await hero.getByRole("link", { name: h.hero.myShifts }).click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);
});

test("a manager sees the first request over the hero, and what needs them", async ({
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
  expect(await demoSwaps()).toEqual([
    { status: "taken", from: NOA.e164, to: YOAV.e164 },
  ]);
  await signIn(page, MANAGER);

  // On no shift themselves: the business's next one.
  const hero = page.getByRole("region", { name: h.hero.businessNext });
  await expect(hero).toContainText("בוקר");
  await expect(hero).toContainText("1 מתוך 3 שובצו");
  await expect(hero).toContainText("יואב");

  // Open places: two of three on the morning, three of four on the evening.
  const gaps = linkTo(page, "/schedule/build");
  await expect(gaps).toContainText("5");
  await expect(gaps).toContainText("מקומות פנויים בשבוע הבא");
  // One request, on its tile and on the floating card.
  await expect(
    linkTo(page, "/schedule/swaps").filter({
      hasText: "בקשת החלפה מחכה לאישור",
    }),
  ).toContainText("1");
  // Next week is published, so nobody is asked for availability any more.
  await expect(linkTo(page, "/schedule/availability/team")).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("today-manager.png"),
    fullPage: true,
  });

  await main(page)
    .getByRole("link", {
      name: new RegExp(
        h.swap.title.replace("{to}", "יואב").replace("{from}", "נועה"),
      ),
    })
    .click();
  await expect(page).toHaveURL(/\/schedule\/swaps$/);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.swaps.title }),
  ).toBeVisible();
});

test("before anything is published, a manager is sent to build the week", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  const hero = page.getByRole("region", { name: h.hero.businessNext });
  await expect(hero).toContainText(h.hero.notPublished.manager);
  await expect(linkTo(page, "/schedule/availability/team")).toBeVisible();
  await expect(page.getByText(h.who.title)).toHaveCount(0);
  await expectCleanPage(page);

  await hero.getByRole("link", { name: h.hero.build }).click();
  await expect(page).toHaveURL(/\/schedule\/build$/);
});

test("everyone reads who works today", async ({ page }, testInfo) => {
  await scheduleDemoToday([
    [YOAV.e164, "bartender"],
    [NOA.e164, "waiter"],
  ]);
  await signIn(page, NOA);

  await expect(
    main(page).getByRole("heading", { level: 2, name: h.who.title }),
  ).toBeVisible();
  const shift = page.getByRole("region", {
    name: new RegExp(
      `^${before(he.app.shifts.shift.replace("{name}", "בוקר"))}`,
    ),
  });
  await expect(shift).toContainText("09:00–16:00");
  await expect(shift).toContainText(YOAV.name);
  await expect(shift).toContainText("ברמן/ית");
  await expect(shift).toContainText(NOA.name);
  await expect(shift).toContainText("מלצר/ית");
  // Two of the three people the shift needs.
  await expect(shift).toContainText("חסר עובד אחד");
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("today-who-works.png"),
    fullPage: true,
  });

  await main(page).getByRole("link", { name: h.who.week }).click();
  await expect(page).toHaveURL(/\/schedule\/shifts$/);
});
