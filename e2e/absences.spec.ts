import AxeBuilder from "@axe-core/playwright";
import {
  clearDemoAbsences,
  databaseNow,
  demoAbsences,
  demoActivityActions,
  recordDemoAbsence,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Days away (known issue 19; 20261127000600_absences.sql) at the demo
// restaurant. Shiran, its manager, who edits the clock, records Noa's
// vacation from her page, is refused days that overlap it, and has no way to
// record her own; then changes it to reserve duty, removes it, and brings it
// back with the toast's "ביטול". Today shows whoever builds the schedule who
// is away, never why, and Noa reads her own day away on her hours. Every
// test starts and ends with no days away at the restaurant.
const TZ = "Asia/Jerusalem";
const MANAGER = {
  id: "00000000-0000-4000-a000-000000000002",
  name: "שירן הדגמה",
  local: "050-000-0002",
  e164: "+972500000002",
};
const NOA = {
  id: "00000000-0000-4000-a000-000000000003",
  name: "נועה כהן",
  local: "050-000-0003",
  e164: "+972500000003",
};

/** The business's day today, and the Sunday after it, `YYYY-MM-DD`. */
function days(): { today: string; sunday: string; monday: string } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(),
  );
  const at = new Date(`${today}T12:00:00Z`);
  const ahead = 7 - at.getUTCDay();
  const day = (n: number) =>
    new Date(at.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { today, sunday: day(ahead), monday: day(ahead + 1) };
}

const shown = (page: Page, text: string | RegExp) =>
  page.getByRole("main").getByText(text).filter({ visible: true }).first();

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

/** "רישום היעדרות": a row on phones and tablets, a pill beside the table on a desktop. */
const recordButton = (page: Page) =>
  page
    .getByRole("button", { name: heT("app.clock.absences.add") })
    .filter({ visible: true })
    .first();

/** The open sheet, by its title. */
const sheet = (page: Page) => page.getByRole("dialog");

test.beforeEach(async () => {
  await clearDemoAbsences();
});
test.afterAll(async () => {
  await clearDemoAbsences();
});

test("whoever edits the clock records days away, is refused an overlap, and never their own", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { sunday, monday } = days();
  const since = await databaseNow();
  const note = `אישור התקבל ${Date.now()}`;
  await signIn(page, MANAGER);

  await page.goto(`/clock/team/${NOA.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expect(
    page.getByRole("heading", { name: heT("app.clock.absences.title") }),
  ).toBeVisible();
  await expectCleanPage(page);

  await recordButton(page).click();
  const dialog = sheet(page);
  await expect(
    dialog.getByRole("heading", {
      name: heT("app.clock.absences.sheet.addTitle"),
    }),
  ).toBeVisible();
  await dialog
    .getByRole("radio", { name: heT("app.clock.absences.kinds.vacation") })
    .check();
  await dialog
    .getByLabel(heT("app.clock.absences.sheet.from"), { exact: true })
    .fill(sunday);
  await dialog
    .getByLabel(heT("app.clock.absences.sheet.to"), { exact: true })
    .fill(monday);
  await dialog.getByLabel(heT("app.clock.absences.sheet.note")).fill(note);
  await expectCleanPage(page);
  await dialog
    .getByRole("button", { name: heT("app.clock.absences.sheet.submit") })
    .click();
  await expect(
    page.getByText(heT("app.clock.absences.done.add")).first(),
  ).toBeVisible();

  // The row: its kind, its days and its note.
  await expect(
    shown(page, heT("app.clock.absences.kinds.vacation")),
  ).toBeVisible();
  await expect(shown(page, note)).toBeVisible();
  expect(await demoAbsences(NOA.id)).toEqual([
    { kind: "vacation", from: sunday, to: monday, note, removed: false },
  ]);
  expect(await demoActivityActions("clock.absence_add", since)).toBe(1);

  // Monday again overlaps it.
  await recordButton(page).click();
  await dialog
    .getByRole("radio", { name: heT("app.clock.absences.kinds.sick") })
    .check();
  await dialog
    .getByLabel(heT("app.clock.absences.sheet.from"), { exact: true })
    .fill(monday);
  await dialog
    .getByRole("button", { name: heT("app.clock.absences.sheet.submit") })
    .click();
  await expect(
    dialog.getByText(heT("app.clock.absences.failure.overlap")),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // Her own page offers no way to record her own.
  await page.goto(`/clock/team/${MANAGER.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    MANAGER.name,
  );
  await expect(
    page.getByRole("button", { name: heT("app.clock.absences.add") }),
  ).toHaveCount(0);

  // The log says it, without the note.
  await page.goto("/manage/activity");
  await expect(
    shown(
      page,
      new RegExp(`${NOA.name}: ${heT("app.clock.absences.kinds.vacation")}`),
    ),
  ).toBeVisible();
  await expect(page.getByText(note)).toHaveCount(0);
});

test("a record is changed, removed, and brought back with the toast's undo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { sunday, monday } = days();
  const since = await databaseNow();
  await recordDemoAbsence(NOA.id, "vacation", sunday, monday);
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}`);

  await page
    .getByRole("button", { name: heT("app.clock.absences.kinds.vacation") })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = sheet(page);
  await dialog
    .getByRole("radio", { name: heT("app.clock.absences.kinds.reserve") })
    .check();
  await dialog
    .getByRole("button", { name: heT("app.clock.absences.sheet.save") })
    .click();
  await expect(
    page.getByText(heT("app.clock.absences.done.edit")).first(),
  ).toBeVisible();
  expect((await demoAbsences(NOA.id))[0]?.kind).toBe("reserve");
  expect(await demoActivityActions("clock.absence_change", since)).toBe(1);

  await page
    .getByRole("button", { name: heT("app.clock.absences.kinds.reserve") })
    .filter({ visible: true })
    .first()
    .click();
  await dialog
    .getByRole("button", { name: heT("app.clock.absences.sheet.remove") })
    .click();
  await expect(
    page.getByText(heT("app.clock.absences.done.remove")).first(),
  ).toBeVisible();
  expect((await demoAbsences(NOA.id))[0]?.removed).toBe(true);
  await page
    .getByRole("button", { name: heT("app.clock.absences.done.undo") })
    .click();
  await expect(
    page.getByText(heT("app.clock.absences.done.restore")).first(),
  ).toBeVisible();
  expect((await demoAbsences(NOA.id))[0]?.removed).toBe(false);
  expect(await demoActivityActions("clock.absence_remove", since)).toBe(1);
  expect(await demoActivityActions("clock.absence_restore", since)).toBe(1);
});

test("Today says who is away to whoever builds the schedule, never why, and the person reads their own", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const { today } = days();
  await recordDemoAbsence(NOA.id, "sick", today, today);
  await signIn(page, MANAGER);

  await page.goto("/home");
  const section = page
    .getByRole("main")
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: heT("app.home.away.title"),
        exact: true,
      }),
    });
  await expect(section.getByText(NOA.name)).toBeVisible();
  await expect(
    section.getByText(heT("app.clock.absences.todayOnly")),
  ).toBeVisible();
  await expect(
    section.getByText(heT("app.clock.absences.kinds.sick")),
  ).toHaveCount(0);
  await expectCleanPage(page);

  const noa = await secondPage(browser, testInfo);
  try {
    await signIn(noa, NOA);
    await expect(
      noa.getByRole("heading", { name: heT("app.home.away.title") }),
    ).toHaveCount(0);
    await noa.goto("/clock/history");
    await expect(
      shown(noa, heT("app.clock.absences.kinds.sick")),
    ).toBeVisible();
  } finally {
    await noa.context().close();
  }
});

test("the builder says who is away on next week's days", async ({ page }) => {
  test.setTimeout(60_000);
  const { sunday } = days();
  await recordDemoAbsence(NOA.id, "vacation", sunday, sunday);
  await signIn(page, MANAGER);
  await page.goto(`/schedule/build?week=${sunday}`);
  await expect(
    shown(page, heT("app.build.awayDay", { names: NOA.name })),
  ).toBeVisible();
  await expectCleanPage(page);
});
