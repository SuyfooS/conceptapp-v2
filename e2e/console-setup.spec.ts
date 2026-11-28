import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  closeSetupCardBusiness,
  openSetupCardBusiness,
  SETUP_CARD_BUSINESS,
  setUpSetupCardBusiness,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Locator, type Page, test } from "./test";

// The console's setup card shows what is still missing (closing the pilot,
// PR 16): beyond the people and the address, Shabbat, job roles and shifts,
// the clock's code, who sees pay, who of the staff joined and the first week
// published, each from what the business holds (read with the secret key:
// the team is no member of it), and each missing one leading to where the
// team fixes it. A business of its own (e2e/db.ts), opened from the general
// template as one opened before the wizard asked about Shabbat, made afresh
// for each test and gone after, at every screen size.

/** The seeded platform admin (supabase/seed.sql), in no business. */
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const c = he.admin.setup.checklist;
const items = c.items;
const BUSINESS = `/admin/businesses/${SETUP_CARD_BUSINESS.slug}`;
const SETTINGS = `${BUSINESS}/settings`;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const card = (page: Page) => page.getByRole("region", { name: c.title });
/** A row that leads somewhere, named by its title first. */
const link = (where: Locator, title: string) =>
  where.getByRole("link", { name: new RegExp(`^${literal(title)}`) });
/** A row, leading somewhere or not, by its title. */
const row = (where: Locator, title: string) =>
  where.getByRole("listitem").filter({ hasText: title });
const left = (count: number) =>
  heT("admin.setup.checklist.remaining", { count });
const progress = (done: number, total: number) =>
  heT("admin.setup.checklist.progress", { done, total });

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
  await openSetupCardBusiness();
});

test.afterEach(async () => {
  await closeSetupCardBusiness();
});

test("a fresh general business shows each missing step, with where the team fixes it", async ({
  page,
}, testInfo) => {
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto(BUSINESS);
  await expect(
    page.getByRole("heading", { level: 1, name: SETUP_CARD_BUSINESS.name }),
  ).toBeVisible();
  const steps = card(page);
  // Opened, and nothing else yet; the clock's code and who sees pay are
  // shown and never counted.
  await expect(steps).toContainText(left(7));
  await expect(steps).toContainText(progress(1, 8));
  await expect(steps.getByRole("listitem")).toHaveText(
    [
      items.opened.title,
      items.owner.title,
      items.staff.title,
      items.address.title,
      items.shabbat.title,
      items.shifts.title,
      items.clockCode.title,
      items.pay.title,
      items.joined.title,
      items.publish.title,
    ].map((title) => new RegExp(`^${literal(title)}`)),
  );

  // Each missing step leads to where the team fixes it: the people one at a
  // time or from a list, and the settings at the module's own section.
  await expect(link(steps, items.owner.title)).toHaveAttribute(
    "href",
    `${BUSINESS}/people/new?role=owner`,
  );
  await expect(link(steps, items.staff.title)).toHaveAttribute(
    "href",
    `${BUSINESS}/people/import`,
  );
  await expect(link(steps, items.address.title)).toHaveAttribute(
    "href",
    SETTINGS,
  );
  // Never asked: the business opened before the wizard asked.
  const shabbat = link(steps, items.shabbat.title);
  await expect(shabbat).toHaveAttribute("href", `${SETTINGS}#scheduling`);
  await expect(shabbat).toContainText(items.shabbat.notAsked);
  // The general template opens with no job roles and no shifts.
  const shifts = link(steps, items.shifts.title);
  await expect(shifts).toHaveAttribute("href", `${SETTINGS}#scheduling`);
  await expect(shifts).toContainText(
    heT("admin.setup.checklist.items.shifts.todo", { missing: "both" }),
  );
  // Off, as every business starts: a choice, never counted.
  const code = link(steps, items.clockCode.title);
  await expect(code).toHaveAttribute("href", `${SETTINGS}#time_clock`);
  await expect(code).toContainText(items.clockCode.off);
  await expect(code).toContainText(c.optional);
  // Who sees pay is there to check (its own row is under the people), the
  // first week is the business's to publish, and nobody is invited yet to
  // join (the staff's row leads to adding them): none leads anywhere.
  for (const title of [
    items.pay.title,
    items.joined.title,
    items.publish.title,
  ]) {
    await expect(row(steps, title)).toHaveCount(1);
    await expect(row(steps, title).getByRole("link")).toHaveCount(0);
  }
  await expect(row(steps, items.pay.title)).toContainText(
    heT("admin.setup.checklist.items.pay.done", { roles: "none", personal: 0 }),
  );
  await expect(row(steps, items.pay.title)).toContainText(c.toCheck);
  await expect(row(steps, items.joined.title)).toContainText(
    heT("admin.setup.checklist.items.joined.joined", { count: 0 }),
  );
  await expect(row(steps, items.publish.title)).toContainText(
    items.publish.todo,
  );
  await page.screenshot({
    path: testInfo.outputPath("console-setup-fresh.png"),
    fullPage: true,
  });
  await expectCleanPage(page);

  // The Shabbat row opens scheduling's settings, at its switch.
  await shabbat.click();
  await expect(page).toHaveURL(new RegExp(`${literal(SETTINGS)}#scheduling$`));
  await expect(
    page.locator("#scheduling").getByRole("switch", {
      name: he.modules.scheduling.settings.closedOnShabbat.label,
    }),
  ).toBeVisible();
  await expect(page.locator("#time_clock")).toHaveCount(1);

  // Set up meanwhile, by the team and the business: the card reads it all.
  await setUpSetupCardBusiness();
  await page.goto(BUSINESS);
  await expect(
    page.getByRole("heading", { level: 1, name: SETUP_CARD_BUSINESS.name }),
  ).toBeVisible();
  // Left: the owner, the address, and nobody of the staff joined yet. The
  // code, at a station that runs, is a choice made, never counted.
  await expect(steps).toContainText(left(3));
  await expect(steps).toContainText(progress(5, 8));
  await expect(row(steps, items.staff.title)).toContainText(
    heT("admin.setup.checklist.items.staff.done", { count: 1 }),
  );
  for (const [title, words] of [
    [items.shabbat.title, items.shabbat.open],
    [
      items.shifts.title,
      heT("admin.setup.checklist.items.shifts.done", {
        positions: 2,
        shifts: 1,
      }),
    ],
    [
      items.clockCode.title,
      heT("admin.setup.checklist.items.clockCode.station", { count: 1 }),
    ],
    [items.publish.title, items.publish.done],
  ] as const) {
    // Done: nothing to fix, so no link.
    await expect(row(steps, title)).toContainText(words);
    await expect(row(steps, title).getByRole("link")).toHaveCount(0);
  }
  // Someone is waiting for a link: joining leads to the people list, where
  // each one's is made.
  const joined = link(steps, items.joined.title);
  await expect(joined).toHaveAttribute("href", "#people");
  await expect(joined).toContainText(
    heT("admin.setup.checklist.items.joined.pending", { count: 1 }),
  );
  await page.screenshot({
    path: testInfo.outputPath("console-setup-later.png"),
    fullPage: true,
  });
  await expectCleanPage(page);
});
