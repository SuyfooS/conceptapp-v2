import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { invitesBySlug, inviteToDemo, removeDemoInvites } from "./db";
import { signIn } from "./session";

// The seeded manager of the demo restaurant (supabase/seed.sql) invites
// from the Team screen. One new number per screen size; a seeded worker's
// number for "already in the team".
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const MEMBER = { local: "050-000-0003", name: "נועה כהן" };
const NEW = {
  phone: { name: "תמר חדשה", local: "050-000-0911", e164: "+972500000911" },
  tablet: { name: "תמר טאבלט", local: "050-000-0912", e164: "+972500000912" },
  desktop: { name: "תמר מחשב", local: "050-000-0913", e164: "+972500000913" },
} as const;
const EXPIRED = { name: "אלון פג", phone: "+972500000921" };
const OWNER_INVITE = { name: "שותף ממתין", phone: "+972500000922" };

const tt = he.app.team;
const ti = tt.invite;
const tl = tt.link;
const allPhones = [
  ...Object.values(NEW).map((p) => p.e164),
  EXPIRED.phone,
  OWNER_INVITE.phone,
];

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
  await removeDemoInvites(allPhones);
});

test.afterEach(async () => {
  await removeDemoInvites(allPhones);
});

test("a manager invites a worker by phone and gets the link", async ({
  page,
}, testInfo) => {
  const person = NEW[testInfo.project.name as keyof typeof NEW] ?? NEW.phone;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, MANAGER);
  await page.goto("/team");
  await page
    .getByRole("main")
    .getByRole("link", { name: tt.inviteAction })
    .click();
  await expect(page).toHaveURL(/\/team\/invite$/);
  await expect(
    page.getByRole("heading", { level: 1, name: ti.title }),
  ).toBeVisible();

  // A manager gives their own role or below; worker is the default.
  await expect(page.getByRole("radio", { name: tt.roles.owner })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("radio", { name: new RegExp(tt.roles.worker) }),
  ).toBeChecked();

  // An empty form says what is missing.
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(page.getByText(ti.errors.name.required)).toBeVisible();
  await expect(page.getByText(ti.errors.phone.required)).toBeVisible();
  await expectCleanPage(page);

  await page.getByLabel(ti.name).fill(person.name);
  await page.getByLabel(ti.phone).fill(person.local);
  await page.getByRole("button", { name: ti.submit }).click();

  await expect(
    page.getByRole("heading", {
      name: ti.ready.replace("{name}", person.name),
    }),
  ).toBeVisible();
  const field = page.getByLabel(tl.linkFor.replace("{name}", person.name));
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue();
  await page.getByRole("button", { name: tl.copy }).click();
  await expect(page.getByRole("button", { name: tl.copied })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(await invitesBySlug("demo-restaurant")).toContainEqual({
    name: person.name,
    phone: person.e164,
    role: "worker",
  });
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-invite-ready.png"),
    fullPage: true,
  });

  // Someone already in the team is not invited again.
  await page.getByRole("button", { name: ti.another }).click();
  await page.getByLabel(ti.name).fill(MEMBER.name);
  await page.getByLabel(ti.phone).fill(MEMBER.local);
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(page.getByText(ti.errors.alreadyMember)).toBeVisible();

  // Back on the team, the new invite is waiting.
  await page.goto("/team");
  await expect(
    page.getByText(person.name).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("a new link opens an expired invite again", async ({ page }, testInfo) => {
  await inviteToDemo({ ...EXPIRED, role: "worker", expiresInDays: -1 });
  await inviteToDemo({ ...OWNER_INVITE, role: "owner" });
  await signIn(page, MANAGER);
  await page.goto("/team");
  const main = page.getByRole("main");
  await expect(main).toContainText("להזמנה אחת פג התוקף");

  // A manager cannot send an owner's invite.
  await expect(
    page.getByRole("button", {
      name: tl.newFor.replace("{name}", OWNER_INVITE.name),
    }),
  ).toHaveCount(0);

  await page
    .getByRole("button", { name: tl.newFor.replace("{name}", EXPIRED.name) })
    .filter({ visible: true })
    .click();
  const field = page
    .getByLabel(tl.linkFor.replace("{name}", EXPIRED.name))
    .filter({ visible: true });
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);

  // The screen re-reads: nothing has expired any more, the link stays.
  await expect(main).not.toContainText("להזמנה אחת פג התוקף");
  await expect(field).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-new-link.png"),
    fullPage: true,
  });
});
