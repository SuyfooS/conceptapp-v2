import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { standInForTurnstile } from "./captcha";
import {
  clearSchedule,
  decideDemoSwap,
  demoSwaps,
  requestDemoSwap,
  scheduleAssignments,
  scheduleDemoSunday,
  scheduleDemoToday,
  takenDemoSwap,
  waitOutDemoMidnight,
} from "./db";
import { type Person, signIn } from "./session";
import { heT } from "./t";
import { type Browser, expect, type Page, test } from "./test";

// Seeded in supabase/seed.sql: the demo restaurant and two of its workers.
const NOA = { name: "נועה כהן", local: "050-000-0003", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };

const sw = he.app.shifts.swap;
const past = he.app.shifts.past;
const sheet = he.app.shifts.sheet;
const ap = he.app.swaps;
// Each screen size has its own layout in the page; only one is shown.
const button = (page: Page, text: string) =>
  page
    .getByRole("button", { name: new RegExp(`^${text}, `) })
    .filter({ visible: true });
// The screen's own words, not the toast that says the same once a step went
// through (a status of its own).
const shown = (page: Page, text: string) =>
  page
    .getByText(text)
    .filter({ visible: true })
    .and(page.locator('xpath=//*[not(ancestor-or-self::*[@role="status"])]'));
/** What a step that went through says, in its screen's toast. */
const toast = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });
/** The button that opens a shift's sheet: its place on the screen. */
const shiftTarget = (page: Page) =>
  page
    .getByRole("button", {
      name: new RegExp(`^${he.app.shifts.board.open.split("{")[0]}`),
    })
    .filter({ visible: true });
// "מה קרה לבקשות שלך": the same rows on every size.
const pastList = (page: Page) =>
  page.getByRole("list", { name: past.title }).filter({ visible: true });
// "כבר לא מחכות להחלטה": cards on phones and tablets, a table on desktops.
const endedList = (page: Page, project: string) =>
  (project === "desktop"
    ? page.getByRole("table", { name: ap.ended.title })
    : page.getByRole("list", { name: ap.ended.title })
  ).filter({ visible: true });

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

async function as(
  browser: Browser,
  page: Page,
  person: Person,
  path = "/schedule/shifts",
) {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: test.info().project.use.baseURL,
  });
  await standInForTurnstile(context);
  const other = await context.newPage();
  await signIn(other, person);
  await other.goto(path);
  return other;
}

test.beforeEach(async () => {
  await clearSchedule();
});

test.afterEach(async () => {
  await clearSchedule();
});

// Noa signs in first and Yoav second: sign-in.spec.ts runs next and asks
// for a code for Noa, which the auth server refuses within its resend wait.
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

  // The sheet says what will happen, and nothing has happened yet.
  await button(page, sw.buttons.give).click();
  const giving = page.getByRole("dialog");
  await expect(giving).toContainText(sheet.give);
  await expect(giving).toContainText(sheet.giveNote);
  expect(await demoSwaps()).toEqual([]);
  await expectCleanPage(page);
  await giving
    .getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) })
    .click();
  await expect(giving).toHaveCount(0);
  await expect(shown(page, sw.open)).toBeVisible();
  await expect(button(page, sw.buttons.cancel)).toBeVisible();
  // Said wherever the focus is, and the focus is back on her shift, whose
  // "מסירת המשמרת" gave way to the request (accessibility, part 3).
  await expect(toast(page, sw.open)).toBeVisible();
  await expect(shiftTarget(page)).toHaveCount(1);
  await expect(shiftTarget(page)).toBeFocused();
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
  // Nobody chose a form of address: the neutral words (profile.spec.ts puts
  // its people back).
  await expect(offers).toContainText(
    heT("app.shifts.swap.offers.from", { name: NOA.name, form: "x" }),
  );
  await button(yoav, sw.buttons.take).click();
  const taking = yoav.getByRole("dialog");
  await expect(taking).toContainText(
    sheet.take.replace("{name}", NOA.name.split(" ")[0] ?? NOA.name),
  );
  expect(await demoSwaps()).toEqual([
    { status: "open", from: NOA.e164, to: null },
  ]);
  await expectCleanPage(yoav);
  await taking
    .getByRole("button", { name: new RegExp(`^${sw.buttons.take}, `) })
    .click();
  await expect(taking).toHaveCount(0);
  await expect(shown(yoav, sw.offers.takenByYou)).toBeVisible();
  await expect(button(yoav, sw.buttons.take)).toHaveCount(0);
  // Said, and the focus is on the offer's words, where its button was.
  await expect(toast(yoav, sw.offers.takenByYou)).toBeVisible();
  await expect(offers.getByText(sw.offers.takenByYou)).toBeFocused();
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
    shown(page, heT("app.shifts.swap.taken", { name: YOAV.name, form: "x" })),
  ).toBeVisible();
  await button(page, sw.buttons.cancel).click();
  await expect(button(page, sw.buttons.give)).toBeVisible();
  expect((await demoSwaps()).map((s) => s.status)).toEqual(["cancelled"]);
  // "ביטול הבקשה" went with the focus: it is on her shift, and it is said.
  await expect(toast(page, sw.cancelled)).toBeVisible();
  await expect(shiftTarget(page)).toBeFocused();
  // What became of it stays in sight, and her shift says nothing more.
  await expect(pastList(page)).toContainText(past.withdrawnFrom);
  await expect(shown(page, sw.declined)).toHaveCount(0);
});

// A declined request no longer vanishes (the roadmap's known issue 7): the
// worker who asked reads it on her shift, which she can offer again, and on
// Home; the colleague who took it reads that it wasn't approved; and the
// manager still sees it, with who decided, once nothing waits. Once the week
// is replaced, the request stays as it was decided: the list still says what
// happened, never whose the shift is now, and that its shift was taken off.
test("a declined request says so to the worker who asked and to the colleague who took it, and stays on the manager's board", async ({
  page,
  browser,
}, testInfo) => {
  const sunday: Parameters<typeof scheduleDemoSunday>[0] = {
    morning: [[YOAV.e164, "bartender"]],
    evening: [[NOA.e164, "waiter"]],
  };
  await scheduleDemoSunday(sunday, true);
  await takenDemoSwap("evening", NOA.e164, YOAV.e164);
  await decideDemoSwap(false);
  expect(await demoSwaps()).toEqual([
    { status: "declined", from: NOA.e164, to: YOAV.e164 },
  ]);

  await signIn(page, NOA);
  await page.goto("/schedule/shifts");
  await expect(shown(page, sw.declined)).toBeVisible();
  await expect(button(page, sw.buttons.give)).toBeVisible();
  await expect(pastList(page)).toContainText(
    heT("app.shifts.past.declined", { name: YOAV.name }),
  );
  await expect(pastList(page)).not.toContainText(past.gone);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("swap-declined.png"),
    fullPage: true,
  });
  await page.goto("/home");
  await expect(shown(page, sw.declined)).toBeVisible();

  const yoav = await as(browser, page, YOAV);
  await expect(pastList(yoav)).toContainText(
    heT("app.shifts.past.declined", { name: NOA.name }),
  );
  await expect(button(yoav, sw.buttons.take)).toHaveCount(0);
  await expectCleanPage(yoav);
  await yoav.context().close();

  const manager = await as(browser, page, MANAGER, "/schedule/swaps");
  await expect(shown(manager, ap.empty)).toBeVisible();
  const ended = endedList(manager, testInfo.project.name);
  await expect(ended).toContainText(NOA.name);
  await expect(ended).toContainText(YOAV.name);
  await expect(ended).toContainText(ap.ended.declinedYou);
  await expectCleanPage(manager);
  await manager.screenshot({
    path: testInfo.outputPath("swap-ended.png"),
    fullPage: true,
  });
  await manager.context().close();

  // Published again with nothing read: the week is replaced, her evening
  // with it, and a decided request is not the write's to end.
  await scheduleDemoSunday(sunday, true);
  expect(await demoSwaps()).toEqual([
    { status: "declined", from: NOA.e164, to: YOAV.e164 },
  ]);
  await page.goto("/schedule/shifts");
  const row = pastList(page)
    .getByRole("listitem")
    .filter({ hasText: heT("app.shifts.past.declined", { name: YOAV.name }) });
  await expect(row).toContainText(past.gone);
  await expect(shown(page, sw.declined)).toHaveCount(0);
  await expect(button(page, sw.buttons.give)).toBeVisible();
  await expectCleanPage(page);
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
  // The request went with the focus, and nothing else waits: it is on what
  // was decided (accessibility, part 3).
  await expect(page.locator("[data-settled]").first()).toBeFocused();
  // It says what was decided, since the decision cannot be undone.
  await expect(
    page.getByRole("status").filter({
      hasText: (
        ap.settled.approved
          .replace("{to}", YOAV.name)
          .replace("{from}", NOA.name)
          .split("{")[0] ?? ""
      ).trim(),
    }),
  ).toBeVisible();
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

  // Read again, the decision is still in sight, under nothing waiting.
  await expect(endedList(page, testInfo.project.name)).toContainText(
    ap.ended.approvedYou,
  );

  // Back on the entry, nothing waits any more.
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(ap.title) }),
  ).toContainText(ap.entry.subtitle.replace(/.*=0 \{([^}]*)\}.*/, "$1"));
});

// A publish that replaces the week ends a waiting request (`schedule`,
// private.write_week_schedule): the list says why, and her evening, now
// another shift, says nothing of the one replaced.
test("a request the schedule ended says why", async ({ page }) => {
  const sunday: Parameters<typeof scheduleDemoSunday>[0] = {
    morning: [[YOAV.e164, "bartender"]],
    evening: [[NOA.e164, "waiter"]],
  };
  await scheduleDemoSunday(sunday, true);
  await requestDemoSwap("evening", NOA.e164);
  // Published again with nothing read: the week is replaced.
  await scheduleDemoSunday(sunday, true);
  expect((await demoSwaps()).map((s) => s.status)).toEqual(["cancelled"]);

  await signIn(page, NOA);
  await page.goto("/schedule/shifts");
  await expect(pastList(page)).toContainText(past.schedule);
  await expect(pastList(page)).toContainText(past.gone);
  await expect(shown(page, sw.removed)).toHaveCount(0);
  await expect(button(page, sw.buttons.give)).toBeVisible();
  await expectCleanPage(page);
});

// A shift that has begun is no longer given away: the database refuses it
// from its start on, and the screen no longer offers it, though the day is
// still today. All day, so it has begun whatever the hour, and never in the
// day's last minutes: over midnight it would be yesterday's, which the screen
// no longer lists.
test("a shift that has begun today offers no giving away", async ({
  page,
}, testInfo) => {
  await waitOutDemoMidnight(testInfo);
  await scheduleDemoToday([[YOAV.e164, "bartender"]], {
    start: "00:00",
    end: "23:59",
  });
  await signIn(page, YOAV);
  await page.goto("/schedule/shifts");

  const hero = page.getByRole("heading", { level: 2, name: "בוקר, 00:00" });
  await expect(hero).toBeVisible();
  await expect(shown(page, he.app.shifts.yours).first()).toBeVisible();
  await expect(button(page, sw.buttons.give)).toHaveCount(0);
  await expectCleanPage(page);

  // Nor its sheet.
  await page
    .getByRole("button", {
      name: new RegExp(`^${he.app.shifts.board.open.replace("{shift}", "")}`),
    })
    .filter({ visible: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText(he.app.shifts.sheet.people);
  await expect(sheet).not.toContainText(he.app.shifts.sheet.give);
  await expect(
    sheet.getByRole("button", { name: new RegExp(`^${sw.buttons.give}, `) }),
  ).toHaveCount(0);
  expect(await demoSwaps()).toEqual([]);
});
