import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  addRolesSenior,
  closeRolesBusiness,
  openRolesBusiness,
  ROLES_PEOPLE,
  ROLES_SENIOR,
  rolesClosedList,
  rolesLines,
  rolesList,
  rolesLogActors,
  rolesNamed,
  rolesPlace,
  rolesRules,
  setRolesPayRole,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Roles and permissions, the owner's own screen (the roles plan's R9; Orel's
// answers of 15 November 2026, issue #1): only owners change what each role
// does, every change saves at once with "ביטול" on its toast, and pay stays
// on "מי רואה שכר". The owner also adds a role the business names (R11a),
// which shows with nobody in it and is removed, with its undo, and gives it
// to a worker from the team screen, where the roles screen then counts them
// (R11b), and "מי רואה שכר" offers them access of their own even where
// workers see pay, since a named role never does by role (R11e). It
// runs in a real business of its own (e2e/db.ts), every rule on its default,
// made afresh for each test and gone after, so nothing here depends on what
// another spec did to a demo business's rules, at every screen size.

const OWNER = ROLES_PEOPLE.owner;
const MANAGER = ROLES_PEOPLE.manager;
const WORKER = ROLES_PEOPLE.worker;
const SENIOR = ROLES_SENIOR;

const r = he.app.manage.roles;
const access = he.app.manage.access;
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
    // The owner adds roles the business names (R11a).
    await expect(
      page.getByRole("button", { name: r.add }).filter({ visible: true }),
    ).toBeVisible();
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
    // Fixing closed lists (L6b-2) is granted with a raise to edit, which
    // covers it, so lowering lists again leaves no row.
    await expect.poll(rolesRules).toEqual([
      { role: "worker", perm: "lists.fix", allowed: true },
      { role: "worker", perm: "lists.manage", allowed: true },
      { role: "worker", perm: "lists.send", allowed: true },
    ]);
    // The log names the owner who switched it.
    await expect.poll(rolesLogActors).toEqual([OWNER.id, OWNER.id, OWNER.id]);
    await expectCleanPage(page);

    // The worker now runs the lists: their templates open.
    await worker.goto("/lists/templates");
    await expect(worker).toHaveURL(/\/lists\/templates$/);
    await expect(title(worker, he.app.lists.templates.title)).toBeVisible();
  } finally {
    await worker.context().close();
  }
});

// The roles plan's R10 (Orel, 16 November 2026): a change marks its area
// "שונה" against where the role started, the role's people hear of it in the
// app alone, and "חזרה להתחלה" puts every such area back with one toast and
// its undo; back where it began, the line goes.
test('a change is marked "שונה" and told to the role\'s people in the app, and "חזרה להתחלה" puts it back', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const lists = he.modules.lists.name;
  const marks = page
    .getByRole("main")
    .getByText(r.changed, { exact: true })
    .filter({ visible: true });
  const reset = page
    .getByRole("main")
    .getByRole("button", { name: new RegExp(`^${literal(r.reset.action)}`) })
    .filter({ visible: true });
  const told = [{ who: WORKER.id, area: "lists", read: false, push: "none" }];
  const worker = await secondPage(browser, testInfo);
  try {
    await signIn(page, OWNER);
    await page.goto("/manage/roles");
    await expect(title(page, r.title)).toBeVisible();
    // On the defaults nothing differs from where it started.
    await expect(marks).toHaveCount(0);
    await expect(reset).toHaveCount(0);

    await openRole(page, roles.worker, project);
    await editSwitch(page, lists, roles.worker).click();
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
    // Workers' lists differ now: marked, with the way back.
    await expect(marks).toHaveCount(1);
    await expect(reset).toHaveCount(1);
    await expect(shown(page, r.reset.hintBase)).toBeVisible();
    // The worker hears it in the app alone; the manager and the owner don't.
    await expect.poll(rolesLines).toEqual(told);
    await signIn(worker, WORKER);
    await worker.goto("/notifications");
    await expect(
      shown(
        worker,
        heT("app.notifications.kinds.role.changed.title", {
          role: roles.worker,
        }),
      ),
    ).toBeVisible();
    await expect(
      shown(
        worker,
        heT("app.notifications.kinds.role.changed.editWith", {
          area: lists,
          extras: r.extras.lists.send.phrase,
        }),
      ),
    ).toBeVisible();

    // Back to the start: one write, one toast, and neither mark nor line left.
    await reset.click();
    const back = heT("app.manage.roles.done.reset", { role: roles.worker });
    await expect(toast(page, back)).toBeVisible();
    await expect(marks).toHaveCount(0);
    await expect.poll(rolesRules).toEqual([]);
    await expect.poll(rolesLines).toEqual([]);
    // Its control went with what it did: the keyboard is on the way back.
    await expect(
      toast(page, back).getByRole("button", { name: he.app.manage.undo }),
    ).toBeFocused();
    await expectCleanPage(page);

    // Its undo puts the change back, the line with it.
    await toast(page, back)
      .getByRole("button", { name: he.app.manage.undo })
      .click();
    await expect(toast(page, r.done.undone)).toBeVisible();
    await expect(marks).toHaveCount(1);
    await expect.poll(rolesRules).toEqual([
      { role: "worker", perm: "lists.fix", allowed: true },
      { role: "worker", perm: "lists.manage", allowed: true },
      { role: "worker", perm: "lists.send", allowed: true },
    ]);
    await expect.poll(rolesLines).toEqual(told);
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

/**
 * A role on the screen, as each size shows it: its row in the list on a phone
 * and a tablet, its column's head on a computer.
 */
const roleShown = (page: Page, role: string, project: string) =>
  project === "desktop"
    ? page
        .getByRole("main")
        .getByRole("columnheader", { name: new RegExp(`^${literal(role)}`) })
        .filter({ visible: true })
    : page
        .getByRole("main")
        .getByRole("button", { name: new RegExp(`^${literal(role)}`) })
        .filter({ visible: true });

test("the owner adds a role built on workers and copied from them, with nobody in it yet, and removes it", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  const name = "אחראי משמרת";
  const sheet = r.addSheet;
  await signIn(page, OWNER);
  await page.goto("/manage/roles");
  await expect(title(page, r.title)).toBeVisible();

  await page
    .getByRole("button", { name: r.add })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog", { name: sheet.title });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(sheet.name).fill(name);
  // Built on a worker, its permissions copied from workers, as the sheet
  // starts.
  await expect(
    dialog.getByRole("radio", {
      name: new RegExp(`^${literal(roles.worker)}`),
    }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("button", { name: `${sheet.copy}: ${roles.worker}` }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: sheet.submit }).click();
  await expect(dialog).toBeHidden();
  await expect(
    toast(page, heT("app.manage.roles.done.added", { name })),
  ).toBeVisible();
  // As workers are, with no rule of its own, and nobody holds it.
  await expect
    .poll(rolesNamed)
    .toEqual([{ name, base: "worker", archived: false, rules: 0, people: 0 }]);

  const added = roleShown(page, name, project);
  await expect(added).toBeVisible();
  await expect(added).toContainText(
    heT("app.manage.roles.builtOn", { role: roles.worker }),
  );
  await expect(added).toContainText(
    heT("app.manage.roles.people", { count: 0 }),
  );
  await expectCleanPage(page);

  // Nobody holds it: it leads to the team screen, which gives it (R11b).
  await openRole(page, name, project);
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: r.emptyRole })
      .filter({ visible: true })
      .last(),
  ).toHaveAttribute("href", "/team");

  // Removed, and back with its undo.
  if (project === "desktop") {
    await page
      .getByRole("main")
      .getByRole("button", {
        name: heT("app.manage.roles.named.archiveLabel", { role: name }),
      })
      .click();
  } else {
    await page
      .getByRole("main")
      .getByRole("button", {
        name: new RegExp(`^${literal(r.named.archive)}`),
      })
      .filter({ visible: true })
      .click();
  }
  const archived = heT("app.manage.roles.done.archived", { name });
  await expect(toast(page, archived)).toBeVisible();
  await expect(roleShown(page, name, project)).toHaveCount(0);
  // What was pressed went with the role: the keyboard is on the way back
  // (on a phone the list's title takes it first, as its screen closes).
  if (project !== "phone") {
    await expect(
      toast(page, archived).getByRole("button", { name: he.app.manage.undo }),
    ).toBeFocused();
  }
  await expect
    .poll(rolesNamed)
    .toEqual([{ name, base: "worker", archived: true, rules: 0, people: 0 }]);
  await toast(page, archived)
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(
    toast(page, heT("app.manage.roles.done.restored", { name })),
  ).toBeVisible();
  await expect(roleShown(page, name, project)).toBeVisible();
  await expect
    .poll(rolesNamed)
    .toEqual([{ name, base: "worker", archived: false, rules: 0, people: 0 }]);
});

/** The role row on a person's page, which opens the sheet. */
const roleRow = (page: Page) =>
  page.getByRole("button", {
    name: new RegExp(`^${literal(he.app.team.changes.role)}`),
  });

test("the owner adds a shift lead on workers, makes a worker one from the team, the role shows them, and who sees pay offers them", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const name = "אחראי משמרת";
  const sheet = r.addSheet;
  await signIn(page, OWNER);
  await page.goto("/manage/roles");
  await expect(title(page, r.title)).toBeVisible();
  await page
    .getByRole("button", { name: r.add })
    .filter({ visible: true })
    .click();
  const adding = page.getByRole("dialog", { name: sheet.title });
  await adding.getByLabel(sheet.name).fill(name);
  // Built on a worker, from workers' permissions, as the sheet starts.
  await adding.getByRole("button", { name: sheet.submit }).click();
  await expect(adding).toBeHidden();
  await expect
    .poll(rolesNamed)
    .toEqual([{ name, base: "worker", archived: false, rules: 0, people: 0 }]);

  // The worker's page offers it in their role's sheet, after workers.
  await page.goto(`/team/${WORKER.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: WORKER.name }),
  ).toBeVisible();
  await expect(roleRow(page)).toContainText(roles.worker);
  await roleRow(page).click();
  const choosing = page.getByRole("dialog");
  const lead = choosing.getByRole("radio", {
    name: new RegExp(`^${literal(name)}`),
  });
  await expect(lead).toHaveCount(1);
  await expect(
    choosing.getByText(
      heT("app.team.invite.namedHint", { role: roles.worker }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);
  await lead.check();
  await choosing
    .getByRole("button", { name: he.app.team.changes.roleSubmit })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    shown(
      page,
      heT("app.team.changes.roleChanged", { name: WORKER.name, role: name }),
    ),
  ).toBeVisible();
  await expect(roleRow(page)).toContainText(name);
  await expect
    .poll(() => rolesPlace(WORKER.id))
    .toEqual({ role: "worker", named: name });

  // The team screen names it, with what it is built on.
  await page.goto("/team");
  await expect(
    shown(page, heT("app.team.namedRole", { name, role: roles.worker })),
  ).toBeVisible();
  await expectCleanPage(page);

  // The roles screen counts them in it, and no longer among the workers.
  await page.goto("/manage/roles");
  await expect(roleShown(page, name, project)).toContainText(
    heT("app.manage.roles.people", { count: 1 }),
  );
  await expect
    .poll(rolesNamed)
    .toEqual([{ name, base: "worker", archived: false, rules: 0, people: 1 }]);
  await expect(roleShown(page, roles.worker, project)).toContainText(
    heT("app.manage.roles.people", { count: 0 }),
  );

  // Workers see pay, and a role the business named never does by role
  // (R11e): who sees pay counts the owner alone, says why, and offers the
  // shift lead personal access, by the role's name.
  await setRolesPayRole("worker", true);
  await page.goto("/manage/access");
  await expect(title(page, access.title)).toBeVisible();
  await expect(
    page.getByRole("switch", { name: access.roles.worker }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    shown(page, heT("app.manage.access.count", { count: 1 })),
  ).toBeVisible();
  await expect(
    shown(
      page,
      heT("app.manage.access.namedRoles", { role: name, base: "worker" }),
    ),
  ).toBeVisible();
  await expect(
    shown(
      page,
      heT("app.manage.access.namedRolesAdd", { add: access.personal.add }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);
  await page
    .getByRole("button", {
      name: `${heT("app.manage.access.personal.addLabel", { add: access.personal.add })}: ${access.personal.choose}`,
    })
    .click();
  await expect(
    page.getByRole("menuitemradio", {
      name: `${WORKER.name} · ${heT("app.team.namedRole", { name, role: roles.worker })}`,
    }),
  ).toBeVisible();
});

/** "תיקון הרשימה", wherever the list's screen shows it. */
const fixButton = (page: Page) =>
  page
    .getByRole("button", { name: he.app.lists.list.fix.action, exact: true })
    .filter({ visible: true });

/** A sentence's words before its first tag or value, as the screen starts it. */
const opening = (text: string) => text.split(/[<{]/)[0] ?? text;

// Orel's case (L6b-2; 16 November 2026): "עובד בכיר", a role the business
// named on workers, keeps lists at view and is given "תיקון רשימות שנסגרו"
// on its own. A list to every worker, which a plain worker closes for all,
// the senior fixes afterwards, with who fixed it in view of everyone it is
// for; the worker has no way to fix it. The toast and the line to the
// role's people say the switch alone. Switched off, the senior's way goes;
// with lists' edit on, the switch is held, on and locked, "כלול בעריכה".
test("a role given fixing closed lists at view fixes a list a worker closed, and edit covers it", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const project = testInfo.project.name;
  const lists = he.modules.lists.name;
  const l = he.app.lists.list;
  const name = "עובד בכיר";
  const listName = "פתיחת מטבח";
  const label = "מקרר";
  await addRolesSenior(name);
  // The worker closes it with 30°C, ten minutes back.
  const id = await rolesClosedList(listName, label, 30, WORKER.id, 10);
  const fix = extraSwitch(page, r.extras.lists.fix.label, name);
  const named = (rules: number) => [
    { name, base: "worker", archived: false, rules, people: 1 },
  ];
  const senior = await secondPage(browser, testInfo);
  const worker = await secondPage(browser, testInfo);
  try {
    // As workers are: the list is the senior's to read, not to fix.
    await signIn(senior, SENIOR);
    await senior.goto(`/lists/${id}`);
    await expect(title(senior, listName)).toBeVisible();
    await expect(fixButton(senior)).toHaveCount(0);

    await signIn(page, OWNER);
    await page.goto("/manage/roles");
    await expect(title(page, r.title)).toBeVisible();
    await openRole(page, name, project);
    await expect(editSwitch(page, lists, name)).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(fix).toHaveAttribute("aria-checked", "false");
    await expect(fix).toBeEnabled();
    await fix.click();
    await expect(fix).toHaveAttribute("aria-checked", "true");
    await expect(
      toast(
        page,
        heT("app.manage.roles.done.extraOn", {
          role: name,
          extra: r.extras.lists.fix.phrase,
        }),
      ),
    ).toBeVisible();
    // One rule of its own, and its person hears of it in the app alone.
    await expect.poll(rolesNamed).toEqual(named(1));
    await expect
      .poll(rolesLines)
      .toEqual([{ who: SENIOR.id, area: "lists", read: false, push: "none" }]);
    await expectCleanPage(page);

    // The senior fixes the reading the worker closed with, for a day.
    await senior.goto(`/lists/${id}`);
    const hero = senior
      .getByRole("main")
      .getByRole("region", { name: l.progressLabel });
    await expect(hero).toContainText(WORKER.name);
    await expect(hero).toContainText(opening(l.fix.until));
    await fixButton(senior).click();
    const card = senior
      .getByRole("main")
      .getByRole("region", { name: l.fix.title });
    await expect(card).toContainText(WORKER.name);
    await expect(
      card.getByRole("button", { name: l.fix.reopenAll }),
    ).toHaveCount(0);
    const reading = senior.getByLabel(
      heT("app.lists.list.readingOf", { label }),
    );
    await reading.fill("3");
    await reading.press("Enter");
    await expect.poll(async () => (await rolesList(id))?.reading).toBe(3);
    await senior
      .getByRole("button", { name: l.fix.done, exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      senior.getByRole("status").filter({ hasText: l.fix.saved }),
    ).toBeVisible();
    await expectCleanPage(senior);
    // Still the worker's close, the fix the senior's.
    expect(await rolesList(id)).toEqual({
      status: "finished",
      finishedBy: WORKER.id,
      reading: 3,
      fixes: 1,
      fixedBy: SENIOR.id,
    });

    // The worker reads who fixed it, with no way to fix.
    await signIn(worker, WORKER);
    await worker.goto(`/lists/${id}`);
    await expect(
      worker.getByRole("main").getByRole("region", { name: l.progressLabel }),
    ).toContainText(opening(he.app.lists.card.fixed));
    await expect(fixButton(worker)).toHaveCount(0);
    await expect(
      worker
        .getByRole("main")
        .getByText(l.fix.item)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      worker
        .getByRole("main")
        .getByText(SENIOR.name)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    // Switched off: the role is as workers are again, and the senior's way
    // goes.
    await fix.click();
    await expect(fix).toHaveAttribute("aria-checked", "false");
    await expect(
      toast(
        page,
        heT("app.manage.roles.done.extraOff", {
          role: name,
          extra: r.extras.lists.fix.phrase,
        }),
      ),
    ).toBeVisible();
    await expect.poll(rolesNamed).toEqual(named(0));
    await senior.goto(`/lists/${id}`);
    await expect(title(senior, listName)).toBeVisible();
    await expect(fixButton(senior)).toHaveCount(0);

    // With lists' edit on, edit covers it: on, locked, and said; the toast
    // says what raising lists always said.
    await editSwitch(page, lists, name).click();
    await expect(
      toast(
        page,
        heT("app.manage.roles.done.editWith", {
          role: name,
          area: lists,
          extras: r.extras.lists.send.phrase,
        }),
      ),
    ).toBeVisible();
    await expect(fix).toHaveAttribute("aria-checked", "true");
    await expect(fix).toBeDisabled();
    await expect(shown(page, r.coveredByEdit)).toBeVisible();
    await expect.poll(rolesNamed).toEqual(named(3));
    await expectCleanPage(page);
  } finally {
    await senior.context().close();
    await worker.context().close();
  }
});
