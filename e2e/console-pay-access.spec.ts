import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  closePayAccessBusiness,
  openPayAccessBusiness,
  PAY_ACCESS_BUSINESS,
  PAY_ACCESS_PEOPLE,
  payAccessLines,
  payAccessLog,
  payAccessPersonal,
  payAccessRoles,
  setPayAccessModules,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// Who sees pay from the console (Orel's payroll decision 1, 9 November 2026:
// the owner, and the ConceptApp team from the console). The team changes it
// on a real business of its own, the switches being the owner's: managers on
// and off, a worker given access and taken back with the undo. The owner sees
// the same, the business's log names the team member, and the worker's line
// says the ConceptApp team gave it, never a colleague. Seeded in
// supabase/seed.sql: the platform admin and the onboarder, in no business.
const ADMIN = {
  id: "00000000-0000-4000-a000-000000000005",
  local: "050-000-0005",
  e164: "+972500000005",
};
const ONBOARDER = {
  id: "00000000-0000-4000-a000-000000000006",
  local: "050-000-0006",
  e164: "+972500000006",
};
const { owner: OWNER, worker: WORKER } = PAY_ACCESS_PEOPLE;
const BUSINESS = `/admin/businesses/${PAY_ACCESS_BUSINESS.slug}`;

const a = he.app.manage.access;
const pay = he.app.notifications.kinds.access.pay_granted;

const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/** The button that takes away someone's own access, as it reads. */
const removeButton = (page: Page, name: string) =>
  page.getByRole("button", {
    name: heT("app.manage.access.personal.removeLabel", {
      remove: a.personal.remove,
      name,
    }),
  });

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

/**
 * The owner's activity log has the change, done by the ConceptApp team: on a
 * computer in the row's "who" cell, elsewhere as the row's title.
 */
async function expectByTeam(page: Page, what: string, desktop: boolean) {
  const who = he.app.manage.activity.who.team;
  if (desktop) {
    await expect(
      page.getByRole("row").filter({ hasText: what }).getByRole("rowheader"),
    ).toHaveText(who);
    return;
  }
  // A row of the list leads to the screen: who, then what.
  await expect(
    page.getByRole("link").filter({ hasText: what }).filter({ visible: true }),
  ).toContainText(who);
}

/** From the business's page, through its people, to who sees pay. */
async function openAccess(page: Page) {
  await page.goto(BUSINESS);
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${a.title}`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`${BUSINESS}/access$`));
  await expect(
    page.getByRole("heading", { level: 1, name: a.title }),
  ).toBeVisible();
}

test.afterEach(async () => {
  await closePayAccessBusiness();
});

test("the team changes who sees pay from the console, as the owner would", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  await openPayAccessBusiness();
  await signIn(page, ADMIN, /\/admin$/);
  await openAccess(page);
  // Back to the business by its name, from the console's own screen.
  await expect(
    page.getByRole("link", { name: PAY_ACCESS_BUSINESS.name, exact: true }),
  ).toHaveAttribute("href", BUSINESS);
  await expect(shown(page, a.personal.empty)).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("console-pay-access.png"),
    fullPage: true,
  });

  // Managers on, then off: each saved at once.
  const managers = page.getByRole("switch", { name: a.roles.manager });
  await expect(managers).toHaveAttribute("aria-checked", "false");
  await managers.click();
  await expect(managers).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => payAccessRoles()).toEqual(["manager"]);
  await expect(
    page.getByRole("status").filter({
      hasText: heT("app.manage.access.done.roleOn", { role: "manager" }),
    }),
  ).toBeVisible();
  await managers.click();
  await expect(managers).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => payAccessRoles()).toEqual([]);

  // The worker, given access of their own.
  await page
    .getByRole("button", {
      name: `${heT("app.manage.access.personal.addLabel", { add: a.personal.add })}: ${a.personal.choose}`,
    })
    .click();
  await page
    .getByRole("menuitemradio", { name: new RegExp(WORKER.name) })
    .click();
  await expect(removeButton(page, WORKER.name)).toBeVisible();
  await expect.poll(() => payAccessPersonal(WORKER.id)).toBe(true);
  await expect
    .poll(() => payAccessLines(WORKER.id))
    .toEqual([{ actor: ADMIN.id, settled: false }]);

  // Their line says the ConceptApp team gave it, on every shape, and never
  // someone on the business's team.
  const worker = await secondPage(browser, testInfo);
  try {
    await signIn(worker, WORKER);
    await worker.goto("/notifications");
    await expect(shown(worker, pay.title)).toBeVisible();
    await expect(shown(worker, pay.byTeam)).toBeVisible();
    await expect(
      worker.getByText(he.app.notifications.who.unknown),
    ).toHaveCount(0);
    if (testInfo.project.name === "desktop") {
      // The computer's table says who, in its own column: that cell alone,
      // since the line's own note names the team too.
      await expect(
        worker
          .getByRole("row")
          .filter({ hasText: pay.title })
          .getByRole("rowheader"),
      ).toHaveText(he.app.notifications.who.team);
    }
    await expectCleanPage(worker);
  } finally {
    await worker.context().close();
  }

  // The owner's own screen shows the same, and their log says who did it.
  const owner = await secondPage(browser, testInfo);
  try {
    await signIn(owner, OWNER);
    await owner.goto("/manage/access");
    await expect(
      owner.getByRole("switch", { name: a.roles.manager }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(removeButton(owner, WORKER.name)).toBeVisible();
    await owner.goto("/manage/activity");
    await expectByTeam(
      owner,
      heT("app.manage.activity.actions.permission.grant", {
        perm: "payroll",
        to: heT("app.manage.activity.actions.permission.to.person", {
          person: WORKER.name,
        }),
      }),
      testInfo.project.name === "desktop",
    );
    await expectByTeam(
      owner,
      heT("app.manage.activity.actions.permission.grant", {
        perm: "payroll",
        to: heT("app.manage.activity.actions.permission.to.role", {
          role: "manager",
        }),
      }),
      testInfo.project.name === "desktop",
    );
    // The console is the team's: someone in the business isn't let in.
    await owner.goto(`${BUSINESS}/access`);
    await expect(
      owner.getByRole("heading", { level: 1, name: he.admin.noAccess.title }),
    ).toBeVisible();
    await expect(
      owner.getByRole("heading", { level: 1, name: a.title }),
    ).toHaveCount(0);
  } finally {
    await owner.context().close();
  }

  // Taken back, then undone: the removal waits for its undo, so nothing is
  // written and nobody is told twice.
  await removeButton(page, WORKER.name).click();
  const undo = page.getByRole("status").filter({
    hasText: heT("app.manage.access.done.removed", { name: WORKER.name }),
  });
  await expect(undo).toBeVisible();
  await expectCleanPage(page);
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(removeButton(page, WORKER.name)).toBeVisible();
  expect(await payAccessPersonal(WORKER.id)).toBe(true);

  // Taken back for good: written once its six seconds are up, and the line
  // no longer leads to the hours.
  await removeButton(page, WORKER.name).click();
  await expect(shown(page, a.personal.empty)).toBeVisible();
  await expect
    .poll(() => payAccessPersonal(WORKER.id), { timeout: 15_000 })
    .toBe(false);
  await expect
    .poll(() => payAccessLines(WORKER.id))
    .toEqual([{ actor: ADMIN.id, settled: true }]);

  // The log has each change once, every one in the team member's name.
  expect(await payAccessLog()).toEqual([
    {
      action: "permission.grant",
      actor: ADMIN.id,
      role: "manager",
      person: null,
    },
    {
      action: "permission.revoke",
      actor: ADMIN.id,
      role: "manager",
      person: null,
    },
    {
      action: "permission.grant",
      actor: ADMIN.id,
      role: null,
      person: WORKER.id,
    },
    {
      action: "permission.revoke",
      actor: ADMIN.id,
      role: null,
      person: WORKER.id,
    },
  ]);
});

test("an onboarder changes who sees pay too", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await openPayAccessBusiness();
  await signIn(page, ONBOARDER, /\/admin$/);
  await openAccess(page);
  await expect(page.getByText(he.admin.access.failure.viewOnly)).toHaveCount(0);
  const workers = page.getByRole("switch", { name: a.roles.worker });
  await expect(workers).toBeEnabled();
  await workers.click();
  await expect(workers).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => payAccessRoles()).toEqual(["worker"]);
  expect(await payAccessLog()).toEqual([
    {
      action: "permission.grant",
      actor: ONBOARDER.id,
      role: "worker",
      person: null,
    },
  ]);
});

test("where the time clock and chat are off, the console offers no pay access", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await openPayAccessBusiness();
  await setPayAccessModules(false);
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto(BUSINESS);
  await expect(
    page.getByRole("heading", { level: 1, name: PAY_ACCESS_BUSINESS.name }),
  ).toBeVisible();
  // The people are there, with no way to who sees pay.
  await expect(shown(page, OWNER.name)).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(`^${a.title}`) }),
  ).toHaveCount(0);
  // Its address leads nowhere, as an unknown business's does.
  await page.goto(`${BUSINESS}/access`);
  await expect(
    page.getByRole("heading", { level: 1, name: he.errors.notFound.title }),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: a.roles.manager })).toHaveCount(
    0,
  );
});
