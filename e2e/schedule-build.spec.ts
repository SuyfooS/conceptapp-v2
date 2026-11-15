import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { before, buildScreen } from "./build-screen";
import {
  clearAvailability,
  clearSchedule,
  decideDemoSwap,
  demoRunningWeekClock,
  demoSwaps,
  publishDemoRunningWeek,
  requestDemoSwap,
  scheduleAssignments,
  scheduleDemoSunday,
  schedulePublished,
  scheduleShiftIds,
  scheduleShifts,
  sendDemoAvailability,
  takenDemoSwap,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

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

const tb = he.app.build;
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

// The week is written in place (20261115000100_week_in_place.sql): a shift
// changed on the screen keeps its id, one nobody touched keeps the swap
// request on it, and a shift added keeps the id its first publish gave it.
test("republishing next week keeps a request on a shift nobody touched", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: tb.publishChanges }).click();
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
  await page.getByRole("button", { name: tb.publishChanges }).click();
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

test("a swap approved while the builder was open survives", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: tb.publishChanges }).click();
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

  await publish.click();
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
  await publish.click();
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

  await page.getByRole("button", { name: tb.publishChanges }).click();
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
