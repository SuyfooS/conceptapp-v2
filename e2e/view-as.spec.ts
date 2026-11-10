import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { endViewSessions, invitesBySlug, viewAudit } from "./db";
import { signIn } from "./session";

// The seeded platform admin (supabase/seed.sql) opens the demo restaurant
// as one of its roles from the console, reads it as that role, cannot
// change anything, and every start and end is in the audit log.
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const NEW = { name: "לא תישמר", local: "050-000-0931", e164: "+972500000931" };
const BUSINESS = "מסעדת הדגמה";

const a = he.admin.setup.viewAs;
const v = he.app.viewAs;
const tt = he.app.team;
const m = he.modules;

test.afterEach(async () => {
  await endViewSessions(ADMIN.e164);
});

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((x) =>
      x.nodes.map((n) => `${x.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** From the console's page for the demo restaurant, view it as `role`. */
async function viewAs(
  page: Page,
  role: "owner" | "manager" | "worker" | "accountant",
) {
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await expect(
    page.getByRole("heading", { level: 2, name: a.title }),
  ).toBeVisible();
  // Exact: "as a manager" is also the start of "as an accountant" in Hebrew.
  await page.getByRole("button", { name: a.as[role], exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  const banner = page.getByRole("complementary", { name: v.label });
  await expect(banner).toContainText(
    v.title.replace("{role}", tt.roles[role]).replace("{business}", BUSINESS),
  );
  return banner;
}

function nav(page: Page) {
  return page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
}

test("the team views a business as a worker and stops", async ({
  page,
}, testInfo) => {
  const before = await viewAudit(ADMIN.e164);
  const banner = await viewAs(page, "worker");
  expect((await viewAudit(ADMIN.e164)).start).toBe(before.start + 1);

  // The worker's app: the business's name and modules, nothing for managers.
  await expect(page.getByRole("main")).toContainText(BUSINESS);
  await expect(
    nav(page).getByRole("link", { name: m.scheduling.name }),
  ).toBeVisible();
  await expect(
    nav(page).getByRole("link", { name: m.storefront.name }),
  ).toHaveCount(0);
  await expect(page.getByText(he.app.home.manageTitle)).toHaveCount(0);
  // Today as a worker has it: nothing is published, and no manager's tiles.
  await expect(
    page.getByRole("region", { name: he.app.home.hero.next }),
  ).toContainText(he.app.home.hero.notPublished.title);
  await expect(
    page.getByRole("main").locator('a[href="/schedule/swaps"]'),
  ).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("view-as-worker.png"),
    fullPage: true,
  });

  await page.goto("/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();

  // Stopping goes back to the business in the console and is logged.
  await page.goto("/home");
  await banner.getByRole("button", { name: v.end }).click();
  await expect(page).toHaveURL(/\/admin\/businesses\/demo-restaurant$/);
  expect(await viewAudit(ADMIN.e164)).toEqual({
    start: before.start + 1,
    end: before.end + 1,
  });

  // Out of the session, the app is closed to the team again.
  await page.goto("/home");
  await expect(page).toHaveURL(/\/admin$/);
});

test("viewing as a manager shows the team but saves nothing", async ({
  page,
}) => {
  await viewAs(page, "manager");
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();
  // The seeded team, read through the view session.
  await expect(
    page.getByText("נועה כהן").filter({ visible: true }).first(),
  ).toBeVisible();
  await expectCleanPage(page);

  await page.goto("/team/invite");
  await page.getByLabel(tt.invite.name).fill(NEW.name);
  await page.getByLabel(tt.invite.phone).fill(NEW.local);
  await page.getByRole("button", { name: tt.invite.submit }).click();
  await expect(page.getByText(tt.invite.errors.viewOnly)).toBeVisible();
  expect(
    (await invitesBySlug("demo-restaurant")).map((i) => i.phone),
  ).not.toContain(NEW.e164);
  await expectCleanPage(page);

  // The business's settings can be read, not changed.
  await page.goto("/manage/scheduling");
  await expect(page.getByText(he.app.manage.viewOnly)).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: he.modules.scheduling.settings.closedOnShabbat.label,
    }),
  ).toBeDisabled();
  await expectCleanPage(page);

  // So can its own details.
  await page.goto("/manage/business");
  await expect(page.getByText(he.app.manage.viewOnly)).toBeVisible();
  await expect(
    page.getByLabel(he.app.manage.business.name.label, { exact: true }),
  ).toBeDisabled();
  await expectCleanPage(page);

  // And its activity log, where this view is the newest thing that happened.
  const activity = he.app.manage.activity;
  await page.goto("/manage/activity");
  await expect(
    page.getByRole("heading", { level: 1, name: activity.title }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(
        activity.actions.view_as.start.replace(
          "{role}",
          he.app.team.roles.manager,
        ),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByText(activity.who.team)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expectCleanPage(page);
});

// The one view that reads pay (payroll P3): as an accountant, the business
// shows Home and the hours for payroll, and nothing of the staff's.
test("viewing as an accountant shows the hours for payroll and nothing else", async ({
  page,
}) => {
  await viewAs(page, "accountant");
  const items = nav(page).locator("[data-nav-label]");
  await expect(items).toHaveText([he.app.nav.home, m.time_clock.outsideNav]);
  await expect(
    page.getByRole("link", { name: he.app.home.accountant.open }),
  ).toBeVisible();
  await expectCleanPage(page);

  await nav(page).getByRole("link", { name: m.time_clock.outsideNav }).click();
  await expect(page).toHaveURL(/\/clock\/pay/);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.pay.title }),
  ).toBeVisible();
  await expectCleanPage(page);

  // Noa's wage reads, and nothing changes it from a view (payroll P4).
  await page.goto("/clock/pay/00000000-0000-4000-a000-000000000003");
  await expect(
    page.getByText("38.00 ₪").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(he.app.pay.wage.viewOnly).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: he.app.pay.wage.change }),
  ).toHaveCount(0);
  // Her details for payroll read too, and nothing changes them (payroll P5).
  await expect(
    page.getByText("102", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(he.app.pay.details.can.viewOnly).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: he.app.pay.details.edit }),
  ).toHaveCount(0);

  for (const path of ["/schedule", "/clock", "/team", "/manage/access"]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
      path,
    ).toBeVisible();
  }
});

test("viewing as the owner reads no pay", async ({ page }) => {
  await viewAs(page, "owner");
  await page.goto("/clock/pay");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  // Who sees pay can be read, not changed.
  await page.goto("/manage/access");
  await expect(
    page.getByRole("switch", { name: he.app.manage.access.roles.manager }),
  ).toBeDisabled();
  await expectCleanPage(page);
});
