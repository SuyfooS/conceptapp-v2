import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { addYears } from "../packages/domain/youth";
import {
  forgetShopWages,
  restoreShopPayrollDetails,
  restoreShopPeriods,
  seededPayMonth,
  setShopClockSettings,
  setShopPayRole,
  shopActivityActions,
  shopActivityDetails,
  shopClockSettings,
  shopFirstOfMonth,
  shopPayRoles,
  shopPayrollDetails,
  shopPayViewsToday,
  shopPeriods,
  shopWageToday,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";

// Hours for payroll (payroll P3), hourly wages (P4), details for payroll (P5)
// and the hours engine on screen (P7), in the demo shop as supabase/seed.sql
// starts it: last month's hours for its staff, their wages from the first of
// last month and their details (private.seed_demo_pay), its accountant Galit,
// its managers holding pay access, and its amounts on (`payEstimate`, as in
// every demo business). Every visit names the seeded month: the screens open
// on last month only until the 10th.
const e = he.auth.enter;
const p = he.app.pay;
const a = he.app.manage.access;
const GALIT = { e164: "+972500000014" };
const TAMAR = {
  id: "00000000-0000-4000-a000-000000000010",
  name: "תמר אברהם",
};
const OMER = "עומר הדגמה";
const OMER_ID = "00000000-0000-4000-a000-000000000008";
// Another of the shop's workers, signed in by their number (not at the door).
const ITAI = {
  id: "00000000-0000-4000-a000-000000000011",
  local: "050-000-0011",
  e164: "+972500000011",
};
// The shop's minor, still without a payroll number, and its worker who rests
// on Friday (supabase/seed.sql's "details").
const LIYA = { id: "00000000-0000-4000-a000-000000000013", name: "ליה כץ" };
const RONI = { id: "00000000-0000-4000-a000-000000000012", name: "רוני שלום" };

/** `YYYY-MM-01` plus whole months, as `YYYY-MM-DD` on day `day`. */
const monthsFrom = (first: string, months: number, day = 1) => {
  const [year = 0, month = 1] = first.split("-").map(Number);
  const at = new Date(Date.UTC(year, month - 1 + months, day));
  return at.toISOString().slice(0, 10);
};

/** A day's month and year as the screens write how long someone is a minor: "5.2027". */
const monthYear = (day: string) => {
  const [year, month] = day.split("-").map(Number);
  return `${month}.${year}`;
};

/** A rich sentence as its text reads on screen, its `<ltr>` spans dropped. */
const plain = (key: Parameters<typeof heT.markup>[0], values = {}) =>
  heT.markup(key, { ltr: (chunks: string) => chunks, ...values });

/** A day as the screens write it in full: `2026-11-01` as "1.11.2026". */
const fullDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return `${date}.${month}.${year}`;
};

const notFound = (page: Page) =>
  page.getByRole("heading", { level: 1, name: he.app.notFound.title });
const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/** In through the door, as one of the demo's people. */
async function enterAs(page: Page, key: keyof typeof e.people) {
  await page.goto("/enter");
  await page
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/** Names of the main navigation items visible at this width, in order. */
async function navItems(page: Page): Promise<string[]> {
  const nav = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  await expect(nav).toHaveCount(1);
  return (await nav.locator("[data-nav-label]").allInnerTexts()).map((s) =>
    s.trim(),
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

// The shop as it starts, whatever a test left.
test.beforeEach(async () => {
  await setShopPayRole("manager", true);
  await setShopPayRole("worker", false);
});
test.afterAll(async () => {
  await setShopPayRole("manager", true);
  await setShopPayRole("worker", false);
});

test("the shop's accountant has the month's hours, and nothing to punch", async ({
  page,
}, testInfo) => {
  const month = await seededPayMonth();
  await enterAs(page, "accountant");

  // Two tabs: Home and the hours for payroll.
  expect(await navItems(page)).toEqual([
    he.app.nav.home,
    he.modules.time_clock.outsideNav,
  ]);
  await expect(
    page.getByRole("link", { name: he.app.home.accountant.open }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("accountant-home.png"),
    fullPage: true,
  });

  // The seeded month, everyone with hours, and what to check first.
  await page.goto(`/clock/pay?month=${month}`);
  await expect(
    page.getByRole("heading", { level: 1, name: p.title }),
  ).toBeVisible();
  await expect(shown(page, TAMAR.name)).toBeVisible();
  await expect(
    shown(page, heT("app.pay.beforePayroll.corrected", { count: 1 })),
  ).toBeVisible();
  await expect(
    shown(page, heT("app.pay.beforePayroll.waiting", { count: 1 })),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("pay-month.png"),
    fullPage: true,
  });

  // Opening the hours is noted once a day, after the page is on screen.
  await expect.poll(() => shopPayViewsToday(GALIT.e164)).toBe(1);
  await page.reload();
  await expect(shown(page, TAMAR.name)).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await shopPayViewsToday(GALIT.e164)).toBe(1);

  // Each person's wage beside their hours: the shop's Roni got a raise in
  // the month, from 36.00 to 38.00.
  await expect(shown(page, "36.00 ₪")).toBeVisible();

  // One person's month: the correction says who, why, and what it was.
  await page.goto(`/clock/pay/${TAMAR.id}?month=${month}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TAMAR.name);
  await expect(
    shown(
      page,
      heT("app.pay.day.corrected", { name: OMER, note: "שכחה לצאת" }),
    ),
  ).toBeVisible();
  // Her wage and its history, for the accountant too.
  await expect(
    page
      .getByRole("heading", { name: p.wage.history.title })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(shown(page, "38.00 ₪")).toBeVisible();
  await expectCleanPage(page);

  // Nothing of the staff's opens for them.
  for (const path of [
    "/schedule",
    "/clock",
    "/clock/team",
    "/team",
    "/lists",
  ]) {
    await page.goto(path);
    await expect(notFound(page), path).toBeVisible();
  }
});

test("the owner switches managers' pay access off, and undo brings it back", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const since = new Date();
  await enterAs(page, "shopOwner");
  await page.goto("/manage");
  await page.getByRole("link", { name: new RegExp(a.title) }).click();
  await expect(page).toHaveURL(/\/manage\/access$/);
  const managers = page.getByRole("switch", { name: a.roles.manager });
  await expect(managers).toHaveAttribute("aria-checked", "true");

  await managers.click();
  await expect(managers).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => shopPayRoles()).toEqual([]);
  const undo = page.getByRole("status").filter({
    hasText: heT("app.manage.access.done.roleOff", { role: "manager" }),
  });
  await expect(undo).toBeVisible();
  await expectCleanPage(page);

  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(managers).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => shopPayRoles()).toEqual(["manager"]);

  // The log keeps both.
  expect(await shopActivityActions("permission.revoke", since)).toBe(1);
  expect(await shopActivityActions("permission.grant", since)).toBe(1);
  await page.goto("/manage/activity");
  await expect(
    shown(
      page,
      heT("app.manage.activity.actions.permission.revoke", {
        perm: "payroll",
        from: heT("app.manage.activity.actions.permission.from.role", {
          role: "manager",
        }),
      }),
    ),
  ).toBeVisible();
});

test("who sees pay is the owner's screen, and reads at every size", async ({
  page,
}) => {
  await enterAs(page, "shopOwner");
  await page.goto("/manage/access");
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
  await expect(
    shown(page, heT("app.manage.access.count", { count: 3 })),
  ).toBeVisible();
  await expect(shown(page, a.personal.empty)).toBeVisible();
  await expectCleanPage(page);
});

test("a manager reaches the hours for payroll only while managers have pay access", async ({
  page,
}) => {
  const month = await seededPayMonth();
  await enterAs(page, "shopManager");
  // On: the team's hours lead there.
  await page.goto("/clock/team");
  await page
    .getByRole("link", { name: new RegExp(p.clockRow.title) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: p.title }),
  ).toBeVisible();
  await expectCleanPage(page);

  // Off: no way there, and the address is not found. Hours are still theirs
  // to fix on the team's hours.
  await setShopPayRole("manager", false);
  await page.goto(`/clock/pay?month=${month}`);
  await expect(notFound(page)).toBeVisible();
  await page.goto("/clock/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.clock.team.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(p.clockRow.title) }),
  ).toHaveCount(0);
  // Who sees pay is never theirs to change.
  await page.goto("/manage/access");
  await expect(notFound(page)).toBeVisible();
});

test("a pay holder sets a wage from a day, warned under the minimum, and the worker sees their own", async ({
  page,
}, testInfo) => {
  const month = await seededPayMonth();
  const first = await shopFirstOfMonth();
  const since = new Date(Date.now() - 1000);
  try {
    await enterAs(page, "shopManager");
    await page.goto(`/clock/pay/${TAMAR.id}?month=${month}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      TAMAR.name,
    );
    await expect(shown(page, "38.00 ₪")).toBeVisible();
    await expectCleanPage(page);

    await page
      .getByRole("button", { name: p.wage.change })
      .filter({ visible: true })
      .click();
    const sheet = page.getByRole("dialog", {
      name: heT("app.pay.wage.sheet.title", { name: TAMAR.name }),
    });
    await expect(sheet).toBeVisible();
    const amount = sheet.getByLabel(p.wage.sheet.amount);

    // Under the minimum: said in words, and nothing stops the save.
    await amount.fill("30");
    const warning = plain("app.pay.wage.warning", {
      band: "adult",
      from: "1.4.2026",
      minimum: "35.40 ₪",
    });
    await expect(sheet.getByText(warning)).toBeVisible();
    await amount.fill("39.50");
    await expect(sheet.getByText(warning)).toHaveCount(0);
    await expect(sheet.getByLabel(p.wage.sheet.from)).toHaveValue(first);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("wage-sheet.png"),
      fullPage: true,
    });

    // The button says what it does: from the first of this month.
    await sheet
      .getByRole("button", {
        name: heT("app.pay.wage.sheet.save", {
          date: fullDay(first).split(".").slice(0, 2).join("."),
        }),
      })
      .click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("status").filter({
        hasText: heT("app.pay.wage.done", { date: fullDay(first) }),
      }),
    ).toBeVisible();
    await expect
      .poll(() => shopWageToday(TAMAR.id))
      .toEqual({
        agorot: 3950,
        from: first,
      });
    expect(await shopActivityActions("wage.set", since)).toBe(1);
    // The one before stays in the history.
    await expect(shown(page, "39.50 ₪")).toBeVisible();
    await expect(
      shown(
        page,
        plain("app.pay.wage.history.row", {
          amount: "38.00 ₪",
          date: fullDay(`${month}-01`),
        }),
      ),
    ).toBeVisible();
    await expectCleanPage(page);

    // The log says it, for those who see pay.
    await page.goto("/manage/activity");
    await expect(
      shown(
        page,
        plain("app.manage.activity.actions.wage.set", {
          person: TAMAR.name,
          amount: "39.50 ₪",
          date: fullDay(first),
        }),
      ),
    ).toBeVisible();

    // Nobody sets their own.
    await page.goto(`/clock/pay/${OMER_ID}?month=${month}`);
    await expect(shown(page, p.wage.own)).toBeVisible();
    await expect(page.getByRole("button", { name: p.wage.change })).toHaveCount(
      0,
    );

    // The worker sees their own wage on the clock, and the line about it.
    await page.context().clearCookies();
    await enterAs(page, "shopWorker");
    await page.goto("/clock");
    await expect(
      shown(page, plain("app.clock.ownWage.title", { amount: "39.50 ₪" })),
    ).toBeVisible();
    await expectCleanPage(page);
    await page.goto("/notifications");
    await expect(
      shown(page, he.app.notifications.kinds.pay.wage_set.title),
    ).toBeVisible();

    // Another worker sees theirs, and nothing of hers.
    await page.context().clearCookies();
    await signIn(page, ITAI);
    await page.goto("/clock");
    await expect(
      shown(page, plain("app.clock.ownWage.title", { amount: "38.00 ₪" })),
    ).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("39.50");
  } finally {
    await forgetShopWages(TAMAR.id, since);
  }
});

test("the month says whose shifts have no wage, and lists only them", async ({
  page,
}) => {
  // The restaurant's Yoav has hours and no wage (supabase/seed.sql).
  const month = await seededPayMonth("restaurant");
  await enterAs(page, "owner");
  await page.goto(`/clock/pay?month=${month}`);
  await expect(
    shown(page, heT("app.pay.beforePayroll.noWage", { count: 1 })),
  ).toBeVisible();
  await page.getByRole("link", { name: p.beforePayroll.showNoWage }).click();
  await expect(page).toHaveURL(/show=noWage/);
  await expect(shown(page, p.filter.noWage)).toBeVisible();
  await expect(shown(page, "יואב לוי")).toBeVisible();
  await expect(
    page.getByText("נועה כהן").filter({ visible: true }),
  ).toHaveCount(0);
  // On a tablet his line and the panel beside the list both say it.
  await expect(
    page
      .getByText(p.wage.missing, { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expectCleanPage(page);

  await page.getByRole("link", { name: p.filter.all }).click();
  await expect(shown(page, "נועה כהן")).toBeVisible();
});

test("the details for payroll read at every size: a start to check, a holder's start, a rest day and a minor", async ({
  page,
}, testInfo) => {
  const month = await seededPayMonth();
  const first = await shopFirstOfMonth();
  await enterAs(page, "accountant");

  // The minor is marked in the month's list, the row's one badge.
  await page.goto(`/clock/pay?month=${month}`);
  await expect(
    page.getByText(p.minor, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expectCleanPage(page);

  // Itai's start was set by the owner (the 10th of three months ago): no
  // note to check it, and his number.
  await page.goto(`/clock/pay/${ITAI.id}?month=${month}`);
  await expect(
    page
      .getByRole("heading", { name: p.details.title })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("103", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(shown(page, fullDay(monthsFrom(first, -3, 10)))).toBeVisible();
  await expect(
    page.getByText(p.details.joined).filter({ visible: true }),
  ).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("pay-details.png"),
    fullPage: true,
  });

  // Tamar's start was copied from joining the app: the card says to check it.
  await page.goto(`/clock/pay/${TAMAR.id}?month=${month}`);
  await expect(shown(page, p.details.joined)).toBeVisible();

  // Roni rests on Friday.
  await page.goto(`/clock/pay/${RONI.id}?month=${month}`);
  await expect(
    page
      .getByText(p.details.restDay["5"], { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("the accountant enters a payroll number and a minor's birth date, kept only as the day she turns 18", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const month = await seededPayMonth();
  const first = await shopFirstOfMonth();
  const before = await shopPayrollDetails(LIYA.id);
  const since = new Date(Date.now() - 1000);
  try {
    await enterAs(page, "accountant");
    await page.goto(`/clock/pay?month=${month}`);
    await expect(
      shown(page, heT("app.pay.beforePayroll.noNumber", { count: 1 })),
    ).toBeVisible();

    await page.goto(`/clock/pay/${LIYA.id}?month=${month}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(LIYA.name);
    await expect(
      page
        .getByText(p.details.numberMissing, { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    // 17 through the seeded month, a minor until the first of the month six
    // months from now.
    await expect(
      shown(
        page,
        plain("app.pay.details.youth", {
          until: monthYear(monthsFrom(first, 6)),
        }),
      ),
    ).toBeVisible();

    await page
      .getByRole("button", { name: p.details.edit })
      .filter({ visible: true })
      .click();
    const sheet = page.getByRole("dialog", {
      name: heT("app.pay.details.sheet.title", { name: LIYA.name }),
    });
    await expect(sheet).toBeVisible();
    await sheet.getByLabel(p.details.sheet.number).fill("105");
    // A minor whatever day this runs: 17 years before the 15th of the month
    // after next, so she turns 18 more than a year from now.
    const born = addYears(monthsFrom(first, 2, 15), -17);
    const turns18 = addYears(born, 18);
    const [bornYear = "", bornMonth = "", bornDay = ""] = born.split("-");
    const birth = sheet.getByRole("group", { name: p.details.sheet.birth });
    await birth
      .getByLabel(p.dateParts.day, { exact: true })
      .fill(String(Number(bornDay)));
    await birth
      .getByLabel(p.dateParts.month, { exact: true })
      .fill(String(Number(bornMonth)));
    await birth.getByLabel(p.dateParts.year, { exact: true }).fill(bornYear);
    // Before saving, it says what the date makes of her age.
    await expect(
      sheet.getByText(
        plain("app.pay.details.sheet.birthYouth", {
          until: monthYear(turns18),
        }),
      ),
    ).toBeVisible();
    await expect(sheet.getByText(p.details.sheet.birthHint)).toBeVisible();
    // The sheet hides the page from screen readers, heading and all: axe alone.
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("details-sheet.png"),
      fullPage: true,
    });

    await sheet.getByRole("button", { name: p.details.sheet.save }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: p.details.done }),
    ).toBeVisible();

    // Only the day she turns 18 is kept, and the log names the fields, never
    // a value.
    await expect
      .poll(() => shopPayrollDetails(LIYA.id))
      .toMatchObject({ payroll_number: "105", youth_until: turns18 });
    const logged = await shopActivityDetails("payroll.details", since);
    expect(logged.map((row) => row.fields)).toEqual([
      ["payroll_number", "youth_until"],
    ]);
    expect(JSON.stringify(logged)).not.toMatch(
      new RegExp(
        `${bornYear}|${turns18.slice(0, 4)}|${bornMonth}-${bornDay}|"105"`,
      ),
    );
    await expect(
      shown(
        page,
        plain("app.pay.details.youth", { until: monthYear(turns18) }),
      ),
    ).toBeVisible();
    await expectCleanPage(page);

    // Nobody is missing a number now.
    await page.goto(`/clock/pay?month=${month}`);
    await expect(
      page.getByText(heT("app.pay.beforePayroll.noNumber", { count: 1 })),
    ).toHaveCount(0);

    // The owner reads it in the log, by field.
    await page.context().clearCookies();
    await enterAs(page, "shopOwner");
    await page.goto("/manage/activity");
    await expect(
      shown(
        page,
        heT("app.manage.activity.actions.payroll.details", {
          person: LIYA.name,
          fields: "מספר העובד וגיל הנוער",
        }),
      ),
    ).toBeVisible();
  } finally {
    await restoreShopPayrollDetails(LIYA.id, before);
  }
});

test("a start a holder sets makes the period theirs, and no wage starts before it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const month = await seededPayMonth();
  const before = await shopPeriods(RONI.id);
  const since = new Date(Date.now() - 1000);
  try {
    await enterAs(page, "shopOwner");
    await page.goto(`/clock/pay/${RONI.id}?month=${month}`);
    await page
      .getByRole("button", { name: new RegExp(p.details.joined) })
      .filter({ visible: true })
      .click();
    const sheet = page.getByRole("dialog", {
      name: heT("app.pay.details.period.title", { name: RONI.name }),
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByText(heT("app.pay.details.period.joined", { form: "x" })),
    ).toBeVisible();

    // He started on the 2nd of the seeded month.
    const [year = "", monthOf = ""] = month.split("-");
    const from = sheet.getByRole("group", { name: p.details.period.from });
    await from.getByLabel(p.dateParts.day, { exact: true }).fill("2");
    await from
      .getByLabel(p.dateParts.month, { exact: true })
      .fill(String(Number(monthOf)));
    await from.getByLabel(p.dateParts.year, { exact: true }).fill(year);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await sheet.getByRole("button", { name: p.details.period.save }).click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: p.details.period.done }),
    ).toBeVisible();

    await expect
      .poll(async () =>
        (await shopPeriods(RONI.id)).map((row) => [
          row.started_on,
          row.ended_on,
          row.source,
        ]),
      )
      .toEqual([[`${month}-02`, null, "set"]]);
    const logged = await shopActivityDetails("payroll.period", since);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      added: false,
      confirmed: true,
      fields: ["started_on"],
    });
    expect(JSON.stringify(logged)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    await expect(
      page.getByText(p.details.joined).filter({ visible: true }),
    ).toHaveCount(0);

    // A wage from before that day is refused in the sheet already.
    await page
      .getByRole("button", { name: p.wage.change })
      .filter({ visible: true })
      .click();
    const wageSheet = page.getByRole("dialog", {
      name: heT("app.pay.wage.sheet.title", { name: RONI.name }),
    });
    await wageSheet.getByLabel(p.wage.sheet.amount).fill("38");
    await wageSheet.getByLabel(p.wage.sheet.from).fill(`${month}-01`);
    await wageSheet
      .getByRole("button", {
        name: heT("app.pay.wage.sheet.save", {
          date: `1.${Number(monthOf)}`,
        }),
      })
      .click();
    await expect(
      wageSheet.getByText(p.wage.errors.from.beforeStart),
    ).toBeVisible();
    expect(await shopActivityActions("wage.set", since)).toBe(0);
  } finally {
    await restoreShopPeriods(RONI.id, before);
  }
});

// Payroll P7: the hours engine on screen.

/** The last day of a month (`YYYY-MM`) on a weekday (0 is Sunday), as the screens write it: "27.10". */
function lastWeekdayOf(month: string, weekday: number): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const day = new Date(Date.UTC(year, index, 0));
  while (day.getUTCDay() !== weekday) day.setUTCDate(day.getUTCDate() - 1);
  return `${day.getUTCDate()}.${index}`;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A sentence with one value left open, as a pattern for whatever hours or
 * amount stand in its place: the demo's times move with the seeded month.
 */
function sentenceWith(
  key: Parameters<typeof heT.markup>[0],
  values: Record<string, string>,
  open: string,
  shape = "[\\d,]+\\.\\d{2}",
): RegExp {
  const text = plain(key, { ...values, [open]: "\u0001" });
  return new RegExp(escaped(text).replace("\u0001", shape));
}

/** The month's or a person's estimate before tax, whatever its amount. */
const ESTIMATE = sentenceWith(
  "app.pay.estimate.total",
  {},
  "amount",
  "[\\d,]+\\.\\d{2} ₪",
);
/** The heading of a worker's own month in shekels, whichever month. */
const OWN_TITLE = new RegExp(
  `^${escaped(he.app.clock.ownPay.title.split("{")[0] ?? "")}`,
);
const YOAV_ID = "00000000-0000-4000-a000-000000000004";

test("the accountant reads the month by rate, its estimate before tax and what to check in words", async ({
  page,
}, testInfo) => {
  const month = await seededPayMonth();
  // Home shows the month payroll is done for now, which from the 11th is
  // this month, with no hours yet: its twin with the estimate is in
  // design.spec.ts. The seeded month is named here.
  await enterAs(page, "accountant");
  await page.goto(`/clock/pay?month=${month}`);
  // Every amount sits under one line, and the month's sum is in the hero.
  await expect(shown(page, p.estimate.under)).toBeVisible();
  await expect(shown(page, ESTIMATE)).toBeVisible();
  // Liya (17, at school) worked past 20:00 on the month's last Tuesday: in
  // words, in the card before payroll.
  const night = plain("modules.time_clock.payroll.flags.minorNight", {
    hours: "2.50",
    from: "20:00",
    to: "08:00",
    date: lastWeekdayOf(month, 2),
  });
  await expect(shown(page, night)).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("pay-month-rates.png"),
    fullPage: true,
  });

  // The desktop table has a column for every rate, the rest ones named for
  // any rest day (Roni rests on Friday), and the estimate.
  if (testInfo.project.name === "desktop") {
    for (const name of [
      heT("app.pay.rateColumns.regular"),
      heT("app.pay.rateColumns.ot125"),
      heT("app.pay.rateColumns.ot150"),
      heT("app.pay.rateColumns.rest150", { rest: "other" }),
      heT("app.pay.rateColumns.rest175", { rest: "other" }),
      heT("app.pay.rateColumns.rest200", { rest: "other" }),
      p.columns.estimate,
    ]) {
      await expect(
        page.getByRole("columnheader", { name, exact: true }),
      ).toBeVisible();
    }
  }

  // Tamar's late Friday runs past the day's 7 hours into Shabbat: 175%.
  await page.goto(`/clock/pay/${TAMAR.id}?month=${month}`);
  await expect(
    shown(
      page,
      sentenceWith("app.pay.rates.rest175", { rest: "saturday" }, "hours"),
    ),
  ).toBeVisible();
  await expect(
    page.getByText(p.estimate.label, { exact: true }).filter({ visible: true }),
  ).toHaveCount(1);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("pay-person-rates.png"),
    fullPage: true,
  });

  // Itai's Saturday night is rest at 150%.
  await page.goto(`/clock/pay/${ITAI.id}?month=${month}`);
  await expect(
    shown(
      page,
      sentenceWith("app.pay.rates.rest150", { rest: "saturday" }, "hours"),
    ),
  ).toBeVisible();

  // Liya's page says it too, and how it is all worked out, in plain words.
  await page.goto(`/clock/pay/${LIYA.id}?month=${month}`);
  await expect(shown(page, night)).toBeVisible();
  await page
    .getByRole("button", { name: p.method.open })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: p.method.title });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(p.method.readings)).toBeVisible();
  // The sheet hides the page from screen readers, heading and all: axe alone.
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});

test("a night past its 7 hours is overtime at 125%, and without a wage there is no estimate", async ({
  page,
}, testInfo) => {
  // The restaurant's Yoav: one night 22:00–06:30 in the month, and no wage
  // (supabase/seed.sql). The restaurant's week isn't set, so each Thursday
  // is the five-day week's short day too, and its 8 paid hours add 24 minutes
  // at 125%: the month's 125% is more than the night's, and moves with the
  // seeded month, so its hours are a pattern.
  const month = await seededPayMonth("restaurant");
  await enterAs(page, "owner");
  await page.goto(`/clock/pay/${YOAV_ID}?month=${month}`);
  await expect(
    shown(page, sentenceWith("app.pay.rates.ot125", {}, "hours")),
  ).toBeVisible();
  await expect(shown(page, p.estimate.none)).toBeVisible();
  if (testInfo.project.name === "desktop") {
    // The days table: every rate, and the kind of day.
    await expect(
      page.getByRole("columnheader", {
        name: heT("app.pay.rateColumns.ot125"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: p.tags.night, exact: true }),
    ).toBeVisible();
  } else {
    // Under the shifts: a split at 125% (the night's, or a Thursday's), and
    // the night's kind.
    const part = sentenceWith(
      "app.pay.day.part",
      { rate: heT("app.pay.rateColumns.ot125") },
      "hours",
    );
    await expect(
      shown(page, new RegExp(`${escaped(p.day.ofWhich)} ${part.source}`)),
    ).toBeVisible();
    await expect(shown(page, p.tags.night)).toBeVisible();
  }
  await expectCleanPage(page);
});

test("a worker sees an estimate of their own month and nobody else's, and none while the business shows none", async ({
  page,
}) => {
  const month = await seededPayMonth();
  const settings = await shopClockSettings();
  const ownCard = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: OWN_TITLE }) })
    .filter({ visible: true });
  try {
    await enterAs(page, "shopWorker");
    // This month, on the clock: the card, with or without hours yet.
    await page.goto("/clock");
    await expect(ownCard).toHaveCount(1);
    await expectCleanPage(page);

    // The seeded month, on her history: before tax, with her late Friday.
    await page.goto(`/clock/history?month=${month}`);
    await expect(
      ownCard.getByText(he.app.clock.ownPay.label, { exact: true }),
    ).toBeVisible();
    await expect(
      ownCard.getByText(
        sentenceWith("app.pay.rates.rest175", { rest: "saturday" }, "hours"),
      ),
    ).toBeVisible();
    const amount = (
      await ownCard
        .getByText(/^[\d,]+\.\d{2} ₪$/)
        .first()
        .innerText()
    ).trim();
    // How it is worked out, without what waits for an accountant.
    await ownCard.getByRole("button", { name: p.method.open }).click();
    const sheet = page.getByRole("dialog", { name: p.method.title });
    await expect(sheet.getByText(p.method.excluded)).toBeVisible();
    await expect(sheet.getByText(p.method.readings)).toHaveCount(0);
    await sheet.getByRole("button", { name: p.method.close }).click();
    await expect(sheet).toBeHidden();
    await expectCleanPage(page);

    // Another worker sees theirs, and nothing of hers.
    await page.context().clearCookies();
    await signIn(page, ITAI);
    await page.goto(`/clock/history?month=${month}`);
    await expect(ownCard).toHaveCount(1);
    await expect(page.getByRole("main")).not.toContainText(amount);

    // The owner hides the workers' estimates: none on the clock.
    await setShopClockSettings({ workersSeeEstimate: false });
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: he.app.clock.history.title }),
    ).toBeVisible();
    await expect(ownCard).toHaveCount(0);

    // The team turns the business's amounts off: none for anyone, and the
    // pay holders keep the hours by rate.
    await setShopClockSettings({
      workersSeeEstimate: true,
      payEstimate: false,
    });
    await page.reload();
    await expect(ownCard).toHaveCount(0);
    await page.context().clearCookies();
    await enterAs(page, "accountant");
    await page.goto(`/clock/pay?month=${month}`);
    await expect(shown(page, p.estimate.off)).toBeVisible();
    await expect(page.getByText(ESTIMATE)).toHaveCount(0);
    await expectCleanPage(page);
    await page.goto(`/clock/pay/${TAMAR.id}?month=${month}`);
    await expect(
      shown(
        page,
        sentenceWith("app.pay.rates.rest175", { rest: "saturday" }, "hours"),
      ),
    ).toBeVisible();
    await expect(shown(page, p.estimate.offShort)).toBeVisible();
    await expect(page.getByText(p.estimate.label, { exact: true })).toHaveCount(
      0,
    );
    await expectCleanPage(page);
  } finally {
    await setShopClockSettings(settings, true);
  }
});
