import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  ageDemoSchedules,
  demoListLines,
  demoModuleSettings,
  demoScheduleCount,
  makeDemoTemplate,
  pauseOtherDemoSchedules,
  removeDemoTemplates,
  resetDemoLists,
  resumeDemoSchedules,
  scheduledDemoLists,
  setDemoModuleSettings,
  tickLists,
} from "./db";
import { secondPage, signIn } from "./session";

// Lists, part 4 (L4): a template's times. The minute job is off here and the
// demo's reset opens no scheduled list, so the test opens them with
// `tickLists`, which runs what the job runs, and no test depends on the hour
// CI happens to run at. The people are seeded in supabase/seed.sql: Shiran
// manages the demo restaurant and Noa works in its kitchen. The test that
// writes makes a template of its own, by name, and removes it afterwards.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { local: "050-000-0003", e164: "+972500000003" };

const TIMED = "פתיחה של בדיקת הזמנים";
const OPENING = "פתיחת מטבח";

const l = he.app.lists;
const ls = l.schedules;
const lo = l.overview;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The words of an ICU plural for one, as the screen says it. */
const one = (text: string) =>
  /one \{([^}]*)\}/.exec(text)?.[1] ?? text.replace(/\{.*\}/, "");

async function expectCleanPage(page: Page) {
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

/** "HH:MM" in Israel. */
const israelTime = (at: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jerusalem",
  }).format(at);

/** "YYYY-MM-DD" in Israel. */
const israelDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(at);

test.afterEach(async () => {
  await resetDemoLists();
});

// The manager's day and the times of a template, at every width: the screens
// read as they should, and the sheet that adds a time is clean. Nothing here
// writes.
test("the manager's day and a template's times read cleanly", async ({
  page,
}) => {
  await signIn(page, MANAGER);

  // Lists leads to the business's day.
  await page.goto("/lists");
  await page
    .getByRole("link", { name: new RegExp(literal(l.team.title)) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/today$/);
  await expect(
    page.getByRole("heading", { level: 1, name: lo.title }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: lo.pick })).toBeVisible();
  await expectCleanPage(page);

  // The restaurant's opening list says when it is sent, and the sheet that
  // adds a time opens clean; nothing is saved by looking.
  await page.goto("/lists/templates");
  await page
    .getByRole("link", { name: new RegExp(`^${literal(OPENING)}`) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 2, name: ls.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.getByRole("button", { name: ls.add, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: ls.sheet.newTitle });
  await expect(sheet.getByRole("group", { name: ls.sheet.days })).toBeVisible();
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

// The whole way, on a computer only (it writes the shared demo): a time is
// saved in the editor and says when it is sent next; ticked, it opens the
// list for the kitchen, late already; Noa sees it late and hears of it, and
// reads the fridge out of range; the manager's day shows it first, with the
// reading, and the day before is a tap away.
test("a time saved opens its list, which turns late, and the manager's day shows it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "writes the shared demo: once, on a computer",
  );
  const scheduling = await demoModuleSettings("scheduling");
  // Whatever day CI runs on, Shabbat moves nothing here.
  await setDemoModuleSettings("scheduling", {
    ...scheduling,
    closedOnShabbat: false,
  });
  await removeDemoTemplates([TIMED]);
  const template = await makeDemoTemplate(TIMED);
  let paused: string[] = [];
  try {
    await signIn(page, MANAGER);
    await page.goto(`/lists/templates/${template}`);
    await expect(page.getByText(ls.empty)).toBeVisible();

    // Every day, half an hour ago, a quarter of an hour to do it.
    const opens = new Date(Date.now() - 30 * 60_000);
    const time = israelTime(opens);
    await page.getByRole("button", { name: ls.add, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: ls.sheet.newTitle });
    await sheet
      .getByRole("button", { name: ls.sheet.everyDay, exact: true })
      .click();
    await sheet.getByLabel(ls.sheet.at, { exact: true }).fill(time);
    await sheet
      .getByRole("button", { name: new RegExp(`^${literal(ls.sheet.lasts)}`) })
      .click();
    await page.getByRole("menuitemradio", { name: "15 דקות" }).click();
    await sheet
      .getByRole("button", { name: ls.sheet.create, exact: true })
      .click();
    await expect(sheet).toBeHidden();

    // Saved by itself, it says when it is sent next: today's time has gone
    // by, so tomorrow (or, just after midnight, later today).
    await expect.poll(() => demoScheduleCount(template)).toBe(1);
    const row = page
      .getByRole("button", { name: new RegExp(literal(time)) })
      .filter({ hasText: ls.everyDay });
    await expect(row).toContainText(
      new RegExp(`נשלחת (היום|מחר) ב-${literal(time)}`),
    );

    // The minute job, now, for a time that had been there all along.
    await ageDemoSchedules(template);
    paused = await pauseOtherDemoSchedules(template);
    expect(await tickLists()).toBe(1);
    const [opened] = await scheduledDemoLists(template);
    expect(opened).toMatchObject({ status: "open", late: true });
    expect(await tickLists()).toBe(0);
    expect(await scheduledDemoLists(template)).toHaveLength(1);
    await expect.poll(() => demoListLines("lists.late", TIMED)).toBe(1);

    // Noa sees it late, hears of it, and reads the fridge out of range.
    const noa = await secondPage(browser, testInfo);
    try {
      await signIn(noa, NOA);
      await noa.goto("/lists");
      const card = noa
        .getByRole("main")
        .getByRole("link", { name: new RegExp(literal(TIMED)) })
        .filter({ visible: true })
        .first();
      await expect(card).toContainText(l.card.late);
      await noa.goto("/notifications");
      // The desktop's table, not the list the phone and the tablet read.
      await expect(
        noa
          .getByText(
            he.app.notifications.kinds.lists.late.title.replace(
              "{name}",
              TIMED,
            ),
          )
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await noa.goto(`/lists/${opened?.id}`);
      const fridge = noa.getByLabel(
        l.list.readingOf.replace("{label}", "מקרר"),
      );
      await fridge.fill("7");
      await fridge.press("Enter");
      await expect
        .poll(() => demoListLines("lists.out_of_range", TIMED))
        .toBe(2);
    } finally {
      await noa.context().close();
    }

    // The manager's day: late first, with the reading out of range, in the
    // day's table and the week's. On a computer the late count is a badge
    // beside the table's title (exact: today's dot in the week says both
    // counts in one line, for screen readers).
    await page.goto("/lists/today");
    await expect(
      page
        .getByText(one(lo.sections.late), { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    const table = page.getByRole("table", { name: lo.title });
    await expect(table.getByRole("row").nth(1)).toContainText(TIMED);
    await expect(
      page
        .getByText(one(lo.readings.outOfRange), { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    const week = page.getByRole("table", { name: lo.readings.weekCaption });
    await expect(
      week.getByRole("row", { name: new RegExp(literal(TIMED)) }),
    ).toContainText("7 °C");
    await expectCleanPage(page);

    // The day before, from the week on top.
    const yesterday = israelDay(new Date(Date.now() - 24 * 60 * 60_000));
    await page
      .getByRole("group", { name: lo.pick })
      .getByRole("button", {
        name: new RegExp(`^.*\\b${Number(yesterday.slice(8))}\\b`),
      })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/lists/today\\?day=${yesterday}$`),
    );
    await expectCleanPage(page);
  } finally {
    await resumeDemoSchedules(paused);
    await removeDemoTemplates([TIMED]);
    await setDemoModuleSettings("scheduling", scheduling);
  }
});
