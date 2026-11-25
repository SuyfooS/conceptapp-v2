import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  addDemoShift,
  addOpenDemoEntry,
  cancelDemoShift,
  clearPunchState,
  clearTimeEntries,
  demoActivityActions,
  endViewSessions,
  removeDemoShift,
  setDemoRequirePunchCode,
  setDemoUnpaidBreaks,
  startDemoBreak,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";
import { expect, type Locator, type Page, test } from "./test";

// Seeded in supabase/seed.sql: the demo restaurant, its manager and a worker.
// The worker's hours are written straight to the database, as if they had
// clocked in; what's tested is what a manager sees and does about them.
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
// ConceptApp's platform admin, who views the business as its manager.
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const TZ = "Asia/Jerusalem";

const c = he.app.clock;
const t = c.team;
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
const overdueOne = "משמרת אחת צריכה תיקון";
/** A message with its {placeholders} filled in. */
const filled = (message: string, values: Record<string, string>) =>
  message.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
/** Text to find as it is, inside a pattern. */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A month before this one as the business counts months, `YYYY-MM`: where
 * `addDemoShift` puts a shift `monthsAgo` back.
 */
function monthAgo(months: number): string {
  const [year = 0, month = 1] = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
  })
    .format(new Date())
    .split("-")
    .map(Number);
  return new Date(Date.UTC(year, month - 1 - months, 1))
    .toISOString()
    .slice(0, 7);
}
const lastMonth = () => monthAgo(1);

/** An instant on the business's clock, as a time field takes it ("09:00"). */
const clockTime = (at: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);

/** Where `addDemoShift` starts a shift on `day`, `months` back: 06:00 UTC. */
const shiftStart = (day: number, months = 1) =>
  new Date(`${monthAgo(months)}-${String(day).padStart(2, "0")}T06:00:00Z`);

/**
 * The end of that shift, `minutes` long, on the business's clock, as a
 * pattern: what tells its row from another's, on every shape (its hours can
 * sit right after another time: "17:008:00").
 */
const endsAt = (day: number, minutes: number, months = 1) =>
  new RegExp(
    literal(
      clockTime(new Date(shiftStart(day, months).getTime() + minutes * 60_000)),
    ),
  );

/** The month's total on the person's hero (H:MM), whose caption starts "שעות, ". */
const heroTotal = (page: Page) =>
  page
    .getByRole("main")
    .locator("p")
    .filter({ hasText: t.caption.split("{")[0] ?? "" })
    .locator('span[dir="ltr"]')
    .first();

/**
 * What opens one of the person's shifts, by what its row says: the whole row
 * on phones and tablets, the button at its end on desktop ("תיקון", or
 * "החזרה" for a cancelled one).
 */
function shiftOpener(page: Page, has: RegExp, desktop: boolean): Locator {
  const main = page.getByRole("main");
  return desktop
    ? main.getByRole("row").filter({ hasText: has }).getByRole("button")
    : main
        .getByRole("button")
        .filter({ hasText: has })
        .filter({ visible: true });
}

/** A cancelled shift's line: who cancelled it, then (whenever it was) why. */
const cancelledLine = (note: string) =>
  new RegExp(
    `${literal(`${before(c.history.cancelledBy)}${MANAGER.name}`)}.*${literal(note)}`,
  );

/**
 * From the shift's row to its cancel: its fix, "ביטול המשמרת", and the step
 * that asks why, with `reason` written there (none: left empty).
 */
async function toCancelStep(
  page: Page,
  opener: Locator,
  reason: string | null,
): Promise<Locator> {
  await opener.click();
  await page
    .getByRole("dialog", { name: t.sheet.editTitle })
    .getByRole("button", { name: t.sheet.cancelShift })
    .click();
  const step = page.getByRole("dialog", { name: t.cancel.title });
  await expect(step.getByText(t.cancel.hint)).toBeVisible();
  if (reason !== null) await step.getByLabel(t.cancel.reason).fill(reason);
  return step;
}

/** The toast after a cancel, with its "ביטול". */
const cancelToast = (page: Page) =>
  page.getByRole("status").filter({ hasText: t.done.cancel });

/**
 * Has the open sheet's ✕ pressed the moment a refusal is drawn in it, in
 * the same turn: before the page read again after the write (`refresh()`)
 * can be drawn, whatever the network does. A quick hand on a slow phone
 * found the ✕ held until that page came back (23 November 2026). What the
 * refusal said, once it has pressed.
 */
async function closeOnRefusal(
  page: Page,
): Promise<() => Promise<string | null>> {
  await page.evaluate((close) => {
    const seen = window as unknown as { refused?: string | null };
    seen.refused = null;
    const watch = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const alert = node.matches('[role="alert"]')
            ? node
            : node.querySelector('[role="alert"]');
          const dialog = alert?.closest('[role="dialog"]');
          if (!alert || !dialog) continue;
          watch.disconnect();
          seen.refused = alert.textContent;
          for (const button of dialog.querySelectorAll("button")) {
            if (button.getAttribute("aria-label") === close) button.click();
          }
          return;
        }
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });
  }, t.sheet.close);
  return () =>
    page.evaluate(
      () => (window as unknown as { refused?: string | null }).refused ?? null,
    );
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

async function startClean() {
  await clearTimeEntries(NOA.e164);
  await setDemoRequirePunchCode(false);
  // Breaks paid, as the seed has them, whatever a spec here set.
  await setDemoUnpaidBreaks(false);
  await clearPunchState();
  // A spec that failed while viewing as the manager leaves no view open.
  await endViewSessions(ADMIN.e164);
}

test.beforeEach(startClean);
test.afterAll(startClean);

test("a worker has no team hours", async ({ page }) => {
  await signIn(page, NOA);
  await page.goto("/clock");
  await expect(page.getByRole("link", { name: t.title })).toHaveCount(0);
  await page.goto("/clock/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});

test("a manager sees who is at work and fixes a shift left open", async ({
  page,
}, testInfo) => {
  await addOpenDemoEntry(NOA.e164, 2);
  await signIn(page, MANAGER);

  // The clock leads to the team and says how many are at work.
  await page.goto("/clock");
  await page.getByRole("link", { name: t.title }).click();
  await expect(page).toHaveURL(/\/clock\/team$/);
  const atWork = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: t.atWork.title }) });
  await expect(atWork.getByText(NOA.name)).toBeVisible();
  await expect(page.getByText(overdueOne)).toHaveCount(0);
  await expectCleanPage(page);

  // Forgotten for over a day: Today and the team both say so, before anyone asks.
  await clearTimeEntries(NOA.e164);
  await addOpenDemoEntry(NOA.e164, 30);
  await page.goto("/home");
  await expect(
    page.getByRole("main").locator('a[href="/clock"]'),
  ).toContainText(overdueOne);
  await page.goto("/clock/team");
  await expect(page.getByText(overdueOne)).toBeVisible();
  // They need fixing; they aren't at work.
  await expect(atWork.getByText(NOA.name)).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-overdue.png"),
    fullPage: true,
  });

  // Fixing it: the shift opens with its times, and it needs an end.
  await page
    .getByRole("link", { name: new RegExp(before(t.overdue.row)) })
    .click();
  await expect(page).toHaveURL(/\/clock\/team\/[0-9a-f-]+\?month=/);
  const month = new URL(page.url()).searchParams.get("month");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expectCleanPage(page);
  const main = page.getByRole("main");
  await main
    .getByRole("button", { name: new RegExp(c.history.fix) })
    .filter({ visible: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel(t.sheet.in)).not.toHaveValue("");
  await expectCleanPage(page);

  // Changing a field keeps the sheet as it is: focus stays, and a picker stays open.
  await sheet.getByLabel(t.sheet.in).press("ArrowUp");
  await expect(sheet.getByLabel(t.sheet.in)).toBeFocused();
  await sheet.getByRole("button", { name: t.sheet.saveEdit }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.needsEnd);

  // An hour after it began, on the same date or the next.
  const start = await sheet.getByLabel(t.sheet.in).inputValue();
  const hour = (Number(start.slice(0, 2)) + 1) % 24;
  await sheet
    .getByLabel(t.sheet.out)
    .fill(`${String(hour).padStart(2, "0")}${start.slice(2)}`);

  // Without a reason nothing is saved: the field says why it's needed.
  const since = new Date();
  await sheet.getByRole("button", { name: t.sheet.saveEdit }).click();
  const reasonField = sheet.getByLabel(t.sheet.reason);
  await expect(reasonField).toBeFocused();
  await expect(reasonField).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.getByText(t.failure.reasonNeeded)).toBeVisible();
  await expect(sheet).toBeVisible();
  expect(await demoActivityActions("clock.correct", since)).toBe(0);
  await expectCleanPage(page);

  const reason = `שכחה לצאת ${Date.now()}`;
  await reasonField.fill(reason);
  await sheet.getByRole("button", { name: t.sheet.saveEdit }).click();
  await expect(sheet).toBeHidden();
  await expect(
    main.getByText("1:00", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);
  // The shift says who corrected it, and why.
  const corrected = filled(c.history.corrected, {
    name: MANAGER.name,
    note: reason,
  });
  await expect(
    main.getByText(corrected).filter({ visible: true }),
  ).toBeVisible();

  // Fixed, it leaves the list of what needs fixing.
  await page.goto("/clock/team");
  await expect(page.getByText(overdueOne)).toHaveCount(0);

  // The activity log keeps the reason.
  await page.goto("/manage/activity");
  await expect(
    page
      .getByText(
        filled(he.app.manage.activity.actions.clock.reason, { note: reason }),
      )
      .filter({ visible: true }),
  ).toBeVisible();

  // And the worker reads it in their own history.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(
    page.getByRole("main").getByText(corrected).filter({ visible: true }),
  ).toBeVisible();
  await expectCleanPage(page);
});

test("a manager adds a shift someone forgot, and hours can't be in the future", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await page.goto("/clock/team");
  const main = page.getByRole("main");
  await main
    .getByRole("link", { name: new RegExp(NOA.name) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expect(main.getByText(t.person.emptyTitle)).toBeVisible();

  // A month back, so the date is always in the past.
  const shown = page.url();
  await main
    .getByRole("link", { name: new RegExp(before(c.history.earlier)) })
    .click();
  await expect(page).not.toHaveURL(shown);
  const month = new URL(page.url()).searchParams.get("month");
  await page.getByRole("button", { name: t.person.add }).click();
  const sheet = page.getByRole("dialog");
  await expectCleanPage(page);

  // It starts in the month on screen, not today's.
  await expect(sheet.getByLabel(t.sheet.date)).toHaveValue(`${month}-01`);

  // Why it's added, kept with the shift.
  const reason = `שכחה להחתים ${Date.now()}`;
  await sheet.getByLabel(t.sheet.reason).fill(reason);

  // No end yet.
  await sheet.getByLabel(t.sheet.date).fill(`${month}-10`);
  await sheet.getByLabel(t.sheet.in).fill("08:00");
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.needsEnd);

  // The same time twice is a mistake, not a full day.
  await sheet.getByLabel(t.sheet.out).fill("08:00");
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.sameTime);

  // In the future.
  await sheet.getByLabel(t.sheet.date).fill("2999-01-01");
  await sheet.getByLabel(t.sheet.out).fill("10:30");
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet.getByRole("alert")).toHaveText(t.failure.future);

  await sheet.getByLabel(t.sheet.date).fill(`${month}-10`);
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet).toBeHidden();
  await expect(
    main.getByText("2:30", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);

  // The same hours again overlap what's there. A new sheet asks why again.
  await page.getByRole("button", { name: t.person.add }).click();
  await expect(sheet.getByLabel(t.sheet.reason)).toHaveValue("");
  await sheet.getByLabel(t.sheet.date).fill(`${month}-10`);
  await sheet.getByLabel(t.sheet.in).fill("09:00");
  await sheet.getByLabel(t.sheet.out).fill("10:00");
  await sheet.getByLabel(t.sheet.reason).fill(reason);
  // ✕ the moment it's refused closes the sheet, the page read again after
  // the refusal back or not.
  const refused = await closeOnRefusal(page);
  await sheet.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(sheet).toBeHidden();
  expect(await refused()).toBe(t.failure.times);

  // The worker sees it in their own history, as the manager's, with why.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(
    page
      .getByText(filled(c.history.added, { name: MANAGER.name, note: reason }))
      .filter({ visible: true }),
  ).toBeVisible();
});

// Cancelling a shift entered by mistake (the clock plan's PR4): never without
// why, at once rather than "are you sure", and it stays, marked with who,
// when and why, counting for nothing, as the worker reads it too.
test("a manager cancels a shift entered by mistake, with why, and it counts for nothing", async ({
  page,
}, testInfo) => {
  // Two people signed in, and the sheet checked at each step.
  test.setTimeout(60_000);
  const desktop = testInfo.project.name === "desktop";
  const month = lastMonth();
  // Eight hours on the 10th, by mistake, and two on the 12th.
  await addDemoShift(NOA.e164, { monthsAgo: 1, minutes: 480, unpaidBreak: 0 });
  await addDemoShift(NOA.e164, {
    monthsAgo: 1,
    minutes: 120,
    unpaidBreak: 0,
    day: 12,
  });
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}?month=${month}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  await expect(heroTotal(page)).toHaveText("10:00");

  // "ביטול המשמרת" is under fixing it; the page's main action stays adding.
  const since = new Date();
  const step = await toCancelStep(
    page,
    shiftOpener(page, endsAt(10, 480), desktop),
    null,
  );
  await expectCleanPage(page);

  // Without why, nothing goes: the field says so, and the log has no row.
  await step.getByRole("button", { name: t.cancel.save }).click();
  await expect(step.getByText(t.cancel.reasonNeeded)).toBeVisible();
  await expect(step.getByLabel(t.cancel.reason)).toBeFocused();
  expect(await demoActivityActions("clock.cancel", since)).toBe(0);

  const reason = `נרשמה בטעות ${Date.now()}`;
  await step.getByLabel(t.cancel.reason).fill(reason);
  await step.getByRole("button", { name: t.cancel.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    cancelToast(page).getByRole("button", { name: t.done.undo }),
  ).toBeVisible();

  // The month drops by its hours; the shift stays, saying who, when and why.
  await expect(heroTotal(page)).toHaveText("2:00");
  await expect(
    page
      .getByRole("main")
      .getByText(cancelledLine(reason))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(c.history.cancelled, { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(1);
  expect(await demoActivityActions("clock.cancel", since)).toBe(1);
  await expectCleanPage(page);

  // The worker reads it in her own history, counting for nothing.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(heroTotal(page)).toHaveText("2:00");
  await expect(
    page
      .getByRole("main")
      .getByText(cancelledLine(reason))
      .filter({ visible: true }),
  ).toBeVisible();
});

// The toast's "ביטול" brings it back; the right shift added over a cancelled
// one keeps it from coming back, in words.
test("the toast's undo brings a cancelled shift back, and the right one added over it keeps it cancelled", async ({
  page,
}, testInfo) => {
  // The sheet checked at each step, and a shift added on screen.
  test.setTimeout(60_000);
  const desktop = testInfo.project.name === "desktop";
  const month = lastMonth();
  const wrong = await addDemoShift(NOA.e164, {
    monthsAgo: 1,
    minutes: 480,
    unpaidBreak: 0,
  });
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}?month=${month}`);
  await expect(heroTotal(page)).toHaveText("8:00");

  const since = new Date();
  const reason = `נרשמה פעמיים ${Date.now()}`;
  const step = await toCancelStep(
    page,
    shiftOpener(page, endsAt(10, 480), desktop),
    reason,
  );
  await step.getByRole("button", { name: t.cancel.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  // Its "ביטול" says what it brings back, so it never sounds like a second
  // cancel right after "ביטול המשמרת".
  const undo = cancelToast(page).getByRole("button", { name: t.done.undo });
  await expect(undo).toBeFocused();
  await expect(undo).toHaveAccessibleName(t.done.undoCancel);
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: t.done.restore }),
  ).toBeVisible();
  await expect(heroTotal(page)).toHaveText("8:00");
  await expect(
    page.getByRole("main").getByText(cancelledLine(reason)),
  ).toHaveCount(0);
  // Both are in the log: the cancel, with why, and bringing it back.
  expect(await demoActivityActions("clock.cancel", since)).toBe(1);
  expect(await demoActivityActions("clock.restore", since)).toBe(1);

  // Cancelled again, and the right hours added over the same morning.
  const again = `נרשמה בטעות ${Date.now()}`;
  await cancelDemoShift(wrong, again);
  await page.reload();
  await expect(heroTotal(page)).toHaveText("0:00");
  const start = shiftStart(10);
  await page.getByRole("button", { name: t.person.add }).click();
  const add = page.getByRole("dialog", { name: t.sheet.addTitle });
  await add.getByLabel(t.sheet.date).fill(`${month}-10`);
  await add.getByLabel(t.sheet.in).fill(clockTime(start));
  await add
    .getByLabel(t.sheet.out)
    .fill(clockTime(new Date(start.getTime() + 7 * 3_600_000)));
  await add.getByLabel(t.sheet.reason).fill(`השעות הנכונות ${Date.now()}`);
  await add.getByRole("button", { name: t.sheet.saveAdd }).click();
  await expect(add).toBeHidden();
  await expect(heroTotal(page)).toHaveText("7:00");

  // The cancelled one opens from its row, and can't come back over them:
  // ✕ the moment it's refused closes it, the page read again after the
  // refusal back or not.
  const cancelledRow = shiftOpener(page, new RegExp(literal(again)), desktop);
  await cancelledRow.click();
  const cancelled = page.getByRole("dialog", { name: t.cancelled.title });
  await expect(cancelled.getByText(cancelledLine(again))).toBeVisible();
  const refused = await closeOnRefusal(page);
  await cancelled.getByRole("button", { name: t.cancelled.restore }).click();
  await expect(cancelled).toBeHidden();
  expect(await refused()).toBe(t.failure.overlap);

  // Opened again, it says why, read as the screen shows it.
  await cancelledRow.click();
  await cancelled.getByRole("button", { name: t.cancelled.restore }).click();
  await expect(cancelled.getByRole("alert")).toHaveText(t.failure.overlap);
  await expectCleanPage(page);
  await cancelled.getByRole("button", { name: t.sheet.close }).click();
  await expect(cancelled).toBeHidden();
  await expect(heroTotal(page)).toHaveText("7:00");
});

// A shift left open for over a day, cancelled from the overdue card's way to
// it: the cancel ends it, so it needs no fixing and the person can clock in
// again; bringing it back opens it again.
test("an overdue shift cancelled from the overdue card ends, and bringing it back opens it again", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const desktop = testInfo.project.name === "desktop";
  await addOpenDemoEntry(NOA.e164, 30);
  await signIn(page, MANAGER);
  await page.goto("/clock/team");
  await page
    .getByRole("link", { name: new RegExp(before(t.overdue.row)) })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOA.name);
  const personPage = page.url();

  const reason = `נכנסה בטעות ${Date.now()}`;
  const step = await toCancelStep(
    page,
    shiftOpener(page, new RegExp(c.history.needsFix), desktop),
    reason,
  );
  // Still open: the cancel ends it too, and says so first.
  await expect(step.getByText(t.cancel.openHint)).toBeVisible();
  await step.getByRole("button", { name: t.cancel.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page
      .getByRole("main")
      .getByText(cancelledLine(reason))
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(c.history.needsFix)
      .filter({ visible: true }),
  ).toHaveCount(0);

  // Nothing needs fixing any more, and Noa isn't at work: she can clock in.
  await page.goto("/clock/team");
  await expect(page.getByText(overdueOne)).toHaveCount(0);
  const noa = await secondPage(browser, testInfo);
  try {
    await signIn(noa, NOA);
    await noa.goto("/clock");
    await expect(
      noa.getByRole("heading", { level: 1, name: c.title.off }),
    ).toBeVisible();
  } finally {
    await noa.context().close();
  }

  // Brought back, it is open again, and needs fixing again.
  await page.goto(personPage);
  await shiftOpener(page, new RegExp(literal(reason)), desktop).click();
  const cancelled = page.getByRole("dialog", { name: t.cancelled.title });
  await expect(cancelled.getByText(t.cancelled.openHint)).toBeVisible();
  await expectCleanPage(page);
  await cancelled.getByRole("button", { name: t.cancelled.restore }).click();
  await expect(cancelled).toBeHidden();
  await expect(
    page
      .getByRole("main")
      .getByText(c.history.needsFix)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.goto("/clock/team");
  await expect(page.getByText(overdueOne)).toBeVisible();
});

// Default 5 of the clock plan: a manager who isn't an owner doesn't cancel
// their own shift (the rule of confirming one's own hours), and is told so.
test("a manager's own shift is cancelled only by an owner, in words", async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  // Two months back: last month has her seeded hours (supabase/seed.sql).
  const month = monthAgo(2);
  const own = await addDemoShift(MANAGER.e164, {
    monthsAgo: 2,
    minutes: 480,
    unpaidBreak: 0,
  });
  try {
    await signIn(page, MANAGER);
    await page.goto(`/clock/team/${MANAGER.id}?month=${month}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      MANAGER.name,
    );
    const since = new Date();
    const step = await toCancelStep(
      page,
      shiftOpener(page, endsAt(10, 480, 2), desktop),
      `המשמרת שלי ${Date.now()}`,
    );
    await step.getByRole("button", { name: t.cancel.save }).click();
    await expect(step.getByRole("alert")).toHaveText(t.failure.ownShift);
    await expect(step).toBeVisible();
    expect(await demoActivityActions("clock.cancel", since)).toBe(0);
    await expectCleanPage(page);
  } finally {
    await removeDemoShift(own);
  }
});

// Viewing as the manager, ConceptApp's team reads a cancelled shift and can
// press nothing: no fix, no cancel, no way back.
test("viewing as a manager, a cancelled shift reads and nothing opens", async ({
  page,
}) => {
  // A code by SMS, which may wait out the resend wait of another spec's.
  test.slow();
  const month = lastMonth();
  const wrong = await addDemoShift(NOA.e164, {
    monthsAgo: 1,
    minutes: 480,
    unpaidBreak: 0,
  });
  await addDemoShift(NOA.e164, {
    monthsAgo: 1,
    minutes: 120,
    unpaidBreak: 0,
    day: 12,
  });
  const reason = `נרשמה בטעות ${Date.now()}`;
  await cancelDemoShift(wrong, reason);

  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", {
      name: he.admin.setup.viewAs.as.manager,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto(`/clock/team/${NOA.id}?month=${month}`);
  const main = page.getByRole("main");
  await expect(main.getByText(t.failure.viewOnly)).toBeVisible();
  await expect(
    main.getByText(cancelledLine(reason)).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: t.person.add })).toBeDisabled();
  // Neither the cancelled shift nor the live one opens, on any shape.
  await expect(
    main.getByRole("button").filter({ hasText: reason }),
  ).toHaveCount(0);
  await expect(
    main.getByRole("button").filter({ hasText: endsAt(12, 120) }),
  ).toHaveCount(0);
  await expect(
    main.getByRole("button", {
      name: new RegExp(
        `${before(c.history.restoreShift)}|${before(c.history.fixShift)}`,
      ),
    }),
  ).toHaveCount(0);
  await expectCleanPage(page);
});

// Editing breaks (the clock plan's PR5): one at a time, from fixing the
// shift, each with why; the shift then reads as corrected, the log keeps each
// change, and the month's total follows a break that comes off the hours.

/** A time `minutes` after the 10th's shift (`addDemoShift`) began, by the business's clock. */
const intoShift = (minutes: number) =>
  clockTime(new Date(shiftStart(10).getTime() + minutes * 60_000));

/** The shift's breaks, under its times in the sheet that fixes it. */
const breakRows = (sheet: Locator) =>
  sheet.getByRole("group", { name: t.breaks.title });

/** A break's row by its times, `from` and `to` minutes into the shift. */
const breakRow = (sheet: Locator, from: number, to: number) =>
  breakRows(sheet).getByRole("button", {
    name: new RegExp(literal(`${intoShift(from)}–${intoShift(to)}`)),
  });

/** A line of the log about a break of Noa's: how it starts, before the day. */
const breakLogLine = (change: "add" | "change" | "remove" | "restore") =>
  heT("app.manage.activity.actions.clock.breakEdit", {
    change,
    person: NOA.name,
    day: "DAY",
  }).split("DAY")[0] ?? "";

test("a manager fixes a shift's breaks: changes one's end, adds one forgotten, and the total follows", async ({
  page,
}, testInfo) => {
  // The sheet checked at each step, and four writes tried.
  test.setTimeout(90_000);
  const desktop = testInfo.project.name === "desktop";
  const month = lastMonth();
  // Eight hours on the 10th, with an unpaid half hour ten minutes in; a new
  // break comes off the hours too.
  await addDemoShift(NOA.e164, { monthsAgo: 1, minutes: 480, unpaidBreak: 30 });
  await setDemoUnpaidBreaks(true);
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}?month=${month}`);
  await expect(heroTotal(page)).toHaveText("7:30");
  const main = page.getByRole("main");

  // Under the shift's times: its break, unpaid, and the way to add one.
  await shiftOpener(page, endsAt(10, 480), desktop).click();
  const edit = page.getByRole("dialog", { name: t.sheet.editTitle });
  await expect(breakRow(edit, 10, 40)).toContainText(t.breaks.unpaid);
  await expect(
    breakRows(edit).getByRole("button", { name: t.breaks.add }),
  ).toBeVisible();
  await expectCleanPage(page);

  // Its end, a quarter of an hour in: never without why.
  const since = new Date();
  await breakRow(edit, 10, 40).click();
  const step = page.getByRole("dialog", { name: t.breakStep.editTitle });
  await expect(step.getByLabel(t.breakStep.start)).toHaveValue(intoShift(10));
  await expect(step.getByLabel(t.breakStep.end)).toHaveValue(intoShift(40));
  await expect(step.getByText(t.breakStep.unpaid)).toBeVisible();
  await expectCleanPage(page);
  await step.getByLabel(t.breakStep.end).fill(intoShift(25));
  await step.getByRole("button", { name: t.breakStep.save }).click();
  await expect(step.getByLabel(t.sheet.reason)).toBeFocused();
  await expect(step.getByText(t.failure.reasonNeeded)).toBeVisible();
  expect(await demoActivityActions("clock.break_edit", since)).toBe(0);
  const shorter = `חזרה מוקדם מההפסקה ${Date.now()}`;
  await step.getByLabel(t.sheet.reason).fill(shorter);
  await step.getByRole("button", { name: t.breakStep.save }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: t.done.changeBreak }),
  ).toBeVisible();
  // A quarter of an hour less off her hours; the shift reads as corrected.
  await expect(heroTotal(page)).toHaveText("7:45");
  await expect(
    main
      .getByText(
        filled(c.history.corrected, { name: MANAGER.name, note: shorter }),
      )
      .filter({ visible: true }),
  ).toBeVisible();
  expect(await demoActivityActions("clock.break_edit", since)).toBe(1);

  // A break she forgot to press, added. Outside the shift, and over the one
  // there, it is refused in words, with nothing written.
  await shiftOpener(page, endsAt(10, 480), desktop).click();
  await expect(breakRow(edit, 10, 25)).toBeVisible();
  await breakRows(edit).getByRole("button", { name: t.breaks.add }).click();
  const add = page.getByRole("dialog", { name: t.breakStep.addTitle });
  await expect(add.getByText(t.breakStep.newUnpaid)).toBeVisible();
  const forgot = `שכחה לרשום הפסקה ${Date.now()}`;
  await add.getByLabel(t.sheet.reason).fill(forgot);
  const refused = new Date();
  // An hour before she came in: only the day after, when she wasn't there.
  await add.getByLabel(t.breakStep.start).fill(intoShift(-60));
  await add.getByLabel(t.breakStep.end).fill(intoShift(-30));
  await add.getByRole("button", { name: t.breakStep.saveAdd }).click();
  await expect(add.getByRole("alert")).toHaveText(t.failure.breakOutside);
  await add.getByLabel(t.breakStep.start).fill(intoShift(15));
  await add.getByLabel(t.breakStep.end).fill(intoShift(20));
  await add.getByRole("button", { name: t.breakStep.saveAdd }).click();
  await expect(add.getByRole("alert")).toHaveText(t.failure.breakOverlap);
  expect(await demoActivityActions("clock.break_edit", refused)).toBe(0);
  await expectCleanPage(page);

  // Four hours in, half an hour: it comes off her hours, as the setting says.
  await add.getByLabel(t.breakStep.start).fill(intoShift(240));
  await add.getByLabel(t.breakStep.end).fill(intoShift(270));
  await add.getByRole("button", { name: t.breakStep.saveAdd }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: t.done.addBreak }),
  ).toBeVisible();
  await expect(heroTotal(page)).toHaveText("7:15");
  expect(await demoActivityActions("clock.break_edit", since)).toBe(2);
  await shiftOpener(page, endsAt(10, 480), desktop).click();
  await expect(breakRow(edit, 240, 270)).toContainText(t.breaks.unpaid);
  await edit.getByRole("button", { name: t.sheet.close }).click();
  await expect(edit).toBeHidden();

  // The log keeps both, each with why, and leads to her hours.
  await page.goto("/manage/activity");
  for (const [change, note] of [
    ["change", shorter],
    ["add", forgot],
  ] as const) {
    await expect(
      page
        .getByRole("main")
        .getByText(breakLogLine(change))
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByText(
          filled(he.app.manage.activity.actions.clock.reason, { note }),
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  }
  await expectCleanPage(page);

  // And Noa reads the fix in her own history, with why.
  await page.context().clearCookies();
  await signIn(page, NOA);
  await page.goto(`/clock/history?month=${month}`);
  await expect(heroTotal(page)).toHaveText("7:15");
  await expect(
    page
      .getByRole("main")
      .getByText(
        filled(c.history.corrected, { name: MANAGER.name, note: forgot }),
      )
      .filter({ visible: true }),
  ).toBeVisible();
});

test("a break pressed by mistake is removed at once, and the toast's undo brings it back", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const desktop = testInfo.project.name === "desktop";
  const month = lastMonth();
  await addDemoShift(NOA.e164, { monthsAgo: 1, minutes: 480, unpaidBreak: 30 });
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}?month=${month}`);
  await expect(heroTotal(page)).toHaveText("7:30");

  await shiftOpener(page, endsAt(10, 480), desktop).click();
  const edit = page.getByRole("dialog", { name: t.sheet.editTitle });
  await breakRow(edit, 10, 40).click();
  const step = page.getByRole("dialog", { name: t.breakStep.editTitle });

  // Without why, it stays.
  const since = new Date();
  await step.getByRole("button", { name: t.breakStep.remove }).click();
  await expect(step.getByText(t.failure.reasonNeeded)).toBeVisible();
  await expect(step.getByLabel(t.sheet.reason)).toBeFocused();
  expect(await demoActivityActions("clock.break_edit", since)).toBe(0);

  await step.getByLabel(t.sheet.reason).fill(`נלחצה בטעות ${Date.now()}`);
  await step.getByRole("button", { name: t.breakStep.remove }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const undo = page
    .getByRole("status")
    .filter({ hasText: t.done.removeBreak })
    .getByRole("button", { name: t.done.undo });
  await expect(undo).toBeVisible();
  await expect(undo).toHaveAccessibleName(t.done.undoRemoveBreak);
  // Removed, it no longer comes off her hours.
  await expect(heroTotal(page)).toHaveText("8:00");
  await undo.click();
  await expect(
    page.getByRole("status").filter({ hasText: t.done.restoreBreak }),
  ).toBeVisible();
  await expect(heroTotal(page)).toHaveText("7:30");
  // Both are in the log: the removal, with why, and bringing it back.
  expect(await demoActivityActions("clock.break_edit", since)).toBe(2);
  await expectCleanPage(page);

  // Back in the shift as it was.
  await shiftOpener(page, endsAt(10, 480), desktop).click();
  await expect(breakRow(edit, 10, 40)).toBeVisible();
  await expectCleanPage(page);
});

test("a break still running is shown, and only adding one opens", async ({
  page,
}, testInfo) => {
  const desktop = testInfo.project.name === "desktop";
  // At work for two hours, on a break for the last ten minutes.
  const clockIn = new Date(Date.now() - 2 * 3_600_000);
  await addOpenDemoEntry(NOA.e164, 2);
  await startDemoBreak(NOA.e164, 10);
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: TZ })
    .format(clockIn)
    .slice(0, 7);
  await signIn(page, MANAGER);
  await page.goto(`/clock/team/${NOA.id}?month=${month}`);
  await shiftOpener(page, new RegExp(literal(c.history.now)), desktop).click();
  const edit = page.getByRole("dialog", { name: t.sheet.editTitle });
  await expect(breakRows(edit).getByText(t.breaks.running)).toBeVisible();
  // It ends with her, a clock-out or a fix of the shift's end: no row to press.
  await expect(breakRows(edit).getByRole("button")).toHaveCount(1);
  await expect(breakRows(edit).getByRole("button")).toHaveAccessibleName(
    t.breaks.add,
  );
  await expectCleanPage(page);
});
