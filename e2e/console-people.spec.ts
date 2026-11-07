import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { demoInvite, inviteToDemo, removeDemoInvites } from "./db";
import { signIn } from "./session";

// The ConceptApp team sets up people from the console (Orel, 7 November
// 2026): it renews an invite that ran out and adds a person in any role. The
// seeded platform admin (supabase/seed.sql) does it for the demo restaurant.
// One number per screen size, since the local database keeps each one.
const PLATFORM_ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const EXPIRED = {
  phone: { name: "רונית פגה", e164: "+972500000941" },
  tablet: { name: "רונית פגה טאבלט", e164: "+972500000942" },
  desktop: { name: "רונית פגה מחשב", e164: "+972500000943" },
} as const;
const ADDED = {
  phone: { name: "עדי חדשה", local: "050-000-0944", e164: "+972500000944" },
  tablet: { name: "עדי טאבלט", local: "050-000-0945", e164: "+972500000945" },
  desktop: { name: "עדי מחשב", local: "050-000-0946", e164: "+972500000946" },
} as const;
// The demo shop's owner (supabase/seed.sql), active in another business.
const IN_THE_SHOP = { local: "050-000-0007" };

const a = he.admin;
const inv = he.admin.setup.invite;
const ti = he.app.team.invite;

type Size = keyof typeof EXPIRED;

async function expectCleanPage(page: Page) {
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

test.afterEach(async () => {
  await removeDemoInvites([
    ...Object.values(EXPIRED).map((p) => p.e164),
    ...Object.values(ADDED).map((p) => p.e164),
  ]);
});

test("the console renews an invite that ran out", async ({
  page,
}, testInfo) => {
  const person = EXPIRED[testInfo.project.name as Size];
  await inviteToDemo({
    name: person.name,
    phone: person.e164,
    role: "owner",
    expiresInDays: -1,
  });
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);

  // The list says the business has an invite nobody can use any more.
  // (One, or more if another spec left one behind.)
  await expect(
    page
      .getByText(/הזמנה אחת פגה|הזמנות פגו/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  await page.goto("/admin/businesses/demo-restaurant");
  await expect(
    page.getByText(a.setup.people.expired).filter({ visible: true }).first(),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("console-expired.png"),
    fullPage: true,
  });

  await page
    .getByRole("button", {
      name: inv.renewFor.replace("{name}", person.name),
    })
    .filter({ visible: true })
    .click();
  // The new link stays on screen while the page reads the invite again.
  const field = page
    .getByLabel(inv.linkFor.replace("{name}", person.name))
    .filter({ visible: true });
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
  await expect
    .poll(async () => (await demoInvite(person.e164))?.open)
    .toBe(true);
  // Open again: the badge says so, and the link is still there to copy.
  await expect(
    page.getByText(a.setup.people.invited).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
});

test("the console adds a person in any role, with a link to send", async ({
  page,
}, testInfo) => {
  const person = ADDED[testInfo.project.name as Size];
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("link", { name: a.setup.people.add })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(
    /\/admin\/businesses\/demo-restaurant\/people\/new$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: a.addPerson.title }),
  ).toBeVisible();
  await expectCleanPage(page);

  await page.getByLabel(ti.name).fill(person.name);
  await page.getByLabel(ti.phone).fill(person.local);
  await page
    .getByRole("radio", { name: new RegExp(he.app.team.roles.owner) })
    .check();
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(
    page.getByRole("heading", {
      name: ti.ready.replace("{name}", person.name),
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("console-added.png"),
    fullPage: true,
  });
  expect(await demoInvite(person.e164)).toEqual({
    role: "owner",
    open: true,
    byTeam: true,
  });

  // Back on the business, they are there, invited.
  await page
    .getByRole("link", {
      name: a.addPerson.back.replace("{name}", "מסעדת הדגמה"),
    })
    .click();
  await expect(page).toHaveURL(/\/admin\/businesses\/demo-restaurant$/);
  await expect(
    page.getByText(person.name).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("someone working in another business is not added", async ({ page }) => {
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant/people/new");
  await page.getByLabel(ti.name).fill("מיכל");
  await page.getByLabel(ti.phone).fill(IN_THE_SHOP.local);
  await page.getByRole("button", { name: ti.submit }).click();
  await expect(page.getByText(ti.errors.elsewhere)).toBeVisible();
});

test("the checklist opens the right way to fix a missing owner", async ({
  page,
}) => {
  const owner = new RegExp(a.setup.checklist.items.owner.title);
  // On the design console (no sign-in): a business with nobody yet invites
  // its owner as an owner, and one whose owner's invite ran out renews it.
  await page.goto("/design/console/businesses/cafe-noa");
  await expect(page.getByRole("link", { name: owner })).toHaveAttribute(
    "href",
    /\/people\/new\?role=owner$/,
  );
  await page.goto("/design/console/businesses/bar-hayam");
  await expect(page.getByRole("link", { name: owner })).toHaveAttribute(
    "href",
    "#people",
  );

  // The real form starts on the role it was opened for.
  await signIn(page, PLATFORM_ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant/people/new?role=owner");
  await expect(
    page.getByRole("radio", { name: new RegExp(he.app.team.roles.owner) }),
  ).toBeChecked();
  await page.goto("/admin/businesses/demo-restaurant/people/new");
  await expect(
    page.getByRole("radio", { name: new RegExp(he.app.team.roles.worker) }),
  ).toBeChecked();
});
