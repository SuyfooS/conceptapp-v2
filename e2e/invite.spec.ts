import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { demoRole, inviteToDemo } from "./db";
import { signIn } from "./session";
import { latestCode } from "./sms";

// The seeded platform admin (supabase/seed.sql) issues the link; the
// invited numbers have no account until the link is used. One number per
// screen size, since each invite is claimed once.
const PLATFORM_ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const INVITED = {
  phone: { name: "גל בדיקה", e164: "+972500000801" },
  tablet: { name: "גל טאבלט", e164: "+972500000802" },
  desktop: { name: "גל מחשב", e164: "+972500000803" },
} as const;

const j = he.auth.join;
const inv = he.admin.setup.invite;

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  // Each failing element and axe's reason, so a CI log alone says what
  // to fix.
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

test("an invited number joins the demo restaurant as a manager", async ({
  page,
  browser,
}, testInfo) => {
  const person =
    INVITED[testInfo.project.name as keyof typeof INVITED] ?? INVITED.phone;
  await inviteToDemo({
    name: person.name,
    phone: person.e164,
    role: "manager",
  });

  // The console issues the link; nothing is sent.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", { name: inv.createFor.replace("{name}", person.name) })
    .filter({ visible: true })
    .click();
  const field = page
    .getByLabel(inv.linkFor.replace("{name}", person.name))
    .filter({ visible: true });
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue();
  await page
    .getByRole("button", { name: inv.copy })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("button", { name: inv.copied }).filter({ visible: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.screenshot({
    path: testInfo.outputPath("invite-1-link.png"),
    fullPage: true,
  });
  await expectCleanPage(page);

  // The invited person opens it on their own phone, signed out.
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, locale } =
    testInfo.project.use;
  const theirs = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    userAgent,
    locale,
  });
  const joining = await theirs.newPage();
  await joining.goto(link);
  await expect(
    joining.getByRole("heading", {
      level: 1,
      name: j.title.replace("{business}", "מסעדת הדגמה"),
    }),
  ).toBeVisible();
  await expect(
    joining.getByText(
      j.welcomeNamed
        .replace("{name}", person.name)
        .replace("{role}", j.roles.manager),
    ),
  ).toBeVisible();
  await expect(
    joining.getByText(person.e164.slice(-4), { exact: true }),
  ).toBeVisible();
  await joining.screenshot({
    path: testInfo.outputPath("invite-2-join.png"),
    fullPage: true,
  });
  await expectCleanPage(joining);

  const since = new Date(Date.now() - 1000);
  await joining.getByRole("button", { name: j.send }).click();
  await expect(joining.getByLabel(j.codeLabel)).toBeVisible();
  await expectCleanPage(joining);
  expect(await demoRole(person.e164)).toBeNull();

  const code = await latestCode(person.e164, since);
  await joining.getByLabel(j.codeLabel).fill(code);

  // Home in the right business, with what a manager reaches and the name
  // from the invite.
  await expect(joining).toHaveURL(/\/home$/);
  // The greeting follows the hour; the name does not.
  await expect(
    joining.getByRole("heading", { level: 1, name: /, גל$/ }),
  ).toBeVisible();
  await expect(
    joining.getByText("מסעדת הדגמה").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    joining.getByRole("main").locator('a[href="/manage"]'),
  ).toBeVisible();
  expect(await demoRole(person.e164)).toBe("manager");
  await joining.screenshot({
    path: testInfo.outputPath("invite-3-home.png"),
    fullPage: true,
  });

  // The link works once.
  await joining.goto(link);
  await expect(
    joining.getByRole("heading", { level: 1, name: j.gone.claimed.title }),
  ).toBeVisible();
  await expectCleanPage(joining);
  await theirs.close();

  // A link nobody issued says so.
  await page.goto(`/join/${"x".repeat(43)}`);
  await expect(
    page.getByRole("heading", { level: 1, name: j.gone.missing.title }),
  ).toBeVisible();
  await expectCleanPage(page);
});
