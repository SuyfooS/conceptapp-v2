import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { inviteToDemo, removeDemoInvites } from "./db";
import { signIn } from "./session";

// Seeded in supabase/seed.sql. Neither number signs in in sign-in.spec.ts,
// the spec just before this one: the auth server refuses a second code to
// the same number within its resend wait (`[auth.sms] max_frequency`).
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const WORKER = { local: "050-000-0004", e164: "+972500000004" };

// Two invites nobody has claimed: one still open, one past its date.
const OPEN = { name: "מיכל ממתינה", phone: "+972500000901", role: "worker" };
const EXPIRED = { name: "עמית פג", phone: "+972500000902", role: "manager" };

const tt = he.app.team;

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
  await inviteToDemo({ ...OPEN, role: "worker" });
  await inviteToDemo({ ...EXPIRED, role: "manager", expiresInDays: -1 });
});

test.afterEach(async () => {
  await removeDemoInvites([OPEN.phone, EXPIRED.phone]);
});

test("the owner sees the team and who has not joined yet", async ({
  page,
}, testInfo) => {
  await signIn(page, OWNER);

  // Today says an invite is waiting before the team screen is opened.
  const teamRow = page.getByRole("main").getByRole("link", {
    name: new RegExp(tt.title),
  });
  await expect(teamRow).toContainText("הזמנה אחת ממתינה");
  await teamRow.click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(
    page.getByRole("heading", { level: 1, name: tt.title }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("הזמנה אחת ממתינה");

  const desktop = testInfo.project.name === "desktop";
  if (desktop) {
    // The full picture: everyone in one table, with their status.
    const table = page.getByRole("table", { name: tt.everyone });
    await expect(table).toBeVisible();
    const row = (name: string) =>
      table
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name }) });
    await expect(row("אורי הדגמה")).toContainText(tt.roles.owner);
    await expect(row("אורי הדגמה")).toContainText(tt.state.member);
    await expect(row(OPEN.name)).toContainText(tt.state.open);
    await expect(row(OPEN.name)).toContainText("050-000-0901");
    await expect(row(EXPIRED.name)).toContainText(tt.state.expired);
    await expect(row(EXPIRED.name)).toContainText(tt.roles.manager);
  } else {
    // Members and invites as two lists (stacked on phones, side by side
    // on tablets).
    const members = page.getByRole("list", { name: tt.members.title });
    const invites = page.getByRole("list", { name: tt.invites.title });
    await expect(members).toBeVisible();
    await expect(invites).toBeVisible();
    await expect(members).toContainText("אורי הדגמה");
    await expect(members).toContainText("שירן הדגמה");
    await expect(members).not.toContainText(OPEN.name);
    const items = invites.getByRole("listitem");
    // Open invites come before expired ones.
    await expect(items.nth(0)).toContainText(OPEN.name);
    await expect(items.nth(0)).toContainText(tt.state.open);
    await expect(items.nth(1)).toContainText(EXPIRED.name);
    await expect(items.nth(1)).toContainText(tt.state.expired);
  }
  await expect(page.getByRole("main")).toContainText("להזמנה אחת פג התוקף");
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team.png"),
    fullPage: true,
  });
});

test("a worker has no team screen", async ({ page }) => {
  await signIn(page, WORKER);
  await expect(
    page.getByRole("main").getByRole("link", { name: new RegExp(tt.title) }),
  ).toHaveCount(0);
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  await page.goto("/team/invite");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
});
