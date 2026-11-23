import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  AFTER_SIGN_IN_COOKIE,
  AFTER_SIGN_IN_MAX_AGE,
} from "../packages/domain/after-sign-in";
import {
  clearSchedule,
  scheduleDemoSunday,
  scheduleDemoToday,
  waitOutDemoMidnight,
} from "./db";
import { signIn } from "./session";
import { expect, type Page, test } from "./test";

// A link's page after sign-in (known issue 21): a signed-out visitor who
// opens a link to a screen of the app goes through the door and lands on
// that screen, by code and by the demo door. The page is kept in an
// httpOnly cookie for 15 minutes, never in the door's address, and taken
// once. A link to no screen (a download, the console) keeps nothing, a
// planted one that isn't a screen lands on Today, and signing out forgets a
// kept one. Seeded in supabase/seed.sql: Noa and Yoav, workers of the demo
// restaurant who sign in by SMS, a different one per test so neither waits
// out the other's code.
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const YOAV = { local: "050-000-0004", e164: "+972500000004" };
const e = he.auth.enter;

/** The cookie that keeps the page, as the browser holds it. */
async function kept(page: Page) {
  return (await page.context().cookies()).find(
    (cookie) => cookie.name === AFTER_SIGN_IN_COOKIE,
  );
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

/** In through the demo door, as the demo restaurant's worker. */
async function enterAsWorker(page: Page) {
  await page
    .getByRole("region", { name: e.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(e.people.worker.name) })
    .click();
}

test.beforeEach(async () => {
  await clearSchedule();
});

test.afterEach(async () => {
  await clearSchedule();
});

test("a signed-out visitor opens a week's link, signs in by code, and lands on that week", async ({
  page,
}, testInfo) => {
  await waitOutDemoMidnight(testInfo);
  // Next week out with Noa on Sunday morning, and this week too, with her on
  // today's morning: without the link the tab would open on this week
  // (`scheduleOpening`), so only the link's `?week=` leads to next week.
  const start = await scheduleDemoSunday(
    { morning: [[NOA.e164, null]], evening: [] },
    true,
  );
  await scheduleDemoToday([[NOA.e164, null]]);
  const link = `/schedule?week=${start}`;

  // The door, its address bare, and the page kept for the server alone.
  await page.goto(link);
  await expect(page).toHaveURL(/\/enter$/);
  const cookie = await kept(page);
  expect(cookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: false,
  });
  expect(decodeURIComponent(cookie?.value ?? "")).toBe(link);
  const left = (cookie?.expires ?? 0) - Date.now() / 1000;
  expect(left).toBeGreaterThan(AFTER_SIGN_IN_MAX_AGE - 60);
  expect(left).toBeLessThanOrEqual(AFTER_SIGN_IN_MAX_AGE);

  // The door's phone link, then a code: the week from the link.
  await page.getByRole("link", { name: e.phone }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, NOA, new RegExp(`/schedule\\?week=${start}$`));
  await expect(
    page.getByRole("button", { name: he.app.shifts.week.next, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(await kept(page)).toBeUndefined();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("link-week.png"),
    fullPage: true,
  });
});

test("a link to no screen, the console, or a planted one is never where sign-in lands", async ({
  page,
  baseURL,
}) => {
  // The latest page opened wins: a download or the console forgets a page
  // kept before, and keeps nothing.
  await page.goto("/lists");
  await expect(page).toHaveURL(/\/enter$/);
  expect(decodeURIComponent((await kept(page))?.value ?? "")).toBe("/lists");
  for (const path of ["/clock/pay/export?month=2026-10", "/admin"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/enter$/);
    expect(await kept(page), path).toBeUndefined();
  }

  // One the browser was made to hold, leading off the site, is checked
  // again as sign-in takes it: Today.
  await page.context().addCookies([
    {
      name: AFTER_SIGN_IN_COOKIE,
      value: encodeURIComponent("//evil.example/schedule"),
      url: baseURL ?? "",
    },
  ]);
  await signIn(page, YOAV);
  expect(await kept(page)).toBeUndefined();
});

test("the demo door lands on the link too, and signing out forgets a kept link", async ({
  page,
  baseURL,
}) => {
  await page.goto("/lists");
  await expect(page).toHaveURL(/\/enter$/);
  await enterAsWorker(page);
  await expect(page).toHaveURL(/\/lists$/);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.lists.title }),
  ).toBeVisible();
  expect(await kept(page)).toBeUndefined();

  // Signing out forgets one kept on this device, so the next person here
  // starts on Today.
  await page
    .context()
    .addCookies([
      { name: AFTER_SIGN_IN_COOKIE, value: "%2Fchat", url: baseURL ?? "" },
    ]);
  await page.goto("/me");
  await page.getByRole("button", { name: he.app.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  expect(await kept(page)).toBeUndefined();
  await enterAsWorker(page);
  await expect(page).toHaveURL(/\/home$/);
});
