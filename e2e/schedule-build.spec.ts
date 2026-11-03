import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
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
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const YOAV = { name: "יואב לוי", local: "050-000-0004", e164: "+972500000004" };
const WAITER = "מלצר/ית";

const tb = he.app.build;
// The text of a message up to its first placeholder or tag.
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
// Any form of an ICU plural message, with # as a number.
const plural = (message: string) =>
  new RegExp(
    [...message.matchAll(/\{([^{}]+)\}/g)]
      .map((m) => (m[1] ?? "").replace("#", "\\d+"))
      .join("|"),
  );
// Next week's Sunday morning shift, whatever its date.
const sundayMorning = new RegExp(
  `^${before(
    tb.shift
      .replace("{name}", "בוקר")
      .replace("{day}", he.app.availability.weekdays.sun),
  )}`,
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

  // Phone and tablet open on the week's first day; desktop shows it all.
  const shift = page.getByRole("region", { name: sundayMorning });
  await expect(shift).toHaveCount(1);
  await expect(shift).toContainText(tb.nobody);
  const add = shift.getByLabel(tb.add);
  // Noa said she is free, Yoav has not answered.
  await expect(
    add.locator(`optgroup[label="${tb.groups.available}"] option`, {
      hasText: NOA.name,
    }),
  ).toHaveCount(1);
  await expect(
    add.locator(`optgroup[label="${tb.groups.noAnswer}"] option`, {
      hasText: YOAV.name,
    }),
  ).toHaveCount(1);
  await add.selectOption({ label: NOA.name });
  await expect(shift.getByRole("listitem")).toContainText([NOA.name]);
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  // She works as a waiter on this shift; the shift counts its positions.
  const position = shift.getByLabel(tb.position.replace("{name}", NOA.name));
  await expect(position).toHaveValue("");
  await position.selectOption({ label: WAITER });
  await expect(shift).toContainText(
    tb.inPosition.replace("{name}", WAITER).replace("{count}", "1"),
  );

  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: "waiter" },
  ]);

  // Saved: it comes back after a reload, with when it was saved.
  await page.reload();
  const saved = page.getByRole("region", { name: sundayMorning });
  await expect(saved.getByRole("listitem")).toContainText([NOA.name]);
  await expect(
    saved.getByLabel(tb.position.replace("{name}", NOA.name)),
  ).toHaveValue("waiter");
  await expect(page.getByText(before(tb.savedAt))).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-build.png"),
    fullPage: true,
  });

  // Taking her off and saving leaves the shift empty again.
  await saved
    .getByRole("button", {
      name: tb.remove.replace("{name}", NOA.name),
    })
    .click();
  await expect(saved).toContainText(tb.nobody);
  await page.getByRole("button", { name: tb.submit }).click();
  await expect(page.getByRole("status")).toHaveText(tb.saved);
  expect(await scheduleAssignments()).toEqual([]);
});

test("a manager changes, adds and removes next week's shifts", async ({
  page,
}, testInfo) => {
  const te = tb.editor;
  const sunday = he.app.availability.weekdays.sun;
  const region = (name: string) =>
    page.getByRole("region", {
      name: new RegExp(
        `^${before(tb.shift.replace("{name}", name).replace("{day}", sunday))}`,
      ),
    });
  const editButton = (name: string) =>
    region(name).getByRole("button", { name: tb.edit.replace("{name}", name) });
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  const morning = region("בוקר");
  const evening = region("ערב");
  await expect(morning).toHaveCount(1);
  await expect(evening).toHaveCount(1);

  // Fewer people and an earlier end on Sunday morning.
  await editButton("בוקר").click();
  await morning.getByLabel(te.needed).fill("2");
  await morning.getByLabel(te.end).fill("15:00");
  await morning.getByRole("button", { name: te.apply }).click();
  await expect(morning).toContainText(
    tb.people.replace("{assigned}", "0").replace("{needed}", "2"),
  );
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  // Removing a shift can be undone; the second time it stays removed.
  await editButton("ערב").click();
  await evening.getByRole("button", { name: te.delete }).click();
  await expect(evening).toHaveCount(0);
  await page.getByRole("button", { name: tb.undoRemove }).click();
  await expect(evening).toHaveCount(1);
  await editButton("ערב").click();
  await evening.getByRole("button", { name: te.delete }).click();
  await expect(evening).toHaveCount(0);

  // A new shift: a name is required first.
  const addOnSunday = new RegExp(
    `^${before(tb.addShiftOn.replace("{day}", sunday))}`,
  );
  await page.getByRole("button", { name: addOnSunday }).click();
  const adding = page.getByRole("region", { name: addOnSunday });
  await adding.getByRole("button", { name: te.add }).click();
  await expect(adding.getByRole("alert")).toHaveText(te.problems.name);
  await adding.getByLabel(te.name).fill("אמצע");
  await adding.getByLabel(te.start).fill("14:00");
  await adding.getByLabel(te.end).fill("20:00");
  await adding.getByLabel(te.needed).fill("2");
  await adding.getByRole("button", { name: te.add }).click();
  const middle = region("אמצע");
  await expect(middle).toHaveCount(1);
  await expectCleanPage(page);

  // Noa on two shifts that overlap: the screen says so and does not save.
  await morning.getByLabel(tb.add).selectOption({ label: NOA.name });
  await middle.getByLabel(tb.add).selectOption({ label: NOA.name });
  await expect(page.getByText(tb.clashBadge)).toBeVisible();
  await expect(middle).toContainText(tb.notes.busy);
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
  await editButton("אמצע").click();
  await middle.getByLabel(te.start).fill("15:00");
  await middle.getByRole("button", { name: te.apply }).click();
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
  await expect(region("אמצע")).toHaveCount(1);
  await expect(region("ערב")).toHaveCount(0);
  await expectCleanPage(page);
});

test("a manager publishes next week's schedule, then publishes changes", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/schedule/build");
  const shift = page.getByRole("region", { name: sundayMorning });
  await shift.getByLabel(tb.add).selectOption({ label: NOA.name });
  await expect(page.getByText(tb.unsaved)).toBeVisible();

  // One step: saved and published together.
  await page.getByRole("button", { name: tb.publish }).click();
  await expect(page.getByRole("status")).toHaveText(tb.published);
  expect(await schedulePublished()).toBe(true);
  expect(await scheduleAssignments()).toEqual([
    { weekday: 0, pattern: "morning", phone: NOA.e164, position: null },
  ]);

  // Published: no more draft. Changes are published, not saved aside.
  await page.reload();
  await expect(page.getByText(before(tb.publishedAt))).toBeVisible();
  await expect(page.getByRole("button", { name: tb.submit })).toHaveCount(0);
  const published = page.getByRole("region", { name: sundayMorning });
  await expect(published.getByRole("listitem")).toContainText([NOA.name]);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("schedule-published.png"),
    fullPage: true,
  });

  await published
    .getByRole("button", { name: tb.remove.replace("{name}", NOA.name) })
    .click();
  await expect(page.getByText(tb.unpublished)).toBeVisible();
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
