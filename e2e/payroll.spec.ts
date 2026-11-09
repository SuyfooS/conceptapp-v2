import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  seededPayMonth,
  setShopPayRole,
  shopActivityActions,
  shopPayRoles,
  shopPayViewsToday,
} from "./db";
import { heT } from "./t";

// Hours for payroll (payroll P3), in the demo shop as supabase/seed.sql
// starts it: last month's hours for its staff (private.seed_demo_pay), its
// accountant Galit, and its managers holding pay access. Every visit names
// the seeded month: the screens open on last month only until the 10th.
const e = he.auth.enter;
const p = he.app.pay;
const a = he.app.manage.access;
const GALIT = { e164: "+972500000014" };
const TAMAR = {
  id: "00000000-0000-4000-a000-000000000010",
  name: "תמר אברהם",
};
const OMER = "עומר הדגמה";

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

  // One person's month: the correction says who, why, and what it was.
  await page.goto(`/clock/pay/${TAMAR.id}?month=${month}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(TAMAR.name);
  await expect(
    shown(
      page,
      heT("app.pay.day.corrected", { name: OMER, note: "שכחה לצאת" }),
    ),
  ).toBeVisible();
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
