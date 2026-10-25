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
async function viewAs(page: Page, role: "owner" | "manager" | "worker") {
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await expect(
    page.getByRole("heading", { level: 2, name: a.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: a.as[role] }).click();
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
});
