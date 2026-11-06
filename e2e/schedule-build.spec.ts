import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { before, buildScreen } from "./build-screen";
import {
  clearAvailability,
  clearSchedule,
  scheduleAssignments,
  schedulePublished,
  scheduleShifts,
  sendDemoAvailability,
} from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql: the demo restaurant (restaurant template:
// from Sunday to Thursday a morning shift 09:00–16:00 for three people and
// an evening shift 16:00–23:30 for four; Friday morning; Saturday night),
// its manager and two workers. Noa sends 09:00–17:00 for next Sunday;
// Yoav sends nothing. The template's positions include "מלצר/ית" (waiter).
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", first: "נועה", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const WAITER = "מלצר/ית";

const tb = he.app.build;
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
  await expect(page).toHaveURL(/\/schedule\/build$/);
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

  // Removing a shift can be undone; the second time it stays removed.
  await evening.click();
  await screen.openDetails("ערב");
  await sheet.getByRole("button", { name: te.delete }).click();
  await expect(sheet).toHaveCount(0);
  await expect(evening).toHaveCount(0);
  await page.getByRole("button", { name: tb.undoRemove }).click();
  await expect(evening).toHaveCount(1);
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
  await page.getByRole("button", { name: tb.publishChanges }).click();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  expect(await scheduleAssignments()).toEqual([]);
  expect(await schedulePublished()).toBe(true);

  // The schedule's entry says it is out.
  await page.goto("/schedule");
  await expect(
    page.getByRole("link", { name: new RegExp(tb.title) }),
  ).toContainText(tb.entry.subtitlePublished);
});

test("a manager is warned before a tab takes unsaved work away", async ({
  page,
}) => {
  const screen = buildScreen(page);
  const home = page.getByRole("link", { name: he.app.nav.home, exact: true });
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
  await expect(page).toHaveURL(/\/schedule\/build$/);
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
