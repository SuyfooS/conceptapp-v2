import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  addDemoShift,
  cancelDemoShift,
  clearTimeEntries,
  demoLastFileShifts,
  removeDemoBreak,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The reads of a cancelled shift (the clock plan's PR3), before any screen
// can cancel one. Noa has two shifts last month in the demo restaurant (seeded
// in supabase/seed.sql), and one is cancelled through the database function
// the person's page will call, as its manager Shiran, so the log has its row.
// It then counts nowhere (Noa's month, the team's, the pay screens, the file
// for payroll) and reads as cancelled, with who, when and why, wherever her
// shifts are listed, and the log says so. Then an unpaid break pressed by
// mistake is removed the same way: it no longer comes off her hours.
const TZ = "Asia/Jerusalem";
const MANAGER = {
  name: "שירן הדגמה",
  local: "050-000-0002",
  e164: "+972500000002",
};
// The owner holds pay, for the pay screens and the file.
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const NOA = {
  id: "00000000-0000-4000-a000-000000000003",
  name: "נועה כהן",
  local: "050-000-0003",
  e164: "+972500000003",
};

const c = he.app.clock;
const log = he.app.manage.activity.actions.clock;

/** A message with its {placeholders} filled in. */
const filled = (message: string, values: Record<string, string>) =>
  message.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);

/** A rich sentence as its text reads on screen, its `<ltr>` spans dropped. */
const plain = (key: Parameters<typeof heT.markup>[0], values = {}) =>
  heT.markup(key, { ltr: (chunks: string) => chunks, ...values });

/** Last month as the business counts months: where `monthsAgo: 1` puts a shift. */
function lastMonth(): string {
  const [year = 0, month = 1] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

/**
 * When a shift was cancelled, as its line says it: the time on the business's
 * clock, with its day ("17.11, 09:40") when that isn't the shift's.
 */
function cancelTime(at: Date, shiftDate: string): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  if (date === shiftDate) return time;
  const [, month, day] = date.split("-").map(Number);
  return `${day}.${month}, ${time}`;
}

const shown = (page: Page, text: string | RegExp) =>
  page.getByRole("main").getByText(text).filter({ visible: true }).first();

/** The month's total on the hero (H:MM), whose caption starts "שעות, ". */
const heroTotal = (page: Page) =>
  page
    .getByRole("main")
    .locator("p")
    .filter({ hasText: c.team.caption.split("{")[0] ?? "" })
    .locator('span[dir="ltr"]')
    .first();

async function heroMinutes(page: Page): Promise<number> {
  const [hours = 0, minutes = 0] = ((await heroTotal(page).textContent()) ?? "")
    .trim()
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

const hoursOf = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/** A number standing on its own, not part of a bigger one ("2:00", not "12:00"). */
const alone = (text: string) =>
  new RegExp(`(^|[^\\d.,:])${text.replace(/[.]/g, "\\.")}(?![\\d])`);

/**
 * Noa's rows with these hours on a screen that lists everyone: a link on
 * phones and tablets, a table row on desktop.
 */
const noaRows = (page: Page, hours: string) =>
  page
    .getByRole("main")
    .locator("a, tr")
    .filter({ hasText: NOA.name })
    .filter({ hasText: alone(hours) })
    .filter({ visible: true });

/** How many shifts the month's file for payroll lists: taken, as the screen's link does, and read from its log row. */
async function fileShifts(page: Page, month: string): Promise<number> {
  const response = await page.request.get(`/clock/pay/export?month=${month}`);
  expect(response.status()).toBe(200);
  const shifts = await demoLastFileShifts(month);
  if (shifts === null) throw new Error(`no file for ${month} was logged`);
  return shifts;
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

test.beforeEach(async () => {
  await clearTimeEntries(NOA.e164);
});
test.afterAll(async () => {
  await clearTimeEntries(NOA.e164);
});

test("a cancelled shift counts nowhere, and reads as cancelled with who, when and why", async ({
  page,
  browser,
}, testInfo) => {
  // Three people signed in, seven screens checked and two files taken.
  test.setTimeout(120_000);
  const month = lastMonth();
  // 8 hours on the 10th, and 2:30 on the 12th with half an hour unpaid.
  const wrong = await addDemoShift(NOA.e164, {
    monthsAgo: 1,
    minutes: 480,
    unpaidBreak: 0,
  });
  await addDemoShift(NOA.e164, {
    monthsAgo: 1,
    minutes: 150,
    unpaidBreak: 30,
    day: 12,
  });
  const reason = `נרשמה בטעות ${Date.now()}`;
  const breakReason = `ההפסקה נלחצה בטעות ${Date.now()}`;
  const corrected = filled(c.history.corrected, {
    name: MANAGER.name,
    note: breakReason,
  });
  // Who cancelled it, when and why, once it is.
  let line = "";

  await signIn(page, MANAGER);
  const owner = await secondPage(browser, testInfo);
  try {
    await signIn(owner, OWNER);

    // Before: the team's month with Noa's ten hours, and the month's file.
    await page.goto(`/clock/team?month=${month}`);
    await expect(noaRows(page, "10:00").first()).toBeVisible();
    const teamBefore = await heroMinutes(page);
    const fileBefore = await fileShifts(owner, month);

    const at = await cancelDemoShift(wrong, reason);
    line = plain("app.clock.history.cancelledBy", {
      name: MANAGER.name,
      time: cancelTime(at, `${month}-10`),
      note: reason,
    });

    // Her page: the month counts the shift left, and the cancelled one says
    // who, when and why, instead of its hours. (Pressing it, to bring it
    // back, is clock-team.spec.ts's.)
    await page.goto(`/clock/team/${NOA.id}?month=${month}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
    await expect(heroTotal(page)).toHaveText("2:00");
    await expect(
      shown(page, heT("app.clock.team.caption", { count: 1 })),
    ).toBeVisible();
    await expect(shown(page, line)).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByText(c.history.cancelled, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("person-cancelled.png"),
      fullPage: true,
    });

    // The team's month: eight hours less, Noa's row too.
    await page.goto(`/clock/team?month=${month}`);
    await expect(noaRows(page, "2:00").first()).toBeVisible();
    await expect(heroTotal(page)).toHaveText(hoursOf(teamBefore - 480));
    await expectCleanPage(page);

    // The log: who cancelled whose shift, why, and the way to her hours.
    await page.goto("/manage/activity");
    await expect(
      shown(page, `${log.cancel.split("{person}")[0]}${NOA.name}`),
    ).toBeVisible();
    await expect(
      shown(page, filled(log.reason, { note: reason })),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .locator(`a[href="/clock/team/${NOA.id}?month=${month}"]`)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expectCleanPage(page);

    // Pay: her month is the shift left, the cancelled one listed apart; the
    // month's list says the same, and the file lists one shift fewer.
    await owner.goto(`/clock/pay/${NOA.id}?month=${month}`);
    await expect(
      shown(owner, plain("app.pay.hours", { hours: "2.00" })),
    ).toBeVisible();
    await expect(
      owner
        .getByRole("main")
        .getByText(plain("app.pay.hours", { hours: "10.00" }))
        .filter({ visible: true }),
    ).toHaveCount(0);
    await expect(
      shown(owner, heT("app.pay.person.caption", { days: 1, shifts: 1 })),
    ).toBeVisible();
    await expect(
      owner
        .getByRole("heading", { name: he.app.pay.person.cancelledTitle })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(shown(owner, line)).toBeVisible();
    await expectCleanPage(owner);

    await owner.goto(`/clock/pay?month=${month}`);
    if (testInfo.project.name === "desktop") {
      // A table: her hours are a cell of their own.
      const row = owner
        .getByRole("main")
        .getByRole("row")
        .filter({ hasText: NOA.name })
        .filter({ visible: true });
      await expect(
        row.getByRole("cell", { name: "2.00", exact: true }).first(),
      ).toBeVisible();
      await expect(
        row.getByRole("cell", { name: "10.00", exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(
        shown(owner, plain("app.pay.row", { hours: "2.00", days: 1 })),
      ).toBeVisible();
    }
    expect(await fileShifts(owner, month)).toBe(fileBefore - 1);

    // A break pressed by mistake, removed: it no longer comes off her hours,
    // and the shift reads as corrected, with why.
    await removeDemoBreak(NOA.e164, breakReason);
    await page.goto(`/clock/team/${NOA.id}?month=${month}`);
    await expect(heroTotal(page)).toHaveText("2:30");
    await expect(shown(page, corrected)).toBeVisible();
    await page.goto("/manage/activity");
    await expect(
      shown(
        page,
        heT("app.manage.activity.actions.clock.breakEdit", {
          change: "remove",
          person: NOA.name,
          day: "DAY",
        }).split("DAY")[0] ?? "",
      ),
    ).toBeVisible();
    await expect(
      shown(page, filled(log.reason, { note: breakReason })),
    ).toBeVisible();
    await expectCleanPage(page);
  } finally {
    await owner.context().close();
  }

  // And Noa reads both in her own history, the cancelled shift counting for
  // nothing.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(heroTotal(page)).toHaveText("2:30");
  await expect(
    shown(page, heT("app.clock.history.total", { count: 1 })),
  ).toBeVisible();
  await expect(shown(page, line)).toBeVisible();
  await expect(shown(page, corrected)).toBeVisible();
  await expectCleanPage(page);
});
