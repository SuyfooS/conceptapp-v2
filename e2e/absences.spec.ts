import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { focusWhenSaid, noteFocusWhenSaid } from "./announcer";
import { buildScreen, onDate } from "./build-screen";
import {
  buildDemoThisWeek,
  clearAvailability,
  clearDemoAbsences,
  clearSchedule,
  databaseNow,
  demoAbsences,
  demoActivityActions,
  demoRunningWeekClock,
  recordDemoAbsence,
  seededPayMonth,
  sendDemoAvailability,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, type Request, test } from "./test";
import { readWorkbook, sheetCells, unzip } from "./unzip";

// Days away (known issue 19; 20261127000700_absences.sql) at the demo
// restaurant. Shiran, its manager, who edits the clock, records Noa's
// vacation from her page, is refused days that overlap it, and has no way to
// record her own; then changes it to reserve duty, removes it, brings it
// back with the toast's "ביטול", and removes it again. Today shows whoever
// builds the schedule who is away, never why, and Noa reads her own day away
// on her hours. The builder says it on the day, in a shift's people and in
// the copy from last week, and her page leads to the week of a shift still
// on a day away. The owner's hours for payroll count the days by kind, list
// each date, and the file has them. Every test starts and ends with no days
// away at the restaurant, and one that builds a week clears it after.
const TZ = "Asia/Jerusalem";
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
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

/** The day `count` days after `date` (YYYY-MM-DD). */
const daysAfter = (date: string, count: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + count * 86_400_000)
    .toISOString()
    .slice(0, 10);

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

/** Text to find as it is, inside a pattern. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A log line's start, up to its kind, about Noa: "הסרת היעדרות של נועה כהן: ". */
const logLine = (message: string) =>
  new RegExp(
    literal((message.split("{kind}")[0] ?? "").replace("{person}", NOA.name)),
  );

/**
 * This week and next are read from the real clock, by the server and by the
 * database helpers alike: a test that builds this week skips within two
 * hours of the restaurant's week turning, either side.
 */
async function skipNearTheWeekTurn() {
  const clock = await demoRunningWeekClock();
  test.skip(
    clock.sinceStart < 120 || clock.untilEnd < 120,
    "too close to the restaurant's week turning",
  );
  return clock;
}

/** A day as the screens write it short: `2026-11-10` as "10.11". */
const shortDay = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day}.${month}`;
};

/** Excel's serial day number back to `YYYY-MM-DD`. */
const fromSerial = (serial: number) =>
  new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
    .toISOString()
    .slice(0, 10);

type Cells = ReturnType<typeof sheetCells>;

/** A sheet's column by its header in the first row: "Q". */
const columnOf = (cells: Cells, header: string) =>
  (
    [...cells].find(
      ([ref, cell]) => /^[A-Z]+1$/.test(ref) && cell.value === header,
    )?.[0] ?? ""
  ).replace(/\d+$/, "");

/** The rows of a sheet whose first column holds `name`, by number. */
const rowsOf = (cells: Cells, name: string) =>
  [...cells]
    .filter(([ref, cell]) => /^A\d+$/.test(ref) && cell.value === name)
    .map(([ref]) => ref.slice(1));

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
  // Exactly the note: the hint of "היעדרות" says "בהערה" too.
  await dialog
    .getByLabel(heT("app.clock.absences.sheet.note"), { exact: true })
    .fill(note);
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
  // Said, the refusal lets the sheet go: Escape closes it.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Her own page offers no way to record her own, and says who does.
  await page.goto(`/clock/team/${MANAGER.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    MANAGER.name,
  );
  await expect(
    page.getByRole("button", { name: heT("app.clock.absences.add") }),
  ).toHaveCount(0);
  await expect(shown(page, heT("app.clock.absences.ownHint"))).toBeVisible();

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

test("a record is changed, removed, brought back with the toast's undo, and removed again", async ({
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
  // The toast's "ביטול" has the focus, the row having gone, and says what
  // it brings back; pressed, the record's row back in the list has it, and
  // the toast says it came back once it has.
  const undo = page.getByRole("button", {
    name: heT("app.clock.absences.done.undo"),
  });
  await expect(undo).toBeFocused();
  await expect(undo).toHaveAccessibleName(
    heT("app.clock.absences.done.undoRemove"),
  );
  await noteFocusWhenSaid(
    page,
    heT("app.clock.absences.done.restore"),
    "button",
    heT("app.clock.absences.kinds.reserve"),
  );
  await undo.click();
  await expect(
    page.getByText(heT("app.clock.absences.done.restore")).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: heT("app.clock.absences.kinds.reserve") })
      .filter({ visible: true })
      .first(),
  ).toBeFocused();
  await expect.poll(() => focusWhenSaid(page)).toBe(true);
  expect((await demoAbsences(NOA.id))[0]?.removed).toBe(false);
  expect(await demoActivityActions("clock.absence_remove", since)).toBe(1);
  expect(await demoActivityActions("clock.absence_restore", since)).toBe(1);

  // Removed again: the row is gone, and the log has both removals and the
  // return between them.
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
  await expect(
    page
      .getByRole("button", { name: heT("app.clock.absences.kinds.reserve") })
      .filter({ visible: true }),
  ).toHaveCount(0);
  await expect(shown(page, heT("app.clock.absences.none"))).toBeVisible();
  expect((await demoAbsences(NOA.id))[0]?.removed).toBe(true);
  expect(await demoActivityActions("clock.absence_remove", since)).toBe(2);
  expect(await demoActivityActions("clock.absence_restore", since)).toBe(1);
  const actions = he.app.manage.activity.actions.clock;
  await page.goto("/manage/activity");
  await expect(shown(page, logLine(actions.absenceRemove))).toBeVisible();
  await expect(shown(page, logLine(actions.absenceRestore))).toBeVisible();
});

/** Her page's writes, the server actions it sends. */
const herWrites = (url: URL) => url.pathname === `/clock/team/${NOA.id}`;
const isWrite = (request: Request) =>
  request.method() === "POST" && request.headers()["next-action"] !== undefined;

// A removal that can't go (no signal) says why each time it is pressed: its
// refusal is cleared as it sends, so the same words again are an alert drawn
// anew, and heard again (25 November 2026). Said, the sheet closes.
test("a removal refused twice in the same words says it twice, and the sheet then closes", async ({
  page,
}) => {
  const { sunday, monday } = days();
  await recordDemoAbsence(NOA.id, "vacation", sunday, monday);
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}`);
  await page
    .getByRole("button", { name: heT("app.clock.absences.kinds.vacation") })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = sheet(page);
  const remove = dialog.getByRole("button", {
    name: heT("app.clock.absences.sheet.remove"),
  });
  const failed = dialog
    .getByRole("alert")
    .filter({ hasText: heT("app.clock.absences.failure.failed") });
  await page.route(herWrites, async (route) => {
    if (isWrite(route.request())) await route.abort();
    else await route.fallback();
  });
  try {
    await remove.click();
    await expect(failed).toBeVisible();
    await failed.evaluate((line) => {
      (window as unknown as { seenLine?: Element }).seenLine = line;
    });
    await remove.click();
    await expect
      .poll(() =>
        failed.evaluate(
          (line) =>
            line !== (window as unknown as { seenLine?: Element }).seenLine,
        ),
      )
      .toBe(true);
  } finally {
    await page.unroute(herWrites);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect((await demoAbsences(NOA.id))[0]?.removed).toBe(false);
});

// Left by back while a refused write from the sheet is on its way, and come
// back to by forward (25 November 2026): her page is kept hidden once the
// answer is drawn (Next's Activity), and its sheet with it, which stays
// where it was instead of being drawn anew. It shows again open, with what
// was typed and the refusal said, closes with its ✕, and gives the focus
// back to what opened it, never to the page's body.
test("a refusal on its way as her page is left by back is said once it is come back to by forward", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { sunday, monday } = days();
  const note = `נרשם אחרי חזרה ${Date.now()}`;
  await recordDemoAbsence(NOA.id, "vacation", sunday, monday);
  await signIn(page, MANAGER);
  // From the team's page, so back and forward stay inside the app.
  await page.goto("/clock/team");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(NOA.name) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  const opener = recordButton(page);
  await opener.click();
  const dialog = sheet(page);
  await dialog
    .getByRole("radio", { name: heT("app.clock.absences.kinds.sick") })
    .check();
  await dialog
    .getByLabel(heT("app.clock.absences.sheet.from"), { exact: true })
    .fill(monday);
  const noteField = dialog.getByLabel(heT("app.clock.absences.sheet.note"), {
    exact: true,
  });
  await noteField.fill(note);

  // The write waits on its way until her page has been left.
  let letGo = () => {};
  const held = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  await page.route(herWrites, async (route) => {
    if (!isWrite(route.request())) {
      await route.fallback();
      return;
    }
    await held;
    await route.continue();
  });
  try {
    const answered = page.waitForResponse(
      (response) =>
        herWrites(new URL(response.url())) && isWrite(response.request()),
    );
    await dialog
      .getByRole("button", { name: heT("app.clock.absences.sheet.submit") })
      .click();
    await page.goBack();
    await expect(page).toHaveURL(/\/clock\/team$/);
    // The write runs in a transition (`useSheetWrite`), and React holds a
    // navigation started meanwhile until it ends: the team's page is drawn,
    // and hers kept hidden with its sheet, in the drawing of the refusal.
    letGo();
    await answered;
    await expect(dialog).toBeHidden();
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/clock/team/${NOA.id}`));
  } finally {
    letGo();
    await page.unroute(herWrites);
  }
  await expect(dialog).toHaveAttribute("data-state", "open");
  await expect(dialog.getByRole("alert")).toHaveText(
    heT("app.clock.absences.failure.overlap"),
  );
  await expect(noteField).toHaveValue(note);
  await dialog
    .getByRole("button", { name: heT("app.clock.team.sheet.close") })
    .click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await demoAbsences(NOA.id)).toHaveLength(1);
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

test("the builder says who is away on next week's days, in a shift's people and in the copy", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await skipNearTheWeekTurn();
  const tb = he.app.build;
  const { sunday } = days();
  await clearSchedule();
  try {
    // Noa can work next Sunday's morning, and works this week's.
    await sendDemoAvailability(NOA.e164, "e2e: away on Sunday");
    await buildDemoThisWeek(
      [
        {
          offset: 0,
          name: "בוקר",
          start: "09:00",
          end: "16:00",
          needed: 3,
          pattern: "morning",
          people: [[NOA.e164, null]],
        },
      ],
      true,
    );
    await recordDemoAbsence(NOA.id, "vacation", sunday, sunday);
    await signIn(page, MANAGER);
    await page.goto(`/schedule/build?week=${sunday}`);
    await expect(
      shown(page, heT("app.build.awayDay", { names: NOA.name })),
    ).toBeVisible();
    await expectCleanPage(page);

    // Sunday morning's people: away, though she said she can work it.
    const screen = buildScreen(page);
    await screen.card("בוקר").click();
    await expect(screen.group(tb.groups.away)).toContainText(NOA.name);
    await expect(
      screen.group(tb.groups.available).getByText(NOA.name),
    ).toHaveCount(0);
    await expectCleanPage(page);
    await screen.closeSheet();

    // The copy from this week leaves her out of Sunday and says why; closed
    // without copying.
    await page.getByRole("button", { name: tb.copy.action }).click();
    const copy = page.getByRole("dialog", { name: tb.copy.title });
    await expect(copy).toBeVisible();
    await expect(screen.group(tb.groups.away)).toContainText(NOA.name);
    await page.keyboard.press("Escape");
    await expect(copy).toHaveCount(0);
  } finally {
    await clearSchedule();
    await clearAvailability(NOA.e164);
  }
});

// A night past midnight into a day away (`awayDuring`, the fill plan's PR 3):
// the builder reads days away to the day after the week, so next Saturday's
// night, which runs into the Sunday after, counts as away for Noa in the copy,
// in the shift's people and on her row once she is on it, though nothing on
// next week's own days says she is away.
test("a night into a day away the day after the week: the copy leaves her off, and its people say she is away", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await skipNearTheWeekTurn();
  const tb = he.app.build;
  const { sunday } = days();
  const saturday = daysAfter(sunday, 6);
  const after = daysAfter(sunday, 7);
  await clearSchedule();
  try {
    // This week's Saturday night, added by hand, with Noa on it.
    await buildDemoThisWeek(
      [
        {
          offset: 6,
          name: "לילה",
          start: "20:00",
          end: "02:00",
          needed: 1,
          pattern: null,
          people: [[NOA.e164, null]],
        },
      ],
      true,
    );
    // Away on the Sunday after next week.
    await recordDemoAbsence(NOA.id, "vacation", after, after);
    await signIn(page, MANAGER);
    await page.goto(`/schedule/build?week=${sunday}`);
    await expect(
      page.getByRole("heading", { level: 1, name: tb.title }),
    ).toBeVisible();
    // No day of next week is hers away.
    await expect(
      shown(page, heT("app.build.awayDay", { names: NOA.name })),
    ).toHaveCount(0);

    // The copy leaves her off next Saturday's night, as away.
    const screen = buildScreen(page);
    await page.getByRole("button", { name: tb.copy.action }).click();
    const copy = page.getByRole("dialog", { name: tb.copy.title });
    await expect(copy).toContainText(
      heT("app.build.copy.summary", { shifts: 1, people: 0 }),
    );
    const away = screen.group(tb.groups.away);
    await expect(away).toContainText(NOA.name);
    await expect(away).toContainText(
      heT("app.build.copy.skippedOn", {
        shift: "לילה",
        day: he.app.availability.weekdays.sat,
      }),
    );
    await copy
      .getByRole("button", { name: heT("app.build.copy.submit", { count: 1 }) })
      .click();
    await expect(copy).toHaveCount(0);

    // The night's people: away, not among those who sent nothing.
    if (testInfo.project.name === "phone") {
      await page
        .getByRole("group", { name: tb.days, exact: true })
        .filter({ visible: true })
        .getByRole("button")
        .nth(6)
        .click();
    }
    const night = screen.card("לילה", onDate(saturday));
    await expect(night).toContainText(tb.nobody);
    await night.click();
    await expect(screen.group(tb.groups.away)).toContainText(NOA.name);
    await expect(
      screen.group(tb.groups.noAnswer).getByText(NOA.name),
    ).toHaveCount(0);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("night-into-a-day-away.png"),
      fullPage: true,
    });

    // Put on it all the same, her own row says so (`noteOf`), as the list
    // she came from did.
    await screen.addButton(NOA.name).click();
    const onIt = screen.group(tb.groups.assigned);
    await expect(onIt).toContainText(NOA.name);
    await expect(onIt).toContainText(tb.notes.away);
    await screen.closeSheet();
  } finally {
    await clearSchedule();
  }
});

test("a person's page leads to the builder's week of a shift still on a day away", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const clock = await skipNearTheWeekTurn();
  const offset = Math.round(
    (Date.parse(`${clock.today}T00:00:00Z`) -
      Date.parse(`${clock.startsOn}T00:00:00Z`)) /
      86_400_000,
  );
  await clearSchedule();
  try {
    // Sick today, with this evening's shift still on this week's schedule.
    await buildDemoThisWeek(
      [
        {
          offset,
          // Added by hand, so it is the same on any day of the week.
          name: "ערב",
          start: "16:00",
          end: "23:30",
          needed: 4,
          pattern: null,
          people: [[NOA.e164, null]],
        },
      ],
      true,
    );
    await recordDemoAbsence(NOA.id, "sick", clock.today, clock.today);
    await signIn(page, MANAGER);
    await page.goto(`/clock/team/${NOA.id}`);
    await expect(
      shown(page, heT("app.clock.absences.shiftsOn", { count: 1 })),
    ).toBeVisible();
    const toBuilder = page
      .getByRole("link", { name: heT("app.clock.absences.toBuilder") })
      .filter({ visible: true });
    // This week's builder, where the shift is: the builder alone opens next week.
    await expect(toBuilder).toHaveAttribute(
      "href",
      `/schedule/build?week=${clock.startsOn}`,
    );
    await toBuilder.click();
    await expect(
      page.getByRole("heading", { level: 1, name: he.app.build.titleRunning }),
    ).toBeVisible();
  } finally {
    await clearSchedule();
  }
});

test("the owner's hours for payroll count days away by kind, list each date, and the file has them", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const tp = he.app.pay;
  const vacation = he.app.clock.absences.kinds.vacation;
  const month = await seededPayMonth("restaurant");
  const first = `${month}-10`;
  const second = `${month}-11`;
  await recordDemoAbsence(NOA.id, "vacation", first, second);
  const twoDays = heT("app.pay.absences.byKind", {
    kind: vacation,
    days: heT("app.pay.absences.days", { count: 2 }),
  });
  await signIn(page, OWNER);

  // The month: "חופשה: 2 ימים" on Noa's line, and in its own column on a
  // desktop.
  await page.goto(`/clock/pay?month=${month}`);
  await expect(shown(page, twoDays)).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(
      page
        .getByRole("columnheader", { name: tp.columns.absences, exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  }
  await expectCleanPage(page);

  // Her month: the days by kind, with each date.
  await page.goto(`/clock/pay/${NOA.id}?month=${month}`);
  await expect(
    page
      .getByRole("heading", { name: tp.absences.title, exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(shown(page, twoDays)).toBeVisible();
  await expect(
    shown(page, `${shortDay(first)}, ${shortDay(second)}`),
  ).toBeVisible();
  await expectCleanPage(page);

  // The file (one download is enough): 2 under "ימי חופשה" in the summary,
  // and a daily row for each date that says "חופשה".
  if (testInfo.project.name !== "desktop") return;
  const response = await page.request.get(`/clock/pay/export?month=${month}`);
  expect(response.status()).toBe(200);
  const { sheets, strings } = readWorkbook(unzip(await response.body()));
  const f = tp.file.columns;
  const summary = sheetCells(sheets[0]?.xml ?? "", strings);
  const vacationColumn = columnOf(summary, f.summary.vacationDays);
  expect(vacationColumn).not.toBe("");
  expect(
    rowsOf(summary, NOA.name).reduce(
      (total, row) =>
        total + Number(summary.get(`${vacationColumn}${row}`)?.value || 0),
      0,
    ),
  ).toBe(2);
  const daily = sheetCells(sheets[1]?.xml ?? "", strings);
  const dateColumn = columnOf(daily, f.daily.date);
  const awayColumn = columnOf(daily, f.daily.absence);
  expect(awayColumn).not.toBe("");
  const away = rowsOf(daily, NOA.name)
    .filter((row) => daily.get(`${awayColumn}${row}`)?.value === vacation)
    .map((row) => fromSerial(Number(daily.get(`${dateColumn}${row}`)?.value)));
  expect([...new Set(away)].sort()).toEqual([first, second]);
});
