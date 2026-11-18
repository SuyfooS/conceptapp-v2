import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  addFirstStepsDepartment,
  closeFirstStepsBusiness,
  endViewSessions,
  FIRST_STEPS_BUSINESS,
  FIRST_STEPS_PEOPLE,
  joinFirstStepsDepartment,
  joinFirstStepsWorker,
  openFirstStepsBusiness,
  publishFirstStepsWeek,
  setFirstStepsDetails,
  setFirstStepsStaffing,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// The owner's first steps on Today: what to do first in a business the team
// just opened, worked out from what it holds, each step by its module and
// leading to the screen that does it. They go once every counted step is
// done, or once the owner hides them on this device, with a way back. A demo
// business never has them, so this runs in a real business of its own
// (e2e/db.ts) from the general template, made afresh for each test and gone
// after, at every screen size.

const OWNER = FIRST_STEPS_PEOPLE.owner;
const WORKER = FIRST_STEPS_PEOPLE.worker;
/** The seeded platform admin (supabase/seed.sql), in no business. */
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
/** The demo restaurant's owner (supabase/seed.sql). */
const DEMO_OWNER = { local: "050-000-0001", e164: "+972500000001" };

const f = he.app.home.firstSteps;
const s = f.steps;
/** How long a held write waits for "ביטול" (app/(app)/use-held-write.ts). */
const HOLD_MS = 8_000;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const card = (page: Page) => page.getByRole("region", { name: f.title });
/** A step's row, named by its title first. */
const row = (where: Locator, title: string) =>
  where.getByRole("link", { name: new RegExp(`^${literal(title)}`) });
const left = (count: number) => heT("app.home.firstSteps.remaining", { count });

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
  await openFirstStepsBusiness();
});

test.afterEach(async () => {
  await endViewSessions(ADMIN.e164);
  await closeFirstStepsBusiness();
});

test("a new business's owner sees what to do first, each step leading to its screen", async ({
  page,
}, testInfo) => {
  await signIn(page, OWNER);
  const steps = card(page);
  await expect(steps).toBeVisible();
  await expect(steps).toContainText(left(4));
  await expect(steps).toContainText(
    heT("app.home.firstSteps.progress", { done: 0, total: 4 }),
  );
  await expect(steps).toContainText(
    heT("app.home.firstSteps.next", { step: s.team.title }),
  );

  // Scheduling and the clock are on; the general template has no
  // departments, so they aren't a step.
  await expect(row(steps, s.team.title)).toHaveAttribute(
    "href",
    "/team/invite",
  );
  await expect(row(steps, s.team.title)).toContainText(s.team.none);
  await expect(row(steps, s.shifts.title)).toHaveAttribute(
    "href",
    "/manage/scheduling",
  );
  await expect(row(steps, s.publish.title)).toHaveAttribute(
    "href",
    "/schedule/build",
  );
  await expect(row(steps, s.details.title)).toHaveAttribute(
    "href",
    "/manage/business",
  );
  await expect(row(steps, s.details.title)).toContainText(
    heT("app.home.firstSteps.steps.details.todo", { missing: "both" }),
  );
  await expect(row(steps, s.clockCode.title)).toHaveAttribute(
    "href",
    "/manage/time_clock",
  );
  await expect(row(steps, s.clockCode.title)).toContainText(f.optional);
  await expect(row(steps, s.departments.title)).toHaveCount(0);
  await expect(steps.getByRole("link")).toHaveCount(5);
  // Each row says where it stands, for screen readers too.
  await expect(row(steps, s.team.title)).toHaveAccessibleName(
    new RegExp(`^${literal(`${s.team.title} · ${f.open}`)}`),
  );

  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("first-steps-new.png"),
    fullPage: true,
  });

  await row(steps, s.details.title).click();
  await expect(page).toHaveURL(/\/manage\/business$/);
});

test("steps are marked as the business fills in, and the card goes once every counted one is done", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  await signIn(page, OWNER);
  const steps = card(page);
  await expect(steps).toContainText(left(4));

  await setFirstStepsDetails("הרצל 1, ירושלים", "jerusalem");
  await page.reload();
  await expect(row(steps, s.details.title)).toHaveAccessibleName(
    new RegExp(`^${literal(`${s.details.title} · ${f.done}`)}`),
  );
  await expect(row(steps, s.details.title)).toContainText("הרצל 1, ירושלים");
  await expect(steps).toContainText(left(3));

  await joinFirstStepsWorker();
  await page.reload();
  await expect(row(steps, s.team.title)).toContainText(
    heT("app.home.firstSteps.steps.team.done", { count: 1 }),
  );
  await expect(row(steps, s.team.title)).toHaveAttribute("href", "/team");
  await expect(steps).toContainText(left(2));

  await setFirstStepsStaffing();
  await page.reload();
  await expect(row(steps, s.shifts.title)).toContainText(
    heT("app.home.firstSteps.steps.shifts.done", { positions: 2, shifts: 1 }),
  );
  await expect(steps).toContainText(left(1));
  await expect(steps).toContainText(
    heT("app.home.firstSteps.next", { step: s.publish.title }),
  );

  // The clock's code is optional: with it still off, nothing is left.
  await publishFirstStepsWeek();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(steps).toHaveCount(0);

  // A department with nobody in it brings the card back with that step
  // alone, until someone is in it.
  await addFirstStepsDepartment("משלוחים");
  await page.reload();
  await expect(steps).toContainText(left(1));
  await expect(row(steps, s.departments.title)).toContainText(
    heT("app.home.firstSteps.steps.departments.todo", { count: 1 }),
  );
  await expect(row(steps, s.departments.title)).toHaveAttribute(
    "href",
    "/manage/departments",
  );
  await joinFirstStepsDepartment("משלוחים");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(steps).toHaveCount(0);

  // The worker never has them.
  const other = await secondPage(browser, testInfo);
  try {
    await signIn(other, WORKER);
    await expect(
      other
        .getByRole("heading", { level: 1 })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(card(other)).toHaveCount(0);
  } finally {
    await other.context().close();
  }
});

test("the owner hides the card on this device, with a way back", async ({
  page,
  browser,
}, testInfo) => {
  // The hold waits eight seconds, and a second sign-in of the same number
  // waits out the SMS cooldown.
  test.setTimeout(150_000);
  await signIn(page, OWNER);
  const steps = card(page);
  const hide = steps.getByRole("button", { name: f.hide });
  await expect(hide).toBeVisible();

  await hide.click();
  await expect(steps).toHaveCount(0);
  const undoRow = page.getByRole("status").filter({ hasText: f.hidden });
  await expect(undoRow).toBeVisible();
  const undo = undoRow.getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await expectCleanPage(page);

  // "ביטול" at once, well inside the hold: the card is back, and so is the
  // keyboard, and the write it let go of was never sent.
  await undo.click();
  await expect(steps).toBeVisible();
  await expect(hide).toBeFocused();
  await page.waitForTimeout(HOLD_MS + 1_000);
  await page.reload();
  await expect(steps).toBeVisible();

  // For real: leaving the screen inside the app sends it.
  await hide.click();
  await expect(undoRow).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", {
      name: new RegExp(`^${literal(he.app.manage.row)}`),
    })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.manage.title }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await page.context().cookies()).find(
        (one) => one.name === "ca_first_steps_hidden",
      ),
    )
    .toMatchObject({
      value: FIRST_STEPS_BUSINESS.id,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(steps).toHaveCount(0);

  // Only on this device: another one still has them.
  const other = await secondPage(browser, testInfo);
  try {
    await signIn(other, OWNER);
    await expect(card(other)).toBeVisible();
  } finally {
    await other.context().close();
  }
});

test("the team viewing the business as its owner reads the steps and can't hide them", async ({
  page,
}) => {
  const a = he.admin.setup.viewAs;
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto(`/admin/businesses/${FIRST_STEPS_BUSINESS.slug}`);
  await expect(
    page.getByRole("heading", { level: 2, name: a.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: a.as.owner, exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("complementary", { name: he.app.viewAs.label }),
  ).toBeVisible();

  const steps = card(page);
  await expect(steps).toBeVisible();
  await expect(steps).toContainText(left(4));
  await expect(row(steps, s.team.title)).toHaveAttribute(
    "href",
    "/team/invite",
  );
  await expect(steps.getByRole("button", { name: f.hide })).toHaveCount(0);
  await expectCleanPage(page);
});

test("demo owners have no first steps", async ({ page }) => {
  // The restaurant's week isn't published after its reset, and still.
  await signIn(page, DEMO_OWNER);
  await expect(
    page.getByRole("heading", { level: 1 }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});
