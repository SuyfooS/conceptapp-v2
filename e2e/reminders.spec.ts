import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { dateIn, weekdayOf } from "../packages/domain/availability";
import { WEEKDAY_KEYS } from "../packages/domain/availability-form";
import { timeIn } from "../packages/domain/shabbat";
import {
  addTestDevice,
  closeRemindersBusiness,
  endQuietNow,
  openReminderEntry,
  openRemindersBusiness,
  quietUntilSoon,
  REMINDERS_PEOPLE,
  reminderLines,
  remindersSettings,
  runReminders,
  sendRemindersAvailability,
  setRemindersSettings,
} from "./db";
import { MockPushService } from "./mock-push";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// The reminders (notifications part 4): the database writes them once a
// minute (`private.run_reminders`), each once, in a real business of the
// spec's own, since a demo business gets none. The minute job is off in the
// tests (supabase/seed.sql), so each test runs the reminders itself, at the
// moment it chooses, in this business alone, and moves a push's time with
// SQL where it waits for quiet hours. Every test writes, so all run once, on
// the desktop, each with the business made afresh and gone after. The push
// needs the generated keys CI sets (VAPID_*, CRON_SECRET, PUSH_TEST_ORIGIN),
// and that test waits for them; the rest runs without.

const ORIGIN = process.env.PUSH_TEST_ORIGIN ?? "";
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const OWNER = REMINDERS_PEOPLE.owner;
const MISSING = REMINDERS_PEOPLE.missing;
const SENT = REMINDERS_PEOPLE.sent;

const n = he.app.notifications;
const c = he.app.clock;
const settings = he.modules.notifications.settings;
const TIME_ZONE = "Asia/Jerusalem";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** What the Home tab adds to its name when something needs the person. */
const NEEDS = (he.ui.appShell.needsAction.split("}")[1] ?? "").trim();
/** A sentence with `<ltr>` in it, as the screen reads it out. */
const plain = (chunks: string) => chunks;
/** The same, as a phone gets it: times inside Unicode isolates. */
const isolated = (chunks: string) => `⁦${chunks}⁩`;
/** A weekday's name, 0 = Sunday. */
const dayName = (day: number) =>
  he.app.availability.weekdays[WEEKDAY_KEYS[day] ?? "sun"];
/** A moment's weekday and time on Israel's clock, as the lines say them. */
const dayAndTime = (at: Date) => ({
  day: dayName(weekdayOf(dateIn(at, TIME_ZONE))),
  time: timeIn(at, TIME_ZONE),
});

/** A line of the inbox, by what it says. */
const line = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(literal(title)) });

const homeTab = (page: Page) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    .getByRole("link", { name: new RegExp(`^${literal(he.app.nav.home)}`) });

/** The clock's circle, by the last words of its name. */
const circle = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`(^|\\s)${label}$`) });

async function expectCleanPage(page: Page) {
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((node) => `${v.id}: ${node.target.join(" ")}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("availability reminders reach who hasn't sent it, and the count reaches the owner", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "writes: once, on the desktop",
  );
  test.setTimeout(120_000);
  const week = await openRemindersBusiness();
  const owner = await secondPage(browser, testInfo);
  try {
    const due = week.dueAt.getTime();
    const dueWords = {
      day: dayName(week.dueDay),
      time: week.dueTime,
    };

    // A day before it is due, and not a minute sooner: to the worker who
    // hasn't sent it, not the one who has, and never the owner. Once.
    expect(await runReminders(new Date(due - 24 * HOUR - MINUTE))).toBe(0);
    expect(await runReminders(new Date(due - 24 * HOUR))).toBe(1);
    expect(await runReminders(new Date(due - HOUR))).toBe(0);
    expect(await reminderLines(MISSING.id, "availability.due")).toHaveLength(1);
    expect(await reminderLines(SENT.id, "availability.due")).toHaveLength(0);
    expect(await reminderLines(OWNER.id, "availability.due")).toHaveLength(0);

    await signIn(page, MISSING);
    // Something to do, shown before it is asked for.
    await expect(homeTab(page)).toHaveAccessibleName(new RegExp(NEEDS));
    await page.goto("/notifications");
    const reminder = line(
      page,
      heT("app.notifications.kinds.availability.due.title", {
        date: week.date,
      }),
    );
    await expect(reminder).toBeVisible();
    await expect(reminder).toContainText(
      heT.markup("app.notifications.kinds.availability.due.note", {
        ltr: plain,
        ...dueWords,
      }),
    );
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("reminders-availability.png"),
      fullPage: true,
    });
    // It leads to the availability to send.
    await reminder.click();
    await expect(page).toHaveURL(/\/schedule\/availability$/);

    // When it is due, the owner hears how many haven't sent it, not who.
    expect(await runReminders(new Date(due))).toBe(1);
    const [count] = await reminderLines(OWNER.id, "availability.missing");
    expect(count?.params).toMatchObject({
      startsOn: week.startsOn,
      missing: 1,
    });
    expect(JSON.stringify(count?.params)).not.toContain(MISSING.id);
    await signIn(owner, OWNER);
    await owner.goto("/notifications");
    const missing = line(
      owner,
      heT("app.notifications.kinds.availability.missing.title", {
        count: 1,
        date: week.date,
      }),
    );
    await expect(missing).toBeVisible();
    await expect(missing).toContainText(
      heT.markup("app.notifications.kinds.availability.missing.note", {
        ltr: plain,
        ...dueWords,
      }),
    );
    // From the app itself, in the desktop table's "who": nobody on the team
    // sent it.
    await expect(
      owner
        .getByRole("row")
        .filter({ visible: true })
        .filter({ has: missing })
        .getByRole("rowheader"),
    ).toHaveText(n.who.app);
    // A count, never who: the worker's name is nowhere on the owner's inbox.
    await expect(
      owner.getByRole("main").filter({ visible: true }),
    ).not.toContainText(MISSING.name);
    await expectCleanPage(owner);
    await missing.click();
    await expect(owner).toHaveURL(/\/schedule\/availability\/team$/);

    // Sending it settles the worker's own line, and the owner's once nobody
    // is missing.
    await sendRemindersAvailability(MISSING.id);
    await expect
      .poll(
        async () =>
          (await reminderLines(MISSING.id, "availability.due"))[0]?.settled,
      )
      .toBe(true);
    expect(
      (await reminderLines(OWNER.id, "availability.missing"))[0],
    ).toMatchObject({ settled: true });
    await page.goto("/notifications");
    await expect(
      line(
        page,
        heT("app.notifications.kinds.availability.due.settledTitle", {
          date: week.date,
        }),
      ),
    ).toBeVisible();
  } finally {
    await owner.context().close();
    await closeRemindersBusiness();
  }
});

test("a reminder to clock out comes once, and clocking out settles it", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "writes: once, on the desktop",
  );
  test.setTimeout(90_000);
  await openRemindersBusiness();
  try {
    // Only the clock: next week's availability can be due at the real now.
    await setRemindersSettings({ availabilityReminderHours: 0 });
    // Clocked in 13 hours ago, with no shift that day: the reminder comes 12
    // hours after clocking in, and not a minute before.
    const since = await openReminderEntry(SENT.id, 13);
    expect(
      await runReminders(new Date(since.getTime() + 12 * HOUR - MINUTE)),
    ).toBe(0);
    expect(await runReminders()).toBe(1);
    expect(await runReminders()).toBe(0);
    const [reminder] = await reminderLines(SENT.id, "clock.open");
    expect(reminder?.params).toMatchObject({ shiftEnd: null });

    await signIn(page, SENT);
    await page.goto("/notifications");
    const open = line(page, n.kinds.clock.open.title);
    await expect(open).toBeVisible();
    await expect(open).toContainText(
      heT.markup("app.notifications.kinds.clock.open.noShift", {
        ltr: plain,
        ...dayAndTime(since),
      }),
    );
    await page.screenshot({
      path: testInfo.outputPath("reminders-clock.png"),
      fullPage: true,
    });

    // It leads to the clock, and clocking out there settles it.
    await open.click();
    await expect(page).toHaveURL(/\/clock$/);
    await expect(
      page.getByRole("heading", { level: 1, name: c.title.working }),
    ).toBeVisible();
    await circle(page, c.circle.out).click();
    await expect(
      page.getByRole("heading", { level: 1, name: c.title.off }),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await reminderLines(SENT.id, "clock.open"))[0]?.settled,
      )
      .toBe(true);
    await page.goto("/notifications");
    await expect(line(page, n.kinds.clock.open.settledTitle)).toBeVisible();
    // Never again for the same entry.
    expect(await runReminders()).toBe(0);
  } finally {
    await closeRemindersBusiness();
  }
});

test("a reminder's push waits for quiet hours, then reaches the phone", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "writes: once, on the desktop",
  );
  test.skip(
    !ORIGIN || !PUBLIC_KEY || !CRON_SECRET,
    "needs VAPID keys, CRON_SECRET and PUSH_TEST_ORIGIN (CI sets them)",
  );
  test.setTimeout(90_000);
  const mock = new MockPushService(ORIGIN, PUBLIC_KEY);
  await mock.start();
  await openRemindersBusiness();
  try {
    await setRemindersSettings({ availabilityReminderHours: 0 });
    // A device of the owner's, and quiet hours until half an hour from now,
    // both before the reminder comes.
    const endpoint = await addTestDevice(OWNER.id, ORIGIN);
    await quietUntilSoon(OWNER.id, 30);
    const mine = () =>
      mock.seen.filter((push) => push.path === new URL(endpoint).pathname);
    const send = () =>
      request.post("/cron/notifications", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });

    const since = await openReminderEntry(OWNER.id, 13);
    expect(await runReminders()).toBe(1);
    const [held] = await reminderLines(OWNER.id, "clock.open");
    expect(held).toMatchObject({ state: "queued", later: true });
    if (!held) throw new Error("No reminder for the owner");

    // The minute job's call while it is quiet sends nothing to the device.
    expect((await send()).status()).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(mine()).toHaveLength(0);

    // Quiet hours end, and the push is due now (its time moved back, as the
    // minute job would find it): the next call sends it, once.
    await endQuietNow(OWNER.id, held.id);
    expect((await send()).status()).toBe(202);
    await expect.poll(() => mine().length, { timeout: 15_000 }).toBe(1);
    expect(mine()[0]?.problems).toEqual([]);
    await expect
      .poll(async () => (await reminderLines(OWNER.id, "clock.open"))[0]?.state)
      .toBe("sent");

    // What the phone shows for it, asked as the service worker asks: the
    // reminder's own words, opening the line.
    await signIn(page, OWNER);
    const shown = await page.evaluate(async () => {
      const response = await fetch("/push/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: null }),
      });
      return (await response.json()) as {
        notifications: { title: string; body?: string; url: string }[];
      };
    });
    expect(shown.notifications).toHaveLength(1);
    expect(shown.notifications[0]).toMatchObject({
      title: n.kinds.clock.open.title,
      body: heT.markup("app.notifications.kinds.clock.open.noShift", {
        ltr: isolated,
        ...dayAndTime(since),
      }),
      url: `/notifications/open/${held.id}`,
    });
  } finally {
    await mock.stop();
    await closeRemindersBusiness();
  }
});

test("an owner chooses when the reminders come, and with none, none come", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "writes: once, on the desktop",
  );
  test.setTimeout(90_000);
  const week = await openRemindersBusiness();
  try {
    await signIn(page, OWNER);
    await page.goto("/manage");
    await page
      .getByRole("main")
      .getByRole("link", {
        name: new RegExp(`^${literal(he.modules.notifications.name)}`),
      })
      .click();
    await expect(page).toHaveURL(/\/manage\/notifications$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: he.modules.notifications.name,
      }),
    ).toBeVisible();

    // As every business starts: a day before it is due, an hour after the
    // shift. Each says what it does.
    const hours = settings.availabilityReminderHours;
    const minutes = settings.clockOutReminderMinutes;
    const availability = page.getByRole("button", {
      name: `${hours.label}: ${hours.options[24]}`,
    });
    const clockOut = page.getByRole("button", {
      name: `${minutes.label}: ${minutes.options[60]}`,
    });
    await expect(availability).toBeVisible();
    await expect(clockOut).toBeVisible();
    for (const hint of [hours.hint, minutes.hint]) {
      await expect(
        page.getByText(hint).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("manage-notifications.png"),
      fullPage: true,
    });

    // None of either, each saved at once.
    await availability.click();
    await page.getByRole("menuitemradio", { name: hours.options[0] }).click();
    await expect
      .poll(async () => (await remindersSettings()).availabilityReminderHours)
      .toBe(0);
    await clockOut.click();
    await page.getByRole("menuitemradio", { name: minutes.options[0] }).click();
    await expect
      .poll(async () => (await remindersSettings()).clockOutReminderMinutes)
      .toBe(0);

    // In their time, nothing comes: no availability reminder, no count, no
    // reminder to clock out.
    const due = week.dueAt.getTime();
    expect(await runReminders(new Date(due - HOUR))).toBe(0);
    expect(await runReminders(new Date(due))).toBe(0);
    await openReminderEntry(SENT.id, 13);
    expect(await runReminders()).toBe(0);
    expect(await reminderLines(MISSING.id, "availability.due")).toHaveLength(0);
    expect(await reminderLines(OWNER.id, "availability.missing")).toHaveLength(
      0,
    );
    expect(await reminderLines(SENT.id, "clock.open")).toHaveLength(0);
  } finally {
    await closeRemindersBusiness();
  }
});
