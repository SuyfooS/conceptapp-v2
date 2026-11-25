import AxeBuilder from "@axe-core/playwright";
import { SCREEN_UNDO_MS } from "../app/(app)/schedule/build/builder-toast";
import he from "../messages/he.json" with { type: "json" };
import { daysLeftToRight } from "../packages/domain/share";
import { before, buildScreen, HOLD_MS } from "./build-screen";
import {
  buildDemoNextWeek,
  buildDemoThisWeek,
  clearAvailability,
  clearSchedule,
  type DemoWeekShift,
  databaseNow,
  decideDemoSwap,
  demoActivityActions,
  demoModuleSettings,
  demoRunningWeekClock,
  demoSwaps,
  demoWeekPublished,
  publishDemoRunningWeek,
  putOnDemoNextSunday,
  requestDemoSwap,
  saveDemoRunningWeek,
  scheduleAssignments,
  scheduleDemoSunday,
  scheduleDemoToday,
  schedulePublished,
  scheduleShiftIds,
  scheduleShifts,
  sendDemoAvailability,
  setDemoModuleSettings,
  takenDemoSwap,
  waitOutDemoMidnight,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Seeded in supabase/seed.sql: the demo restaurant (restaurant template:
// from Sunday to Thursday a morning shift 09:00–16:00 for three people and
// an evening shift 16:00–23:30 for four; Friday morning; Saturday night),
// its manager and two workers. Noa sends 09:00–17:00 for next Sunday;
// Yoav sends nothing. The template's positions include "מלצר/ית" (waiter).
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const NOA = {
  name: "נועה כהן",
  first: "נועה",
  local: "050-000-0003",
  e164: "+972500000003",
};
const YOAV = {
  name: "יואב לוי",
  first: "יואב",
  local: "050-000-0004",
  e164: "+972500000004",
};
const WAITER = "מלצר/ית";
const BUSINESS = "מסעדת הדגמה";

const tb = he.app.build;
const ts = he.app.shifts.share;
const us = he.ui.share;
/**
 * A week's dates in words, as the page's own browser writes them (the share
 * reads them on the device): seven days from `start`, the days of one month
 * held left to right as the share holds them.
 */
const rangeIn = async (page: Page, start: string) =>
  daysLeftToRight(
    await page.evaluate((first) => {
      const day = new Date(`${first}T00:00:00Z`);
      return new Intl.DateTimeFormat("he", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).formatRange(day, new Date(day.getTime() + 6 * 86_400_000));
    }, start),
  );
/** The text a WhatsApp link writes. */
const whatsappText = (href: string | null) =>
  new URL(href ?? "").searchParams.get("text");
/**
 * A test that waits out a publish held for its undo (`HOLD_MS` each) gets
 * the time for it.
 */
const HELD_TEST_MS = 90_000;
/** Text to find as it is, inside a pattern. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Next week's builder: /schedule/build, which names its week (`?week=`) once
 * it is on the screen; any week but `not`, when given.
 */
const nextWeekUrl = (not?: string) =>
  new RegExp(
    `/schedule/build(\\?week=${not ? `(?!${not})` : ""}\\d{4}-\\d{2}-\\d{2})?$`,
  );
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
  const screen = buildScreen(page);
  await signIn(page, MANAGER);
  await page.goto("/schedule");
  const entry = page.getByRole("link", { name: new RegExp(tb.title) });
  await expect(entry).toContainText(tb.entry.subtitleDraft);
  await expect(entry).toContainText(plural(tb.gaps));
  await expectCleanPage(page);
  await entry.click();
  await expect(page).toHaveURL(nextWeekUrl());
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();

  // A phone opens on the week's first day; tablet and desktop show it all.
  const shift = screen.card("בוקר");
  await expect(shift).toHaveCount(1);
  await expect(shift).toContainText(tb.nobody);

  // Tapping the shift opens its sheet. Noa said she is free, Yoav has not
  // answered.
  await shift.click();
  await expect(screen.group(tb.groups.assigned)).toContainText(tb.nobody);
  await expect(screen.group(tb.groups.available)).toContainText(NOA.name);
  await expect(screen.group(tb.groups.noAnswer)).toContainText(YOAV.name);
  await expectCleanPage(page);
  await screen.addButton(NOA.name).click();
  await expect(screen.group(tb.groups.assigned)).toContainText(NOA.name);

  // She works as a waiter on this shift; the shift counts its positions.
  await screen.positionButton(NOA.name, tb.noPosition).click();
  await page.getByRole("menuitemradio", { name: WAITER }).click();
  await expect(screen.positionButton(NOA.name, WAITER)).toBeVisible();
  await screen.closeSheet();
  await expect(shift).toContainText(NOA.first);
  await expect(shift).toContainText(
    tb.inPosition.replace("{name}", WAITER).replace("{count}", "1"),
  );
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  // The builder started again from what was saved, the pressed button gone:
  // the focus is on the line that says where the week stands.
  await expect(page.locator("[data-builder-status]")).toBeFocused();
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: "waiter" },
  ]);

  // Saved: it comes back after a reload, with when it was saved.
  await page.reload();
  const saved = screen.card("בוקר");
  await expect(saved).toContainText(NOA.first);
  await expect(page.getByText(before(tb.savedAt))).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-build.png"),
    fullPage: true,
  });
  await saved.click();
  await expect(screen.positionButton(NOA.name, WAITER)).toBeVisible();

  // Taking her off and saving leaves the shift empty again.
  await screen.removeButton(NOA.name).click();
  await expect(screen.group(tb.groups.assigned)).toContainText(tb.nobody);
  await screen.closeSheet();
  await expect(saved).toContainText(tb.nobody);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments()).toEqual([]);
});

test("a manager changes, adds and removes next week's shifts", async ({
  page,
}, testInfo) => {
  const te = tb.editor;
  const screen = buildScreen(page);
  const { sheet } = screen;
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  const morning = screen.card("בוקר");
  const evening = screen.card("ערב");
  const middle = screen.card("אמצע");
  await expect(morning).toHaveCount(1);
  await expect(evening).toHaveCount(1);

  // Fewer people and an earlier end on Sunday morning.
  await morning.click();
  await screen.openDetails("בוקר");
  await sheet.getByRole("button", { name: te.fewer }).click();
  await expect(sheet.getByLabel(te.needed)).toHaveValue("2");
  await sheet.getByLabel(te.end).fill("15:00");
  await screen.closeSheet();
  await expect(morning).toContainText(
    tb.people.replace("{assigned}", "0").replace("{needed}", "2"),
  );
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  // Removing a shift can be undone; the second time it stays removed. The
  // card went with the sheet, so its way back has the focus, and once taken
  // the card back in its place has it.
  await evening.click();
  await screen.openDetails("ערב");
  await sheet.getByRole("button", { name: te.delete }).click();
  await expect(sheet).toHaveCount(0);
  await expect(evening).toHaveCount(0);
  const undoRemove = page.getByRole("button", { name: tb.undoRemove });
  await expect(undoRemove).toBeFocused();
  await undoRemove.click();
  await expect(evening).toHaveCount(1);
  await expect(evening).toBeFocused();
  await evening.click();
  await screen.openDetails("ערב");
  await sheet.getByRole("button", { name: te.delete }).click();
  await expect(sheet).toHaveCount(0);
  await expect(evening).toHaveCount(0);

  // A new shift: a name is required first.
  await screen.addOnSunday().click();
  const adding = page.getByRole("dialog", { name: tb.addShift });
  await adding.getByRole("button", { name: te.add }).click();
  await expect(adding.getByRole("alert")).toHaveText(te.problems.name);
  await adding.getByLabel(te.name).fill("אמצע");
  await adding.getByLabel(te.start).fill("14:00");
  await adding.getByLabel(te.end).fill("20:00");
  await adding.getByLabel(te.needed).fill("2");
  await adding.getByRole("button", { name: te.add }).click();
  // Once added, the sheet is that shift's, ready for its people.
  await expect(screen.group(tb.groups.assigned)).toContainText(tb.nobody);
  await screen.closeSheet();
  await expect(middle).toHaveCount(1);
  await expectCleanPage(page);

  // Noa on the morning, which overlaps the new shift: there she shows with
  // the reason, and nothing puts her on it.
  await morning.click();
  await screen.addButton(NOA.name).click();
  await screen.closeSheet();
  await middle.click();
  const busy = screen.group(tb.groups.busy);
  await expect(busy).toContainText(NOA.name);
  await expect(busy).toContainText(before(tb.busyOn.replace("{name}", "בוקר")));
  await expect(screen.addButton(NOA.name)).toHaveCount(0);

  // Once the new shift starts when the morning ends, she can go on it.
  await screen.openDetails("אמצע");
  await sheet.getByLabel(te.start).fill("15:00");
  await screen.addButton(NOA.name).click();

  // Moving the hours back puts her on two shifts at once: the screen says
  // so and does not save.
  await sheet.getByLabel(te.start).fill("14:00");
  await expect(screen.group(tb.groups.assigned)).toContainText(tb.notes.busy);
  await screen.closeSheet();
  await expect(page.getByText(tb.clashBadge)).toBeVisible();
  await page.getByRole("button", { name: tb.submit }).click();
  // (Next's route announcer is an empty alert of its own.)
  await expect(
    page.getByRole("alert").filter({ hasText: tb.errors.clash }),
  ).toBeVisible();
  expect(await scheduleShifts()).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("schedule-shifts-clash.png"),
    fullPage: true,
  });

  // The new shift starts when the morning ends: now it saves.
  await middle.click();
  await screen.openDetails("אמצע");
  await sheet.getByLabel(te.start).fill("15:00");
  await screen.closeSheet();
  await expect(page.getByText(tb.clashBadge)).toHaveCount(0);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(
    page.getByRole("status").filter({ hasText: tb.saved }),
  ).toBeVisible();

  const saved = await scheduleShifts();
  expect(saved.filter((s) => s.weekday === 0)).toEqual([
    {
      weekday: 0,
      name: "בוקר",
      start: "09:00",
      end: "15:00",
      needed: 2,
      pattern: "morning",
    },
    {
      weekday: 0,
      name: "אמצע",
      start: "15:00",
      end: "20:00",
      needed: 2,
      pattern: null,
    },
  ]);
  // The rest of the week is the pattern, untouched: morning and evening
  // Monday to Thursday, Friday morning and Saturday night.
  expect(saved.filter((s) => s.weekday !== 0)).toHaveLength(10);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
    { weekday: 0, pattern: null, phone: NOA.e164, position: null },
  ]);

  // It comes back after a reload.
  await page.reload();
  await expect(middle).toHaveCount(1);
  await expect(evening).toHaveCount(0);
  await expectCleanPage(page);
});

test("a manager publishes next week's schedule, then publishes changes", async ({
  page,
}, testInfo) => {
  test.setTimeout(HELD_TEST_MS);
  const screen = buildScreen(page);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  // The main action is in reach, with nothing to scroll past.
  await expect(page.getByRole("button", { name: tb.publish })).toBeInViewport();
  const shift = screen.card("בוקר");
  await shift.click();
  await screen.addButton(NOA.name).click();
  await screen.closeSheet();
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  // One step: saved and published together.
  await page.getByRole("button", { name: tb.publish }).click();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  expect(await schedulePublished()).toBe(true);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ]);
  // Out, with nothing new: the dock offers sharing it with the team instead,
  // and the focus the publish button had is there.
  await expect(page.getByRole("button", { name: ts.action })).toBeInViewport();
  await expect(page.getByRole("button", { name: ts.action })).toBeFocused();

  // Published: no more draft, and nothing to publish until something changes.
  // Changes are published, not saved aside.
  await page.reload();
  await expect(page.getByText(before(tb.publishedAt))).toBeVisible();
  await expect(page.getByRole("button", { name: tb.submit })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: tb.publishChanges }),
  ).toHaveCount(0);
  const published = screen.card("בוקר");
  await expect(published).toContainText(NOA.first);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-published.png"),
    fullPage: true,
  });

  await published.click();
  await screen.removeButton(NOA.name).click();
  await screen.closeSheet();
  await expect(page.getByText(tb.unpublished)).toBeVisible();
  await expect(page.getByRole("button", { name: tb.submit })).toHaveCount(0);
  // Pressed in the floating dock from the foot of the page.
  const scrolled = () => page.evaluate(() => window.scrollY);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const atFoot = await scrolled();
  await screen.publishChanges();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  // "ביטול" had the focus and went with the toast; with no publish left to
  // press, the line that says the week is published has it, in the builder
  // drawn again from the new reading, and the page stays where it was:
  // never up to that line, above the board. The board drawn again may be a
  // little shorter, so the foot may be a little higher.
  await expect(page.locator("[data-builder-status]")).toBeFocused();
  const foot = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );
  expect(await scrolled()).toBeGreaterThanOrEqual(
    Math.min(atFoot, Math.floor(foot)) - 1,
  );
  expect(await scheduleAssignments()).toEqual([]);
  expect(await schedulePublished()).toBe(true);

  // Shared after "פרסום השינויים", the message says it was updated.
  const start = new URL(page.url()).searchParams.get("week") ?? "";
  expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await page.getByRole("button", { name: ts.action }).click();
  const sheet = page.getByRole("dialog", { name: ts.title });
  await expect(sheet).toContainText(
    heT("app.shifts.share.text", {
      business: BUSINESS,
      range: await rangeIn(page, start),
      kind: "changes",
    }),
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // The schedule's entry says it is out.
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(tb.title) }),
  ).toContainText(tb.entry.subtitlePublished);
});

// Once the week is out, whoever builds it shares it with the team: the
// business, the week in words and the link to that week, never anyone's
// name, number or hours. The app sends nothing itself: WhatsApp, the
// device's share sheet (where it has one) or a copy. The link opens that
// week on the schedule tab, for the manager and for Noa, who works in it.
test("a manager shares the published week, and its link opens that week", async ({
  page,
  browser,
}, testInfo) => {
  // Noa's shift today, put on later, is still today's on the schedule tab,
  // and next week is still next week: never across midnight.
  await waitOutDemoMidnight(testInfo);
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, true);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const share = page.getByRole("button", { name: ts.action });
  const sheet = page.getByRole("dialog", { name: ts.title });
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  // The builder names its week once it is on the screen.
  await expect(page).toHaveURL(/\?week=\d{4}-\d{2}-\d{2}$/);
  const start = new URL(page.url()).searchParams.get("week") ?? "";
  const origin = new URL(page.url()).origin;
  await expect(share).toBeInViewport();
  await expect(page.getByRole("button", { name: tb.publish })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: tb.publishChanges }),
  ).toHaveCount(0);
  await expectCleanPage(page);

  await share.click();
  await expect(sheet).toBeVisible();
  const text = `${heT("app.shifts.share.text", {
    business: BUSINESS,
    range: await rangeIn(page, start),
    kind: "other",
  })}\n${origin}/schedule?week=${start}`;
  const whatsapp = sheet.getByRole("link", { name: us.whatsapp });
  const href = await whatsapp.getAttribute("href");
  expect(href?.startsWith("https://wa.me/?text=")).toBe(true);
  const sent = whatsappText(href) ?? "";
  expect(sent).toBe(text);
  // Nobody's name, number or hours.
  expect(sent).not.toContain(NOA.first);
  expect(sent).not.toContain("+972");
  expect(sent).not.toMatch(/05\d-?\d{3}-?\d{4}/);
  expect(sent).not.toContain("09:00");
  await expect(whatsapp).toHaveAttribute("target", "_blank");
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-share.png"),
    fullPage: true,
  });
  // The device's own share sheet only where the browser has one.
  const native = await page.evaluate(
    () => typeof navigator.share === "function",
  );
  await expect(sheet.getByRole("button", { name: us.other })).toHaveCount(
    native ? 1 : 0,
  );

  await sheet.getByRole("button", { name: us.copy }).click();
  await expect(sheet.getByRole("button", { name: us.copied })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  // Closed from the keyboard, the focus goes back to what opened it.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(share).toBeFocused();

  // A device with a share sheet: it gets the one text, and the sheet closes.
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    Object.assign(window, { shared });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        shared.push(data);
      },
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
  });
  await page.goto("/schedule/build");
  await expect(page).toHaveURL(/\?week=\d{4}-\d{2}-\d{2}$/);
  await share.click();
  await sheet.getByRole("button", { name: us.other }).click();
  await expect(sheet).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { shared: ShareData[] }).shared,
    ),
  ).toEqual([{ text }]);

  // The link opens that week on the schedule tab, with the share beside
  // "פורסם ב-…" for whoever builds it. This week is out too, with Noa on
  // today's morning, so without the link the tab opens on this week
  // (`scheduleOpening`): only the link's `?week=` leads to next week.
  await scheduleDemoToday([[NOA.e164, null]]);
  const link = `/schedule?week=${start}`;
  const weekButton = (on: Page, key: "this" | "next") =>
    on.getByRole("button", { name: he.app.shifts.week[key], exact: true });
  await page.goto("/schedule");
  await expect(weekButton(page, "this")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto(link);
  await expect(weekButton(page, "next")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page
      .getByText(before(he.app.shifts.board.publishedAt))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(share).toBeVisible();
  await expectCleanPage(page);

  // Noa opens it on that week too (on her shift there: `scheduleOpening`),
  // though on her own the tab opens on today's, with nothing to share.
  const noa = await secondPage(browser, testInfo);
  await signIn(noa, NOA);
  await noa.goto("/schedule");
  await expect(weekButton(noa, "this")).toHaveAttribute("aria-pressed", "true");
  await noa.goto(link);
  await expect(weekButton(noa, "next")).toHaveAttribute("aria-pressed", "true");
  await expect(
    noa
      .getByText(before(he.app.shifts.board.publishedAt))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(noa.getByRole("button", { name: ts.action })).toHaveCount(0);
  await noa.context().close();
});

// Publishing changes waits `HOLD_MS` for "ביטול" before anything reaches the
// server (Orel's answer 3 of 15 November 2026, the running-week plan's R3b).
// Pressed in time, nothing is written and nobody is told: not even the log
// has a publish. A tab tapped while it waits sends it at once and goes once
// it worked, asking nothing; "פרסום השינויים ויציאה" never waits at all.
test("undoing a publish of changes sends nothing", async ({ page }) => {
  test.setTimeout(HELD_TEST_MS);
  const screen = buildScreen(page);
  const publish = page.getByRole("button", { name: tb.publishChanges });
  const morning = screen.card("בוקר");
  const home = page.getByRole("link", {
    name: new RegExp(`^${literal(he.app.nav.home)}(\\s*,|$)`),
  });
  const leave = page.getByRole("dialog", { name: tb.leave.title });
  // On a phone the tab bar shrinks to the current tab once the page has
  // scrolled; back at the top it shows every tab again.
  const toTop = () => page.evaluate(() => window.scrollTo({ top: 0 }));
  // Published: Noa on Sunday morning.
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, true);
  const asPublished = [
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ];
  // The log keeps earlier runs' rows: count the publishes from here on.
  const allPublishes = () =>
    demoActivityActions("schedule.publish", new Date(0));
  const loggedBefore = await allPublishes();
  const publishesLogged = async () => (await allPublishes()) - loggedBefore;
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(morning).toContainText(NOA.first);

  // Noa off the morning, and publish: it waits, says so with "ביטול", and the
  // team still sees the week as it was published.
  await morning.click();
  await screen.removeButton(NOA.name).click();
  await screen.closeSheet();
  await publish.click();
  await expect(screen.held).toBeVisible();
  await expect(publish).toBeDisabled();
  await expect(page.getByText(tb.unpublished)).toBeVisible();
  // "ביטול" at once, well inside the hold, however slow the runner. The work
  // is back, still to publish.
  await screen.undoHeld().click();
  await expect(page.getByRole("status")).toHaveText(tb.hold.undone);
  await expect(publish).toBeEnabled();
  await expect(morning).toContainText(tb.nobody);
  await expect(page.getByText(tb.unpublished)).toBeVisible();
  await expectCleanPage(page);
  // Past the hold: nothing was sent, so nothing was written or logged.
  await page.waitForTimeout(HOLD_MS + 1_000);
  expect(await scheduleAssignments()).toEqual(asPublished);
  expect(await publishesLogged()).toBe(0);

  // Held again, and a tab tapped while it waits: it goes now, and so does
  // the screen once it worked, with nothing asked.
  await publish.click();
  await expect(screen.held).toBeVisible();
  await toTop();
  await expect(home).toBeVisible();
  await home.click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(leave).toHaveCount(0);
  expect(await scheduleAssignments()).toEqual([]);
  expect(await publishesLogged()).toBe(1);

  // "פרסום השינויים ויציאה" goes at once, the screen being left: well before
  // any hold would be over.
  await page.goto("/schedule/build");
  await morning.click();
  await screen.addButton(NOA.name).click();
  await screen.closeSheet();
  await toTop();
  await expect(home).toBeVisible();
  await home.click();
  await leave.getByRole("button", { name: tb.leave.publish }).click();
  await expect(page).toHaveURL(/\/home$/, { timeout: HOLD_MS - 1_000 });
  expect(await scheduleAssignments()).toEqual(asPublished);
  expect(await publishesLogged()).toBe(2);
});

// The week is written in place (20261115000100_week_in_place.sql): a shift
// changed on the screen keeps its id, one nobody touched keeps the swap
// request on it, and a shift added keeps the id its first publish gave it.
test("republishing next week keeps a request on a shift nobody touched", async ({
  page,
}) => {
  test.setTimeout(HELD_TEST_MS);
  const screen = buildScreen(page);
  const te = tb.editor;
  // Published: Noa on Sunday morning, Yoav on Sunday evening, and Yoav asks
  // to give his evening away.
  await scheduleDemoSunday(
    { morning: [[NOA.e164, null]], evening: [[YOAV.e164, null]] },
    true,
  );
  await requestDemoSwap("evening", YOAV.e164);
  const waiting = [{ status: "open", from: YOAV.e164, to: null }];
  expect(await demoSwaps()).toEqual(waiting);
  const read = await scheduleShiftIds();

  await signIn(page, MANAGER);
  await page.goto("/schedule/build");

  // The morning changes, the evening doesn't: Noa comes off the morning, and
  // a short shift goes in between, with nobody on it yet.
  await screen.card("בוקר").click();
  await screen.removeButton(NOA.name).click();
  await screen.closeSheet();
  await screen.addOnSunday().click();
  const adding = page.getByRole("dialog", { name: tb.addShift });
  await adding.getByLabel(te.name).fill("אמצע");
  await adding.getByLabel(te.start).fill("12:00");
  await adding.getByLabel(te.end).fill("14:00");
  await adding.getByLabel(te.needed).fill("1");
  await adding.getByRole("button", { name: te.add }).click();
  await expect(screen.group(tb.groups.assigned)).toContainText(tb.nobody);
  await screen.closeSheet();
  await screen.publishChanges();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "evening", phone: YOAV.e164, position: null },
  ]);
  expect(await demoSwaps()).toEqual(waiting);
  // The morning was written in place: it keeps its id, as the evening does.
  const published = await scheduleShiftIds();
  expect(published.filter((s) => s.name !== "אמצע")).toEqual(read);
  expect(published.filter((s) => s.name === "אמצע")).toHaveLength(1);

  // The screen starts again from what was published, the new shift with its
  // id, so a second change goes out as well and the request still waits. (A
  // screen still on what it read before would send the new shift again as a
  // new one, and the morning as it first read it, which the database would
  // leave as it is now.)
  await expect(
    page.getByRole("button", { name: tb.publishChanges }),
  ).toHaveCount(0);
  await screen.card("בוקר").click();
  await screen.addButton(NOA.name).click();
  await screen.closeSheet();
  await screen.publishChanges();
  await expect.poll(scheduleAssignments).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
    { weekday: 0, pattern: "evening", phone: YOAV.e164, position: null },
  ]);
  await expect(
    page.getByRole("button", { name: tb.publishChanges }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: tb.errors.weekMoved }),
  ).toHaveCount(0);
  // The shift added is there once, with the id its first publish gave it.
  expect(await scheduleShiftIds()).toEqual(published);
  expect(await demoSwaps()).toEqual(waiting);
});

// A screen drawn before anyone saved the week sends nothing it read, which
// replaces the week: once someone has saved it, that is refused instead.
test("a builder drawn before the week was first saved replaces nothing", async ({
  page,
}) => {
  const screen = buildScreen(page);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  // Drawn from the shift pattern: nothing is saved yet.
  await expect(screen.card("בוקר")).toHaveCount(1);

  // Another manager publishes the week meanwhile: Noa on Sunday morning.
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, true);

  await page.getByRole("button", { name: tb.publish }).click();
  // (Next's route announcer is an empty alert of its own.)
  await expect(
    page.getByRole("alert").filter({ hasText: tb.errors.weekSaved }),
  ).toBeVisible();
  expect(await scheduleShifts()).toHaveLength(2);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ]);
});

// "העתקה מהשבוע שעבר": this week, as the copies into next week read it.
// Sunday's morning has Noa (a waiter) and Yoav, its evening Noa, and
// Monday's morning Yoav. Noa sent 09:00–17:00 for next Sunday, so she can't
// do its evening; Yoav sent nothing, and is copied.
const LAST_WEEK: DemoWeekShift[] = [
  {
    offset: 0,
    name: "בוקר",
    start: "09:00",
    end: "16:00",
    needed: 3,
    pattern: "morning",
    people: [
      [NOA.e164, "waiter"],
      [YOAV.e164, null],
    ],
  },
  {
    offset: 0,
    name: "ערב",
    start: "16:00",
    end: "23:30",
    needed: 4,
    pattern: "evening",
    people: [[NOA.e164, null]],
  },
  {
    offset: 1,
    name: "בוקר",
    start: "09:00",
    end: "16:00",
    needed: 3,
    pattern: "morning",
    people: [[YOAV.e164, null]],
  },
];

/**
 * This week and next are read from the real clock, by the server and by the
 * database helpers alike: the copy's specs skip within two hours of the
 * restaurant's week turning, either side.
 */
async function skipNearTheWeekTurn() {
  const clock = await demoRunningWeekClock();
  test.skip(
    clock.sinceStart < 120 || clock.untilEnd < 120,
    "too close to the restaurant's week turning",
  );
  return clock;
}

/** The copy's sheet and its parts. */
function copyScreen(page: Page) {
  const tc = tb.copy;
  const sheet = page.getByRole("dialog", { name: tc.title });
  const days = sheet.getByRole("group", { name: tc.daysTitle, exact: true });
  return {
    action: page.getByRole("button", { name: tc.action }),
    sheet,
    /** Its row for a day (YYYY-MM-DD), as the sheet names it. */
    day: (date: string) =>
      days
        .locator("div", {
          has: page.getByText(
            heT("app.build.day", {
              day: weekdayOf(date),
              date: dayMonthOf(date),
            }),
            { exact: true },
          ),
        })
        .last(),
    submit: (count: number) =>
      sheet.getByRole("button", {
        name: heT("app.build.copy.submit", { count }),
      }),
  };
}

/** The day `days` after `date` (YYYY-MM-DD). */
const daysAfter = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

// The copy only fills the screen: the sheet says what it will do and who it
// leaves out, "ביטול" takes it back, and saving it writes a draft, with
// nothing published and nobody told.
test("a manager copies last week into next week, sees who was left out, and takes it back", async ({
  page,
}, testInfo) => {
  await skipNearTheWeekTurn();
  await buildDemoThisWeek(LAST_WEEK, true);
  const since = await databaseNow();
  const screen = buildScreen(page);
  const copy = copyScreen(page);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();
  const morning = screen.card("בוקר");
  const evening = screen.card("ערב");
  await expect(morning).toContainText(tb.nobody);

  await copy.action.click();
  await expect(copy.sheet).toContainText(
    heT("app.build.copy.summary", { shifts: 3, people: 2 }),
  );
  const unavailable = screen.group(tb.groups.unavailable);
  await expect(unavailable).toContainText(NOA.name);
  await expect(unavailable).toContainText(
    heT("app.build.copy.skippedOn", {
      shift: "ערב",
      day: he.app.availability.weekdays.sun,
    }),
  );
  await expect(copy.sheet).toContainText(tb.copy.note);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-build-copy.png"),
    fullPage: true,
  });

  await copy.submit(3).click();
  await expect(copy.sheet).toHaveCount(0);
  await expect(morning).toContainText(NOA.first);
  await expect(morning).toContainText(YOAV.first);
  await expect(evening).toContainText(tb.nobody);
  await expect(page.getByText(tb.unsaved)).toBeVisible();
  await page
    .getByRole("status")
    .filter({ hasText: heT("app.build.copy.done", { count: 3 }) })
    .getByRole("button", { name: he.app.manage.undo, exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: tb.copy.undone }),
  ).toBeVisible();
  await expect(morning).toContainText(tb.nobody);
  expect(await scheduleAssignments("next")).toEqual([]);

  // Copied again and saved: a draft, published to nobody.
  await copy.action.click();
  await copy.submit(3).click();
  await expect(copy.sheet).toHaveCount(0);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments("next")).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: "waiter" },
    { weekday: 0, pattern: "morning", phone: YOAV.e164, position: null },
    { weekday: 1, pattern: "morning", phone: YOAV.e164, position: null },
  ]);
  expect(await demoWeekPublished("next")).toBe(false);
  expect(await demoActivityActions("schedule.publish", since)).toBe(0);
});

test("a day with people on it stays unless the manager replaces it", async ({
  page,
}) => {
  const { startsOn } = await skipNearTheWeekTurn();
  await buildDemoThisWeek(LAST_WEEK, true);
  // Next week saved with Yoav on Sunday morning, and nothing on Monday.
  await scheduleDemoSunday(
    { morning: [[YOAV.e164, null]], evening: [] },
    false,
  );
  const nextSunday = daysAfter(startsOn, 7);
  const screen = buildScreen(page);
  const copy = copyScreen(page);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  const morning = screen.card("בוקר");
  await expect(morning).toContainText(YOAV.first);

  await copy.action.click();
  await expect(copy.day(nextSunday)).toContainText(tb.copy.days.kept);
  // Only Monday's morning, with Yoav.
  await expect(copy.sheet).toContainText(
    heT("app.build.copy.summary", { shifts: 1, people: 1 }),
  );
  await copy.sheet.getByRole("switch", { name: tb.copy.replace.label }).click();
  await expect(copy.day(nextSunday)).toContainText(
    heT("app.build.copy.days.replaced", { count: 2, was: 2 }),
  );
  await expect(copy.sheet).toContainText(
    heT("app.build.copy.summary", { shifts: 3, people: 2 }),
  );
  await copy.submit(3).click();
  await expect(copy.sheet).toHaveCount(0);
  await expect(morning).toContainText(NOA.first);
  await expect(morning).toContainText(YOAV.first);
});

test("copying is offered only for a draft with a last week", async ({
  page,
}) => {
  const { startsOn } = await skipNearTheWeekTurn();
  const screen = buildScreen(page);
  const copy = copyScreen(page);
  await signIn(page, MANAGER);
  // Nobody built this week: nothing to copy.
  await page.goto("/schedule/build");
  await expect(screen.card("בוקר")).toHaveCount(1);
  await expect(copy.action).toHaveCount(0);

  // Both weeks published: a published week changes only by publishing it.
  await buildDemoThisWeek(LAST_WEEK, true);
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, true);
  await page.reload();
  await expect(screen.card("בוקר")).toContainText(NOA.first);
  await expect(copy.action).toHaveCount(0);
  await page.goto(`/schedule/build?week=${startsOn}`);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();
  await expect(copy.action).toHaveCount(0);
});

// Two managers: one copies last week into next week's draft while the other
// saves it. The copy is refused rather than written beside or over theirs.
test("a copy into a week saved meanwhile on another screen is not saved", async ({
  page,
}) => {
  await skipNearTheWeekTurn();
  await buildDemoThisWeek(LAST_WEEK, true);
  await scheduleDemoSunday(
    { morning: [[YOAV.e164, null]], evening: [] },
    false,
  );
  const screen = buildScreen(page);
  const copy = copyScreen(page);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(screen.card("בוקר")).toContainText(YOAV.first);
  await copy.action.click();
  await copy.submit(1).click();
  await expect(copy.sheet).toHaveCount(0);

  // The other manager saves next week meanwhile: Noa on Sunday morning.
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, false);

  await page.getByRole("button", { name: tb.submit }).click();
  // (Next's route announcer is an empty alert of its own.)
  await expect(
    page.getByRole("alert").filter({ hasText: tb.errors.copySaved }),
  ).toBeVisible();
  expect(await scheduleAssignments("next")).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ]);
});

/** The fill's sheet and its parts. */
function fillScreen(page: Page) {
  const tf = tb.fill;
  const sheet = page.getByRole("dialog", { name: tf.title });
  return {
    action: page.getByRole("button", { name: tf.action }),
    sheet,
    /**
     * A shift's row on a day (YYYY-MM-DD), by its name and hours as the
     * sheet writes them ("בוקר · 09:00–16:00").
     */
    row: (date: string, name: string, hours: string) =>
      sheet
        .getByRole("group", {
          name: heT("app.build.day", {
            day: weekdayOf(date),
            date: dayMonthOf(date),
          }),
          exact: true,
        })
        .locator("div", {
          has: page.getByText(`${name} · ${hours}`, { exact: true }),
        })
        .last(),
    /** Who sent no availability, and so is never placed. */
    missing: sheet.getByText(before(tf.noAnswer)),
    submit: (count: number) =>
      sheet.getByRole("button", {
        name: heT("app.build.fill.submit", { count }),
      }),
    /** The toast after a fill, while its "ביטול" is offered. */
    toast: (count: number) =>
      page
        .getByRole("status")
        .filter({ hasText: heT("app.build.fill.done", { count }) }),
  };
}

/** The words of a message's `<link>`: "זמינות הצוות". */
const linkWords = (message: string) =>
  /<link>(.*)<\/link>/.exec(message)?.[1] ?? message;

// The fill only fills the screen: the sheet says what it will do before
// anything changes, places only who sent availability for the whole shift
// (Noa's 09:00–17:00 covers Sunday's morning, and only part of its evening),
// names who sent nothing (the manager and Yoav, never the owner), "ביטול"
// takes it back, and saving it writes a draft, with nothing published.
test("filling from availability places only who sent it, on the screen until saved", async ({
  page,
}, testInfo) => {
  const { startsOn } = await skipNearTheWeekTurn();
  const nextSunday = daysAfter(startsOn, 7);
  const since = await databaseNow();
  const tf = tb.fill;
  const screen = buildScreen(page);
  const fill = fillScreen(page);
  // The manager owes availability too, and sent none for next week.
  await clearAvailability(MANAGER.e164);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();
  const morning = screen.card("בוקר");
  await expect(morning).toContainText(tb.nobody);

  await fill.action.click();
  await expect(fill.sheet).toContainText(
    heT("app.build.fill.summary", { places: 1, people: 1 }),
  );
  await expect(fill.row(nextSunday, "בוקר", "09:00–16:00")).toContainText(
    heT("app.build.fill.adds", { names: NOA.name }),
  );
  const evening = fill.row(nextSunday, "ערב", "16:00–23:30");
  await expect(evening).toContainText(tf.why.nobody);
  await expect(evening).toContainText(
    heT("app.build.fill.why.partial", { count: 1 }),
  );
  await expect(fill.missing).toContainText(YOAV.name);
  await expect(fill.missing).toContainText("שירן הדגמה");
  await expect(fill.missing).not.toContainText("אורי הדגמה");
  // Next week's reminder is on the team's availability.
  await expect(
    fill.sheet.getByRole("link", { name: linkWords(tf.remind) }),
  ).toHaveAttribute("href", "/schedule/availability/team");
  await expect(fill.sheet).toContainText(tf.note);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-build-fill.png"),
    fullPage: true,
  });

  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await expect(morning).toContainText(NOA.first);
  await expect(page.getByText(tb.unsaved)).toBeVisible();
  const undo = fill
    .toast(1)
    .getByRole("button", { name: tf.undoFull, exact: true });
  // The sheet closed onto the way back.
  await expect(undo).toBeFocused();
  expect(await scheduleAssignments("next")).toEqual([]);
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: tf.undone }),
  ).toBeVisible();
  await expect(morning).toContainText(tb.nobody);
  await expect(fill.action).toBeFocused();

  // Filled again and saved: a draft, published to nobody, Noa on Sunday
  // morning with no position (nobody built last week).
  await fill.action.click();
  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments("next")).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ]);
  expect(await demoWeekPublished("next")).toBe(false);
  expect(await demoActivityActions("schedule.publish", since)).toBe(0);
});

// A published week changes only by publishing it again: no fill. A draft
// whose open places the fill fills whole has nothing left to fill, so the
// pill goes, and as the toast goes the focus goes to "פרסום הסידור".
test("filling is offered only on a draft with an open place", async ({
  page,
}) => {
  // It waits out the toast's way back.
  test.setTimeout(HELD_TEST_MS);
  await skipNearTheWeekTurn();
  const screen = buildScreen(page);
  const fill = fillScreen(page);
  const morning = screen.card("בוקר");
  await scheduleDemoSunday({ morning: [[NOA.e164, null]], evening: [] }, true);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(morning).toContainText(NOA.first);
  await expect(
    page.getByText(plural(tb.openPlaces)).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(fill.action).toHaveCount(0);

  // Next week as a draft of one shift: Sunday's morning for two, with Yoav.
  await clearSchedule();
  await buildDemoNextWeek(
    [
      {
        offset: 0,
        name: "בוקר",
        start: "09:00",
        end: "16:00",
        needed: 2,
        pattern: "morning",
        people: [[YOAV.e164, null]],
      },
    ],
    false,
  );
  await page.reload();
  await expect(morning).toContainText(YOAV.first);
  await fill.action.click();
  await expect(fill.sheet).toContainText(
    heT("app.build.fill.summary", { places: 1, people: 1 }),
  );
  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await expect(morning).toContainText(NOA.first);
  await expect(page.getByText(tb.full)).toBeVisible();
  await expect(fill.action).toHaveCount(0);
  // Pressed with a mouse, "ביטול" waits for nobody: once its 10 seconds are
  // up, nothing is left to fill, and the publish button has the focus.
  await expect(fill.toast(1)).toHaveCount(0, {
    timeout: SCREEN_UNDO_MS + 5_000,
  });
  await expect(page.getByRole("button", { name: tb.publish })).toBeFocused();
});

// Two managers: one fills next week's draft drawn from the pattern while the
// other saves it. The fill is refused rather than written over theirs.
test("a fill into a week saved meanwhile on another screen is refused", async ({
  page,
}) => {
  await skipNearTheWeekTurn();
  const screen = buildScreen(page);
  const fill = fillScreen(page);
  const morning = screen.card("בוקר");
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(morning).toContainText(tb.nobody);
  await fill.action.click();
  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await expect(morning).toContainText(NOA.first);

  // The other manager saves next week meanwhile: Yoav on Sunday morning.
  await scheduleDemoSunday(
    { morning: [[YOAV.e164, null]], evening: [] },
    false,
  );

  await page.getByRole("button", { name: tb.submit }).click();
  // (Next's route announcer is an empty alert of its own.)
  await expect(
    page.getByRole("alert").filter({ hasText: tb.errors.weekSaved }),
  ).toBeVisible();
  expect(await scheduleAssignments("next")).toEqual([
    { weekday: 0, pattern: "morning", phone: YOAV.e164, position: null },
  ]);
});

// What the database checks of a fill, and what it doesn't (known issue 108).
// Both screens read next week's saved draft. Yoav put on Sunday morning
// from another screen meanwhile: the fill that changes that morning is
// refused (`weekMoved`), and the morning comes back as it is now. Noa put on
// Sunday evening from another screen meanwhile: this screen doesn't see it,
// fills her into the morning, and the save goes through, since the database
// checks only that nobody is on two shifts at once, never one shift a day.
test("a fill saved over another screen's change: refused on the same shift, taken on another", async ({
  page,
}) => {
  const { startsOn } = await skipNearTheWeekTurn();
  const nextSunday = daysAfter(startsOn, 7);
  const screen = buildScreen(page);
  const fill = fillScreen(page);
  const morning = screen.card("בוקר");
  const sunday = (name: string, needed: number, pattern: string) => ({
    offset: 0,
    name,
    start: pattern === "morning" ? "09:00" : "16:00",
    end: pattern === "morning" ? "16:00" : "23:30",
    needed,
    pattern,
    people: [],
  });
  await buildDemoNextWeek(
    [sunday("בוקר", 3, "morning"), sunday("ערב", 4, "evening")],
    false,
  );
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(morning).toContainText(tb.nobody);

  await putOnDemoNextSunday("morning", YOAV.e164);
  await fill.action.click();
  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: heT("app.build.moved.changedOne", {
        name: "בוקר",
        day: he.app.availability.weekdays.sun,
      }),
    }),
  ).toBeVisible();
  await expect(morning).toContainText(tb.meanwhile);
  await expect(morning).toContainText(YOAV.first);
  await expect(morning).not.toContainText(NOA.first);
  expect(await scheduleAssignments("next")).toEqual([
    { weekday: 0, pattern: "morning", phone: YOAV.e164, position: null },
  ]);

  // Noa on Sunday evening from the other screen, which this one doesn't
  // see: the fill puts her on the morning, and the database takes it.
  await putOnDemoNextSunday("evening", NOA.e164);
  await fill.action.click();
  await expect(fill.row(nextSunday, "בוקר", "09:00–16:00")).toContainText(
    heT("app.build.fill.adds", { names: NOA.name }),
  );
  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments("next")).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
    { weekday: 0, pattern: "morning", phone: YOAV.e164, position: null },
    { weekday: 0, pattern: "evening", phone: NOA.e164, position: null },
  ]);
});

// Why each place stays open, in the sheet's words, on next week's draft:
// Sunday's morning is open and Noa's 09:00–17:00 covers it, but she is on
// Sunday's evening already, so she is named with that rule; Friday's
// evening ends after candle lighting and no answer covers it, so it says
// Shabbat's time and what to do. Nobody is placed, so the footer says each
// shift says why, and the rules are stated with their numbers: 6 days, 42
// hours, 8 hours' rest.
test("the fill's sheet says which rule stopped whom, and Shabbat's time", async ({
  page,
}) => {
  const { startsOn } = await skipNearTheWeekTurn();
  const nextSunday = daysAfter(startsOn, 7);
  const nextFriday = daysAfter(startsOn, 12);
  const tf = tb.fill;
  const fill = fillScreen(page);
  const shift = (
    offset: number,
    name: string,
    pattern: string | null,
    people: DemoWeekShift["people"],
  ): DemoWeekShift => ({
    offset,
    name,
    start: name === "בוקר" ? "09:00" : "16:00",
    end: name === "בוקר" ? "16:00" : "23:30",
    needed: 1,
    pattern,
    people,
  });
  // Friday's reason, at whatever hour candle lighting is that week.
  const fridayWhy = new RegExp(
    literal(
      heT.markup("app.build.fill.why.friday", {
        time: "TIME",
        ltr: (chunks) => chunks,
      }),
    ).replace("TIME", "\\d{1,2}:\\d{2}"),
  );
  await clearAvailability(MANAGER.e164);
  await buildDemoNextWeek(
    [
      shift(0, "בוקר", "morning", []),
      shift(0, "ערב", "evening", [[NOA.e164, null]]),
      shift(5, "ערב", null, []),
    ],
    false,
  );
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();

  await fill.action.click();
  await expect(fill.sheet).toContainText(tf.nothing.none);
  await expect(fill.row(nextSunday, "בוקר", "09:00–16:00")).toContainText(
    heT("app.build.fill.why.blocked", {
      people: heT("app.build.fill.why.blockedOne", {
        name: NOA.name,
        rule: tf.rule.sameDay,
      }),
    }),
  );
  await expect(fill.row(nextFriday, "ערב", "16:00–23:30")).toContainText(
    fridayWhy,
  );
  await expect(fill.sheet).toContainText(
    heT.markup("app.build.fill.rules", {
      days: 6,
      hours: 42,
      rest: 8,
      ltr: (chunks) => chunks,
    }),
  );
  await page.keyboard.press("Escape");
  await expect(fill.sheet).toHaveCount(0);
});

// The week's hours the fill gives anyone are the business's (filling from
// availability, part 5): set to 4 (`fillWeekHours`), the morning Noa sent
// for is 7 hours, past them, so the fill places nobody, names her with the
// 4 hours the rules say too, and "לפי אנשים" says she has no shift.
// /manage/scheduling draws the field with what is stored, a change there is
// saved and logged as a settings change, as every setting's is, and the
// setting is put back however the test ends.
test("the fill stops at the business's week's hours, which /manage/scheduling sets", async ({
  page,
}) => {
  const { startsOn } = await skipNearTheWeekTurn();
  const nextSunday = daysAfter(startsOn, 7);
  const tf = tb.fill;
  const words = he.modules.scheduling.settings.fillWeekHours;
  const fill = fillScreen(page);
  const stored = await demoModuleSettings("scheduling");
  await clearAvailability(MANAGER.e164);
  await setDemoModuleSettings("scheduling", { ...stored, fillWeekHours: 4 });
  try {
    await signIn(page, MANAGER);
    await page.goto("/schedule/build");
    await expect(
      page.getByRole("heading", { level: 1, name: tb.title }),
    ).toBeVisible();

    await fill.action.click();
    await expect(fill.sheet).toContainText(
      heT.markup("app.build.fill.rules", {
        days: 6,
        hours: 4,
        rest: 8,
        ltr: (chunks) => chunks,
      }),
    );
    await expect(fill.sheet).toContainText(tf.nothing.none);
    await expect(fill.row(nextSunday, "בוקר", "09:00–16:00")).toContainText(
      heT("app.build.fill.why.blocked", {
        people: heT("app.build.fill.why.blockedOne", {
          name: NOA.name,
          // The hours held left to right inside the sentence, as the sheet
          // holds them.
          rule: heT.markup("app.build.fill.rule.hours", {
            hours: 4,
            ltr: (chunks) => `⁦${chunks}⁩`,
          }),
        }),
      }),
    );
    // Her row says her name and "בלי משמרות השבוע", and nothing more: no
    // "· # מהמילוי" after it.
    const people = fill.sheet.getByRole("region", { name: tf.peopleTitle });
    await expect(
      people
        .locator("div", { has: page.getByText(NOA.name, { exact: true }) })
        .last(),
    ).toHaveText(
      `${NOA.name}${heT.markup("app.build.fill.person", {
        shifts: 0,
        hours: 0,
        added: 0,
        ltr: (chunks) => chunks,
      })}`,
    );
    await expectCleanPage(page);
    await page.keyboard.press("Escape");
    await expect(fill.sheet).toHaveCount(0);

    // The management page draws the field with what is stored, and a change
    // there is saved and logged.
    const since = await databaseNow();
    await page.goto("/manage/scheduling");
    const hours = page.getByRole("spinbutton", { name: words.label });
    await expect(hours).toHaveValue("4");
    await expect(page.getByText(words.hint)).toBeVisible();
    await page
      .getByRole("button", {
        name: heT("app.manage.increase", { name: words.label }),
      })
      .click();
    await expect(hours).toHaveValue("5");
    await expect(
      page.getByText(he.app.manage.saved, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await demoModuleSettings("scheduling")).fillWeekHours)
      .toBe(5);
    expect(await demoActivityActions("module.settings", since)).toBeGreaterThan(
      0,
    );
    await page.goto("/manage/activity");
    await expect(
      page
        .getByText(
          heT("app.manage.activity.actions.module.settings", {
            module: he.modules.scheduling.name,
          }),
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    // "שעות בשבוע לכל אחד, במילוי מהזמינות: 5", with "במקום 4" beside it
    // on a phone and a tablet, and in the column before it on a desktop.
    await expect(
      page.getByText(`${words.label}: 5`).filter({ visible: true }).first(),
    ).toBeVisible();
  } finally {
    await setDemoModuleSettings("scheduling", stored);
  }
});

// Saved on the way out from the fill's reminder link, and refused (another
// manager saved the week meanwhile): the question was asked from the fill's
// sheet, gone with it, so the focus goes back to the fill's pill, or to the
// line that says where the week stands while the save was still on its way,
// and the refusal is read with the focus on the screen, never on the page's
// body.
test("a save on the way out from the fill's link, refused, leaves the focus on the builder", async ({
  page,
}) => {
  await skipNearTheWeekTurn();
  const tf = tb.fill;
  const screen = buildScreen(page);
  const fill = fillScreen(page);
  const morning = screen.card("בוקר");
  const leave = page.getByRole("dialog", { name: tb.leave.title });
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(morning).toContainText(tb.nobody);
  await fill.action.click();
  await fill.submit(1).click();
  await expect(fill.sheet).toHaveCount(0);
  await expect(morning).toContainText(NOA.first);

  // The other manager saves next week meanwhile: Yoav on Sunday morning.
  await scheduleDemoSunday(
    { morning: [[YOAV.e164, null]], evening: [] },
    false,
  );

  await fill.action.click();
  await fill.sheet.getByRole("link", { name: linkWords(tf.remind) }).click();
  await expect(leave).toBeVisible();
  await expect(fill.sheet).toHaveCount(0);
  await leave.getByRole("button", { name: tb.leave.save }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: tb.errors.weekSaved }),
  ).toBeVisible();
  await expect(page).toHaveURL(nextWeekUrl());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.matches(
            "[data-fill-week], [data-builder-status]",
          ) ?? false,
      ),
    )
    .toBe(true);
});

test("a swap approved while the builder was open survives", async ({
  page,
}) => {
  test.setTimeout(HELD_TEST_MS);
  const screen = buildScreen(page);
  // Yoav gives his Sunday evening away and Noa takes it: it waits for a
  // manager.
  await scheduleDemoSunday(
    { morning: [[NOA.e164, null]], evening: [[YOAV.e164, null]] },
    true,
  );
  await takenDemoSwap("evening", YOAV.e164, NOA.e164);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  const evening = screen.card("ערב");
  await expect(evening).toContainText(YOAV.first);

  // Another manager approves it while this screen still shows Yoav there.
  await decideDemoSwap(true);

  // This manager changes only the morning, and publishes.
  await screen.card("בוקר").click();
  await screen.removeButton(NOA.name).click();
  await screen.closeSheet();
  await screen.publishChanges();
  await expect(page.getByRole("status")).toHaveText(tb.published);

  // The approval stands, and the screen now shows it.
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "evening", phone: NOA.e164, position: null },
  ]);
  expect(await demoSwaps()).toEqual([
    { status: "approved", from: YOAV.e164, to: NOA.e164 },
  ]);
  await expect(evening).toContainText(NOA.first);
  await expect(evening).not.toContainText(YOAV.first);
});

// A stale screen (R1b), with two managers: the owner approves a swap on a
// shift this manager changed too, while the builder is open. Before
// publishing, the line above "פרסום השינויים" says that taking Yoav off his
// evening would end his request, and so does the sheet that asks before
// leaving, beside its own publish. The publish is refused: the evening comes
// back as it is now, marked and named, the morning keeps its change, and
// publishing again sends it.
test("a shift changed meanwhile comes back marked, and the rest is kept", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(HELD_TEST_MS);
  const screen = buildScreen(page);
  const publish = page.getByRole("button", { name: tb.publishChanges });
  const warning = page.getByText(heT("app.build.swapsEnd", { count: 1 }));
  const morning = screen.card("בוקר");
  const evening = screen.card("ערב");
  const home = page.getByRole("link", {
    name: new RegExp(`^${literal(he.app.nav.home)}(\\s*,|$)`),
  });
  const leave = page.getByRole("dialog", { name: tb.leave.title });
  // Published: Noa on Sunday morning, Yoav on Sunday evening. Yoav gives his
  // evening away and Noa takes it: it waits for a manager.
  await scheduleDemoSunday(
    { morning: [[NOA.e164, null]], evening: [[YOAV.e164, null]] },
    true,
  );
  await takenDemoSwap("evening", YOAV.e164, NOA.e164);
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(evening).toContainText(YOAV.first);

  // Noa off the morning: the request waits on, so nothing is said.
  await morning.click();
  await screen.removeButton(NOA.name).click();
  await screen.closeSheet();
  await expect(publish).toBeVisible();
  await expect(warning).toHaveCount(0);
  // Yoav off his evening would end the request he made: it says so first.
  await evening.click();
  await screen.removeButton(YOAV.name).click();
  await screen.closeSheet();
  await expect(warning).toBeVisible();
  // Leaving asks first, and says it there too, beside publishing on the way.
  // On a phone the tab bar shrinks to the current tab once the page has
  // scrolled (the week switch makes the builder taller); back at the top it
  // shows every tab again.
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await expect(home).toBeVisible();
  await home.click();
  await expect(leave).toContainText(heT("app.build.swapsEnd", { count: 1 }));
  await expect(
    leave.getByRole("button", { name: tb.leave.publish }),
  ).toHaveAccessibleDescription(
    // With the line to check directly too, should next week start soon.
    new RegExp(literal(heT("app.build.swapsEnd", { count: 1 }))),
  );
  await leave.getByRole("button", { name: tb.leave.stay }).click();
  await expect(leave).toHaveCount(0);
  await expect(page).toHaveURL(nextWeekUrl());

  // The owner approves the request meanwhile, on a phone of their own.
  const owner = await secondPage(browser, testInfo);
  await signIn(owner, OWNER);
  await owner.goto("/schedule/swaps");
  await owner
    .getByRole("button", {
      name: new RegExp(`^${he.app.swaps.buttons.approve}, `),
    })
    .filter({ visible: true })
    .click();
  await expect(
    owner.getByText(he.app.swaps.empty).filter({ visible: true }),
  ).toBeVisible();
  await owner.context().close();
  expect(await demoSwaps()).toEqual([
    { status: "approved", from: YOAV.e164, to: NOA.e164 },
  ]);

  // The publish waits for its undo first, and only then reaches the server.
  await screen.publishChanges();
  // (Next's route announcer is an empty alert of its own.)
  await expect(
    page.getByRole("alert").filter({
      hasText: heT("app.build.moved.changedOne", {
        name: "ערב",
        day: he.app.availability.weekdays.sun,
      }),
    }),
  ).toBeVisible();
  // The evening as it is now, with Noa, and marked; the morning keeps its
  // change. Nothing was written, and no request is left to end.
  await expect(evening).toContainText(tb.meanwhile);
  await expect(evening).toContainText(NOA.first);
  await expect(evening).not.toContainText(YOAV.first);
  await expect(morning).toContainText(tb.nobody);
  await expect(morning).not.toContainText(tb.meanwhile);
  await expect(warning).toHaveCount(0);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
    { weekday: 0, pattern: "evening", phone: NOA.e164, position: null },
  ]);
  await expectCleanPage(page);

  // Published again: the morning's change goes out, and the approval stands.
  await screen.publishChanges();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  await expect
    .poll(scheduleAssignments)
    .toEqual([
      { weekday: 0, pattern: "evening", phone: NOA.e164, position: null },
    ]);
  expect(await demoSwaps()).toEqual([
    { status: "approved", from: YOAV.e164, to: NOA.e164 },
  ]);
  await expect(publish).toHaveCount(0);
  await expect(evening).not.toContainText(tb.meanwhile);
});

test("a manager is warned before a tab takes unsaved work away", async ({
  page,
}) => {
  const screen = buildScreen(page);
  // Home, with its count of what needs the person when it has one. The label
  // and the count are blocks, so the name reads "היום , 2 ...".
  const home = page.getByRole("link", {
    name: new RegExp(`^${literal(he.app.nav.home)}(\\s*,|$)`),
  });
  const warning = page.getByRole("dialog", { name: tb.leave.title });
  const placeNoa = async () => {
    await screen.card("בוקר").click();
    await screen.addButton(NOA.name).click();
    await screen.closeSheet();
  };
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");

  // Nothing changed yet: the tab just goes there.
  await home.click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/schedule/build");

  // A change holds the tab back and asks. Staying keeps the work.
  await placeNoa();
  await home.click();
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(nextWeekUrl());
  await expectCleanPage(page);
  await warning.getByRole("button", { name: tb.leave.stay }).click();
  await expect(warning).toHaveCount(0);
  await expect(screen.card("בוקר")).toContainText(NOA.first);

  // Leaving without saving saves nothing.
  await home.click();
  await warning.getByRole("button", { name: tb.leave.discard }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(await scheduleAssignments()).toEqual([]);

  // Saving on the way out keeps it as a draft, and still goes there.
  await page.goto("/schedule/build");
  await placeNoa();
  await home.click();
  await warning.getByRole("button", { name: tb.leave.save }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ]);
  expect(await schedulePublished()).toBe(false);
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

// The week running now (R3a) can only be seeded relative to the real clock,
// since the server's can't be faked: these specs skip within two hours of the
// restaurant's week start and four hours before its end (its own
// `weekStartsOn`), and near midnight, so all of the seeded shifts fall today.
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const weekdayOf = (date: string) =>
  he.app.availability.weekdays[
    WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "sun"
  ];
const dayMonthOf = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day}.${month}`;
};
/** The switch's "this week", not "next week", whatever its count says. */
const thisWeekButton = (page: Page) =>
  page.getByRole("button", {
    name: new RegExp(
      `^${literal(he.app.shifts.week.this)}(?!\\s*${literal(he.app.shifts.week.next.replace(he.app.shifts.week.this, "").trim())})`,
    ),
  });

async function skipNearTheWeekEdges() {
  const clock = await demoRunningWeekClock();
  test.skip(
    clock.sinceStart < 120 ||
      clock.untilEnd < 240 ||
      clock.minuteOfDay < 90 ||
      clock.minuteOfDay > 21 * 60 + 30,
    "too close to the edge of the restaurant's week, or of the day",
  );
  return clock;
}

// The running-week plan's R3a: in the week running now, the morning under
// way is locked (its sheet only adds people, and Yoav joins it), the evening
// freed when someone left is filled and published, the worker sees it, and
// Yoav's request on the night shift, which nobody touched, still waits.
// Runs against R2a's database (`joins`), after the rebase onto it.
test("a manager fills a freed shift this week", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(HELD_TEST_MS);
  const { today, startsOn, sinceStart } = await skipNearTheWeekEdges();
  await publishDemoRunningWeek(NOA.e164, YOAV.e164);
  // The day before, when it is in this week too.
  const yesterday =
    sinceStart >= 24 * 60
      ? new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;
  /** When the morning began, as the database has it. */
  const morningStart = async () =>
    (await scheduleShifts()).find((s) => s.name === "בוקר")?.start ?? "00:00";
  const read = await scheduleShiftIds();
  const waiting = [{ status: "open", from: YOAV.e164, to: null }];
  expect(await demoSwaps()).toEqual(waiting);
  const on = { day: weekdayOf(today), date: dayMonthOf(today) };
  const screen = buildScreen(page);
  const running = he.app.build.running;

  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await thisWeekButton(page).click();
  await expect(page).toHaveURL(
    new RegExp(`/schedule/build\\?week=${startsOn}$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();

  // The morning has begun: it says so, and its sheet only adds people.
  const morning = screen.card("בוקר", on);
  await expect(morning).toContainText(running.now);
  await morning.click();
  await expect(screen.sheet).toContainText(before(running.begunLine));
  await expect(
    screen.sheet.getByRole("button", {
      name: tb.edit.replace("{name}", "בוקר"),
    }),
  ).toHaveCount(0);
  await expect(screen.removeButton(NOA.name)).toHaveCount(0);
  // Yoav fills the morning's other place, and goes as a join: his night
  // starts as the morning ends.
  await screen.addButton(YOAV.name).click();
  await expect(screen.removeButton(YOAV.name)).toBeVisible();
  await screen.closeSheet();
  await expect(morning).toContainText(YOAV.first);

  // The freed evening takes Noa, whose morning ends as it starts.
  const evening = screen.card("ערב", on);
  await expect(evening).toContainText(tb.nobody);
  await evening.click();
  await screen.addButton(NOA.name).click();
  await screen.closeSheet();
  await expect(evening).toContainText(NOA.first);
  // It starts within 12 hours: check with its people directly.
  await expect(page.getByText(running.soon)).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-build-running.png"),
    fullPage: true,
  });

  // Today takes a new shift only from now on; a day that is over takes none.
  await screen.addOn(on).click();
  const adding = page.getByRole("dialog", { name: tb.addShift });
  await adding.getByLabel(tb.editor.name).fill("אמצע");
  await adding.getByLabel(tb.editor.start).fill(await morningStart());
  await adding.getByLabel(tb.editor.end).fill("23:59");
  await adding.getByRole("button", { name: tb.editor.add }).click();
  await expect(adding.getByRole("alert")).toHaveText(tb.editor.problems.past);
  await adding.getByRole("button", { name: tb.close }).click();
  await expect(adding).toHaveCount(0);
  if (yesterday) {
    await expect(screen.addOn({ day: weekdayOf(yesterday) })).toHaveCount(0);
  }

  await screen.publishChanges();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  // Written in place: every shift keeps its id, the morning its person and
  // Yoav, who joined it, and the request on the night nobody touched still
  // waits.
  expect(await scheduleShiftIds()).toEqual(read);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  expect(await scheduleAssignments()).toEqual([
    { weekday, pattern: "morning", phone: NOA.e164, position: null },
    { weekday, pattern: "morning", phone: YOAV.e164, position: null },
    { weekday, pattern: "evening", phone: NOA.e164, position: null },
    { weekday, pattern: null, phone: YOAV.e164, position: null },
  ]);
  expect(await demoSwaps()).toEqual(waiting);
  // The morning stays locked after the builder starts again.
  await expect(screen.card("בוקר", on)).toContainText(running.now);

  // Noa sees the evening on the team's schedule.
  const worker = await secondPage(browser, testInfo);
  try {
    await signIn(worker, NOA);
    await worker.goto("/schedule");
    const hers = worker
      .getByRole("region", {
        name: new RegExp(
          `^${literal(before(he.app.shifts.shift.replace("{name}", "ערב")))}`,
        ),
      })
      .filter({ visible: true })
      .first();
    await expect(hers).toContainText(NOA.first);
  } finally {
    await worker.context().close();
  }
});

// The switch between the weeks goes through the same question as any way out
// while there is unsaved work (use-leave-guard.ts: the same page with another
// `?week` is another week's work).
test("switching weeks with unsaved work asks first", async ({ page }) => {
  const { startsOn } = await skipNearTheWeekEdges();
  const screen = buildScreen(page);
  const warning = page.getByRole("dialog", { name: tb.leave.title });
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();

  await screen.card("בוקר").click();
  await screen.addButton(NOA.name).click();
  await screen.closeSheet();
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  // Held back, and asked. Staying keeps the work and the week.
  await thisWeekButton(page).click();
  await expect(warning).toBeVisible();
  await expect(page).toHaveURL(nextWeekUrl(startsOn));
  await expectCleanPage(page);
  await warning.getByRole("button", { name: tb.leave.stay }).click();
  await expect(warning).toHaveCount(0);
  await expect(screen.card("בוקר")).toContainText(NOA.first);

  // Leaving without saving goes to this week and saves nothing.
  await thisWeekButton(page).click();
  await warning.getByRole("button", { name: tb.leave.discard }).click();
  await expect(page).toHaveURL(
    new RegExp(`/schedule/build\\?week=${startsOn}$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();
  expect(await scheduleAssignments()).toEqual([]);

  // Nothing unsaved: the switch just goes.
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(he.app.shifts.week.next)}`),
    })
    .click();
  await expect(page).toHaveURL(/\/schedule\/build\?week=\d{4}-\d{2}-\d{2}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.title }),
  ).toBeVisible();
  await expect(warning).toHaveCount(0);
});

// The running-week plan's R4: a draft of this week saved before the week
// turned, not published and with nothing still to start lacking anyone,
// outlives the turn. Its managers see it on the "השבוע" tab, its cards lead
// to this week's builder, and Today's hero and "ניהול הסידור" lead there too,
// since the team is waiting for it to be published; the team sees nothing of
// it.
test("this week's saved draft waits for its managers, and the team sees nothing of it", async ({
  page,
  browser,
}, testInfo) => {
  const { startsOn } = await skipNearTheWeekEdges();
  await saveDemoRunningWeek(NOA.e164);
  const thisWeek = `/schedule/build?week=${startsOn}`;
  const evening = new RegExp(
    `^${literal(before(he.app.shifts.shift.replace("{name}", "ערב")))}`,
  );

  await signIn(page, MANAGER);
  await expect(page).toHaveURL(/\/home$/);
  // Nothing is out: the hero's way in is this week's builder, not next week's.
  const hero = page.getByRole("region", {
    name: he.app.home.hero.businessNext,
  });
  await expect(hero).toContainText(he.app.home.hero.notPublished.title);
  await expect(
    hero.getByRole("link", { name: he.app.home.hero.build }),
  ).toHaveAttribute("href", thisWeek);

  // The schedule tab opens on this week's draft, and its card on its builder.
  await page.goto("/schedule");
  await expect(
    page.getByText(he.app.shifts.board.draft).filter({ visible: true }),
  ).toBeVisible();
  const card = page
    .getByRole("region", { name: evening })
    .filter({ visible: true })
    .first();
  await expect(card).toContainText(NOA.first);
  await expect(card.getByRole("link")).toHaveAttribute("href", thisWeek);
  // "ניהול הסידור": this week first, saved and waiting to be published.
  const row = page
    .getByRole("link", { name: new RegExp(literal(tb.titleRunning)) })
    .filter({ visible: true });
  await expect(row).toHaveAttribute("href", thisWeek);
  await expect(row).toContainText(tb.entry.subtitleSaved);
  await expectCleanPage(page);
  await card.getByRole("link").click();
  await expect(page).toHaveURL(
    new RegExp(`/schedule/build\\?week=${startsOn}$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();

  // A worker reads only what is out: nothing yet.
  const worker = await secondPage(browser, testInfo);
  try {
    await signIn(worker, YOAV);
    await worker.goto("/schedule");
    await expect(
      worker
        .getByText(he.app.shifts.mine.notPublished)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(worker.getByRole("region", { name: evening })).toHaveCount(0);
  } finally {
    await worker.context().close();
  }
});

// The fill on a draft of the week running now (R3a), whose answers were all
// sent before it began: here nobody sent any, and nobody can now. Today's
// evening, in an hour, for two with Noa on it, has a place open, so the fill
// is offered. Its sheet says nobody sent availability without "עדיין", names
// who sent nothing with the way to place them by hand rather than a
// reminder, and has no link to the team's availability, which is next
// week's. It says it checks nobody's age, as in every business.
test("filling this week's draft that nobody answered for says to place people by hand", async ({
  page,
}) => {
  const { startsOn } = await skipNearTheWeekEdges();
  const tf = tb.fill;
  const fill = fillScreen(page);
  await saveDemoRunningWeek(NOA.e164, 2);
  await signIn(page, MANAGER);
  await page.goto(`/schedule/build?week=${startsOn}`);
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();

  await fill.action.click();
  await expect(fill.sheet).toContainText(tf.nothing.noAnswersRunning);
  await expect(fill.sheet).not.toContainText(tf.nothing.noAnswers);
  await expect(fill.missing).toContainText(YOAV.name);
  await expect(fill.missing).toContainText(tf.byHand);
  await expect(fill.missing).not.toContainText(linkWords(tf.remind));
  await expect(fill.sheet.getByRole("link")).toHaveCount(0);
  await expect(fill.sheet).toContainText(tf.age);
  await expectCleanPage(page);
  await page.keyboard.press("Escape");
  await expect(fill.sheet).toHaveCount(0);
  await expect(fill.action).toBeFocused();
});

// A link to a week already over (an old line, say) says so and leads to the
// week running now.
test("a week already over says so", async ({ page }) => {
  const { startsOn } = await skipNearTheWeekEdges();
  const ended = he.app.build.ended;
  await signIn(page, MANAGER);
  const [year, month, day] = startsOn.split("-").map(Number);
  const lastWeek = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) - 7),
  )
    .toISOString()
    .slice(0, 10);
  await page.goto(`/schedule/build?week=${lastWeek}`);
  await expect(
    page.getByRole("heading", { level: 1, name: ended.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.getByRole("link", { name: ended.action }).click();
  await expect(page).toHaveURL(
    new RegExp(`/schedule/build\\?week=${startsOn}$`),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: tb.titleRunning }),
  ).toBeVisible();
});
