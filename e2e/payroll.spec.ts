import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  forgetShopWages,
  seededPayMonth,
  setShopPayRole,
  shopActivityActions,
  shopFirstOfMonth,
  shopPayRoles,
  shopPayViewsToday,
  shopWageToday,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";

// Hours for payroll (payroll P3) and hourly wages (P4), in the demo shop as
// supabase/seed.sql starts it: last month's hours for its staff and their
// wages from the first of last month (private.seed_demo_pay), its accountant
// Galit, and its managers holding pay access. Every visit names the seeded
// month: the screens open on last month only until the 10th.
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
const ITAI = { local: "050-000-0011", e164: "+972500000011" };

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
const shown = (page: Page, text: string) =>
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
