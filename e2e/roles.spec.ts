import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  closeRolesBusiness,
  openRolesBusiness,
  ROLES_PEOPLE,
  rolesLogActors,
  rolesRules,
  setRolesPayRole,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// Roles and permissions, the owner's own screen (the roles plan's R9; Orel's
// answers of 15 November 2026, issue #1): only owners change what each role
// does, every change saves at once with "ביטול" on its toast, and pay stays
// on "מי רואה שכר". It runs in a real business of its own (e2e/db.ts), every
// rule on its default, made afresh for each test and gone after, so nothing
// here depends on what another spec did to a demo business's rules, at every
// screen size.

const OWNER = ROLES_PEOPLE.owner;
const MANAGER = ROLES_PEOPLE.manager;
const WORKER = ROLES_PEOPLE.worker;

const r = he.app.manage.roles;
const roles = he.app.team.roles;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name }).filter({ visible: true });
const notFound = (page: Page) => title(page, he.app.notFound.title);

/** What is on the screen now: each screen size has its own shapes. */
const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

/** A role's switch for an area's edit, in the shape the screen shows. */
const editSwitch = (page: Page, area: string, role: string) =>
  page
    .getByRole("main")
    .getByRole("switch", {
      name: heT("app.manage.roles.editLabel", { area, role }),
    })
    .filter({ visible: true });

/** One of the switches under an area's edit, for a role. */
const extraSwitch = (page: Page, extra: string, role: string) =>
  page
    .getByRole("main")
    .getByRole("switch", {
      name: heT("app.manage.roles.extraLabel", { extra, role }),
    })
    .filter({ visible: true });

/** The toast that says a change was made, with its undo. */
const toast = (page: Page, text: string) =>
  page.getByRole("main").getByRole("status").filter({ hasText: text });

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

/**
 * A role's areas, as each screen size reaches them: a phone opens the role on
 * a screen of its own, a tablet beside the list, a computer has every role in
 * one table.
 */
async function openRole(page: Page, role: string, project: string) {
  if (project === "desktop") return;
  await page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`^${literal(role)}`) })
    .filter({ visible: true })
    .click();
  if (project === "phone") await expect(title(page, role)).toBeVisible();
}

test.beforeEach(async () => {
  await openRolesBusiness();
});

test.afterEach(async () => {
  await closeRolesBusiness();
});

test("the owner opens roles from the management page, gives workers the lists, and a worker sees the templates", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const lists = he.modules.lists.name;
  const worker = await secondPage(browser, testInfo);
  try {
    // On the defaults the templates aren't the worker's: back to the lists.
    await signIn(worker, WORKER);
    await worker.goto("/lists/templates");
    await expect(worker).toHaveURL(/\/lists$/);

    await signIn(page, OWNER);
    await page.goto("/manage");
    await page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(`^${literal(r.title)}`) })
      .click();
    await expect(page).toHaveURL(/\/manage\/roles$/);
    await expect(title(page, r.title)).toBeVisible();
    // Back to managing the business.
    await expect(
      page
        .getByRole("link", { name: r.back, exact: true })
        .filter({ visible: true }),
    ).toHaveAttribute("href", "/manage");
    await expect(shown(page, r.savesItself)).toBeVisible();
    // Roles a business names come later (R11).
    await expect(page.getByRole("button", { name: r.add })).toHaveCount(0);
    await expectCleanPage(page);

    await openRole(page, roles.worker, testInfo.project.name);
    const edit = editSwitch(page, lists, roles.worker);
    const send = extraSwitch(page, r.extras.lists.send.label, roles.worker);
    await expect(edit).toHaveAttribute("aria-checked", "false");
    await expect(send).toBeDisabled();
    // Pay is never a switch here: its row leads to who sees pay.
    await expect(
      page
        .getByRole("main")
        .locator('a[href="/manage/access"]')
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await edit.click();
    await expect(edit).toHaveAttribute("aria-checked", "true");
    await expect(send).toHaveAttribute("aria-checked", "true");
    await expect(
      toast(
        page,
        heT("app.manage.roles.done.editWith", {
          role: roles.worker,
          area: lists,
          extras: r.extras.lists.send.phrase,
        }),
      ),
    ).toBeVisible();
    await expect.poll(rolesRules).toEqual([
      { role: "worker", perm: "lists.manage", allowed: true },
      { role: "worker", perm: "lists.send", allowed: true },
    ]);
    // The log names the owner who switched it.
    await expect.poll(rolesLogActors).toEqual([OWNER.id, OWNER.id]);
    await expectCleanPage(page);

    // The worker now runs the lists: their templates open.
    await worker.goto("/lists/templates");
    await expect(worker).toHaveURL(/\/lists\/templates$/);
    await expect(title(worker, he.app.lists.templates.title)).toBeVisible();
  } finally {
    await worker.context().close();
  }
});

test("managers lowered to view in scheduling lose the builder, the undo puts it back, and roles are never a manager's", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const scheduling = he.modules.scheduling.name;
  const publish = r.extras.schedule.publish;
  const lowered = heT("app.manage.roles.done.viewWithout", {
    role: roles.manager,
    area: scheduling,
    extras: publish.phrase,
  });
  const manager = await secondPage(browser, testInfo);
  try {
    // Not theirs at any level: no row on the management page, and the
    // address is not found.
    await signIn(manager, MANAGER);
    await manager.goto("/manage");
    await expect(title(manager, he.app.manage.title)).toBeVisible();
    await expect(
      manager
        .getByRole("main")
        .getByRole("link", { name: new RegExp(`^${literal(r.title)}`) }),
    ).toHaveCount(0);
    await manager.goto("/manage/roles");
    await expect(notFound(manager)).toBeVisible();
    // On the defaults, managers build the schedule.
    await manager.goto("/schedule/build");
    await expect(title(manager, he.app.build.title)).toBeVisible();

    await signIn(page, OWNER);
    await page.goto("/manage/roles");
    await expect(title(page, r.title)).toBeVisible();
    await openRole(page, roles.manager, testInfo.project.name);
    const edit = editSwitch(page, scheduling, roles.manager);
    const publishing = extraSwitch(page, publish.label, roles.manager);
    await expect(edit).toHaveAttribute("aria-checked", "true");
    await expect(publishing).toHaveAttribute("aria-checked", "true");

    // Lowered, then "ביטול" at once: the rule goes back to its default.
    await edit.click();
    await expect(edit).toHaveAttribute("aria-checked", "false");
    await expect(publishing).toHaveAttribute("aria-checked", "false");
    await expect(publishing).toBeDisabled();
    await expect(toast(page, lowered)).toBeVisible();
    // Building goes; publishing needs it, so it goes with it, rowless. The
    // toast shows once the change is saved, so this reads it at once, well
    // inside the undo's six seconds.
    await expect
      .poll(rolesRules)
      .toEqual([{ role: "manager", perm: "schedule.edit", allowed: false }]);
    await toast(page, lowered)
      .getByRole("button", { name: he.app.manage.undo })
      .click();
    await expect(toast(page, r.done.undone)).toBeVisible();
    await expect(edit).toHaveAttribute("aria-checked", "true");
    await expect(publishing).toHaveAttribute("aria-checked", "true");
    await expect.poll(rolesRules).toEqual([]);
    await expectCleanPage(page);
    await manager.goto("/schedule/build");
    await expect(title(manager, he.app.build.title)).toBeVisible();

    // Lowered and left so: the builder is not found for a manager.
    await edit.click();
    await expect(toast(page, lowered)).toBeVisible();
    await expect
      .poll(rolesRules)
      .toEqual([{ role: "manager", perm: "schedule.edit", allowed: false }]);
    await manager.goto("/schedule/build");
    await expect(notFound(manager)).toBeVisible();

    // The screen reads what was saved (a phone's address may still open the
    // role: from the list again).
    await page.goto("/manage/roles");
    await expect(title(page, r.title)).toBeVisible();
    await openRole(page, roles.manager, testInfo.project.name);
    await expect(edit).toHaveAttribute("aria-checked", "false");
    await expect(publishing).toBeDisabled();
  } finally {
    await manager.context().close();
  }
});

test("a role that sees pay is told it still reads everyone's hours without the clock's edit", async ({
  page,
}, testInfo) => {
  // The owner gave managers pay, as the demo shop has it.
  await setRolesPayRole("manager", true);
  await signIn(page, OWNER);
  await page.goto("/manage/roles?role=manager");
  await expect(shown(page, r.savesItself)).toBeVisible();
  // Beside the clock's edit, where lowering it would seem to hide the hours.
  await expect(shown(page, r.payHours)).toBeVisible();
  await expect(
    editSwitch(page, he.modules.time_clock.name, roles.manager),
  ).toHaveAttribute("aria-checked", "true");
  await expectCleanPage(page);

  // Workers see no pay: their clock says only what its edit gives. A
  // computer shows every role in one table, the managers' line still there.
  await page.goto("/manage/roles?role=worker");
  await expect(shown(page, r.savesItself)).toBeVisible();
  await expect(
    page.getByText(r.payHours).filter({ visible: true }),
  ).toHaveCount(testInfo.project.name === "desktop" ? 1 : 0);
});
