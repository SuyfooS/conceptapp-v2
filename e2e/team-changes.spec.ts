import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  closeTeamChangesBusiness,
  closeTeamChangesToInvites,
  openTeamChangesBusiness,
  openTeamChangesOther,
  removeTeamChangesWorker,
  TEAM_CHANGES_BUSINESS,
  TEAM_CHANGES_INVITE,
  TEAM_CHANGES_OTHER,
  TEAM_CHANGES_PEOPLE,
  type TeamChangesWeek,
  teamChangesInviteCancelled,
  teamChangesLineCount,
  teamChangesLines,
  teamChangesPlace,
  teamChangesRemovals,
  teamChangesShifts,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// Team changes (Orel, 14 November 2026, issue #1): whoever may invite to a
// role takes someone off the team from it and changes it; the shifts still to
// start come off whoever leaves, show as missing, and the schedule's other
// builders hear of it; the person is told nothing, and next time reads that
// they are no longer on the team, with no business left or above another
// one, whichever was open. A demo business keeps its people, so this runs in
// a real business of its own (e2e/db.ts), made afresh for each test and gone
// after, at every screen size; one test makes it a demo to check exactly
// that.

const OWNER = TEAM_CHANGES_PEOPLE.owner;
const MANAGER = TEAM_CHANGES_PEOPLE.manager;
const LEAVING = TEAM_CHANGES_PEOPLE.leaving;
const STAYING = TEAM_CHANGES_PEOPLE.staying;

const tt = he.app.team;
const tc = tt.changes;
/** How long a held write waits for "ביטול" (app/(app)/use-held-write.ts). */
const HOLD_MS = 8_000;
/** Their first name, as the person page's sentences use it. */
const first = (name: string) => name.split(" ")[0] ?? name;
/** The words before a sentence's first argument, for matching it. */
const before = (message: string) => message.split(/[<{]/)[0] ?? message;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A role in the role sheet, by its value: its name holds its hint too. */
const roleChoice = (page: Page, role: string) =>
  page
    .getByRole("dialog")
    .locator(`input[name="member-role"][value="${role}"]`);

/** The role row on a person's page, which opens the sheet. */
const roleRow = (page: Page) =>
  page.getByRole("button", { name: new RegExp(`^${literal(tc.role)}`) });

/** What is on the screen now: each screen size has its own shapes. */
const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();

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

let week: TeamChangesWeek;

test.beforeEach(async () => {
  week = await openTeamChangesBusiness();
});

test.afterEach(async () => {
  await closeTeamChangesBusiness();
});

test("the owner changes a role, takes a worker off the team with an undo, and deletes an invite", async ({
  page,
  browser,
}, testInfo) => {
  // The holds wait eight seconds each before they are written, and the
  // undos are checked past them.
  test.setTimeout(150_000);
  await signIn(page, OWNER);

  // A role written at once, with the change back as its undo.
  await page.goto(`/team/${STAYING.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: STAYING.name }),
  ).toBeVisible();
  await expect(roleRow(page)).toContainText(tt.roles.worker);
  await expectCleanPage(page);
  await roleRow(page).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("heading", {
      name: heT("app.team.changes.roleSheet", { name: first(STAYING.name) }),
    }),
  ).toBeVisible();
  // An owner gives every role; the one they have is chosen.
  for (const role of ["owner", "manager", "worker", "accountant"] as const) {
    await expect(roleChoice(page, role)).toHaveCount(1);
  }
  await expect(roleChoice(page, "worker")).toBeChecked();
  await expectCleanPage(page);
  await roleChoice(page, "manager").check();
  await sheet.getByRole("button", { name: tc.roleSubmit }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const changed = heT("app.team.changes.roleChanged", {
    name: STAYING.name,
    role: tt.roles.manager,
  });
  await expect(shown(page, changed)).toBeVisible();
  await expect(roleRow(page)).toContainText(tt.roles.manager);
  await expect
    .poll(async () => (await teamChangesPlace(STAYING.id))?.role)
    .toBe("manager");
  await page
    .getByRole("status")
    .filter({ hasText: changed })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect
    .poll(async () => (await teamChangesPlace(STAYING.id))?.role)
    .toBe("worker");
  await expect(roleRow(page)).toContainText(tt.roles.worker);

  // Taking someone off the team: held for its undo, which keeps them.
  await page.goto(`/team/${LEAVING.id}`);
  const remove = page.getByRole("button", { name: tc.remove });
  await expect(remove).toBeVisible();
  // What it does, said before it is pressed: one shift ahead comes off.
  await expect(
    shown(page, heT("app.team.changes.removeShifts", { count: 1 })),
  ).toBeVisible();
  await remove.click();
  const removed = heT("app.team.changes.removed", {
    name: LEAVING.name,
    form: "x",
  });
  const undoRow = page.getByRole("status").filter({ hasText: removed });
  await expect(undoRow).toBeVisible();
  await expect(remove).toHaveCount(0);
  // "ביטול" at once, well inside the hold, however slow the runner: the
  // page's checks wait for the real removal below.
  await undoRow.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(remove).toBeVisible();
  // Past the hold: the write it let go of was never sent.
  await page.waitForTimeout(HOLD_MS + 1_000);
  expect(await teamChangesPlace(LEAVING.id)).toMatchObject({ active: true });
  expect(await teamChangesRemovals(LEAVING.id)).toBe(0);

  // For real this time: once the hold ends, the page says what came off them.
  await remove.click();
  await expect(undoRow).toBeVisible();
  // The held state's checks; should they outlast the hold, the removal is
  // sent meanwhile, as it would be.
  await expectCleanPage(page);
  const done = page.getByRole("heading", {
    name: heT("app.team.changes.removedTitle", { name: LEAVING.name }),
  });
  await expect(done).toBeVisible({ timeout: 20_000 });
  await expect(
    shown(page, heT("app.team.changes.removedShifts", { count: 1 })),
  ).toBeVisible();
  // Their place is kept, inactive; the shift ahead came off them; the log
  // says it once.
  expect(await teamChangesPlace(LEAVING.id)).toEqual({
    role: "worker",
    active: false,
    left: true,
  });
  expect(await teamChangesShifts(LEAVING.id)).toBe(0);
  expect(await teamChangesRemovals(LEAVING.id)).toBe(1);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-removed.png"),
    fullPage: true,
  });

  // Back on the team, they are gone from it; opened again, their page says
  // they are no longer on the team, by name to the owner, who holds pay.
  await page.getByRole("link", { name: tc.backToTeam }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole("main")).not.toContainText(LEAVING.name);
  await page.goto(`/team/${LEAVING.id}`);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: heT("app.team.former.named", { name: LEAVING.name }),
      exact: true,
    }),
  ).toBeVisible();
  await expectCleanPage(page);

  // An invite deleted: its row goes with an undo, then its link stops.
  const link = `/join/${week.token}`;
  const visitor = await secondPage(browser, testInfo);
  try {
    await visitor.goto(link);
    await expect(
      visitor.getByRole("heading", {
        level: 1,
        name: heT("auth.join.title", { business: TEAM_CHANGES_BUSINESS.name }),
      }),
    ).toBeVisible();

    await page.goto("/team");
    const deleteInvite = page
      .getByRole("button", {
        name: heT("app.team.cancel.label", { name: TEAM_CHANGES_INVITE.name }),
      })
      .filter({ visible: true });
    await expect(deleteInvite).toHaveCount(1);
    await expectCleanPage(page);
    const deleted = heT("app.team.cancel.done", {
      name: TEAM_CHANGES_INVITE.name,
    });
    const inviteUndo = page
      .getByRole("status")
      .filter({ hasText: deleted })
      .filter({ visible: true });
    // "ביטול" at once keeps it: past the hold, the invite is still open.
    await deleteInvite.click();
    await expect(inviteUndo).toBeVisible();
    await expect(deleteInvite).toHaveCount(0);
    await inviteUndo.getByRole("button", { name: he.app.manage.undo }).click();
    await expect(deleteInvite).toHaveCount(1);
    await page.waitForTimeout(HOLD_MS + 1_000);
    expect(await teamChangesInviteCancelled()).toBe(false);

    await deleteInvite.click();
    await expect(inviteUndo).toBeVisible();
    await expect(deleteInvite).toHaveCount(0);
    await expectCleanPage(page);
    // Leaving the screen inside the app writes it, as the hold ending would.
    await page
      .getByRole("link", { name: new RegExp(literal(STAYING.name)) })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/team/${STAYING.id}$`));
    await expect.poll(teamChangesInviteCancelled).toBe(true);

    await visitor.goto(link);
    await expect(
      visitor.getByRole("heading", {
        level: 1,
        name: he.auth.join.gone.missing.title,
      }),
    ).toBeVisible();
    await page.goto("/team");
    await expect(page.getByRole("main")).not.toContainText(
      TEAM_CHANGES_INVITE.name,
    );
  } finally {
    await visitor.context().close();
  }
});

test("whoever left loses the business, and the manager hears of the shift that needs someone", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  await removeTeamChangesWorker();

  // Told nothing then, of any kind, while the manager was told; next time
  // in, which business they are no longer on the team of.
  expect(await teamChangesLineCount(LEAVING.id)).toBe(0);
  expect(await teamChangesLines(MANAGER.id, "schedule.unfilled")).not.toEqual(
    [],
  );
  const left = heT("app.noBusiness.left.title", {
    business: TEAM_CHANGES_BUSINESS.name,
  });
  await signIn(page, LEAVING);
  await expect(
    page.getByRole("heading", { level: 1, name: left }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(
    before(he.app.noBusiness.body),
  );
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-left.png"),
    fullPage: true,
  });
  // Every screen of the app says the same: nothing of it is theirs now.
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { level: 1, name: left }),
  ).toBeVisible();

  const manager = await secondPage(browser, testInfo);
  try {
    await signIn(manager, MANAGER);
    // The shift that came off them waits for someone, on the board.
    await manager.goto("/schedule");
    const morning = manager
      .getByRole("region", {
        name: new RegExp(`^${literal(before(he.app.shifts.shift))}בוקר`),
      })
      .filter({ visible: true })
      .first();
    await expect(morning).toContainText(
      heT("app.shifts.board.missing", { count: 1 }),
    );
    await expect(morning).not.toContainText(LEAVING.name);
    await expectCleanPage(manager);

    // How many, in which week, never who.
    const [line] = await teamChangesLines(MANAGER.id, "schedule.unfilled");
    expect(line).toMatchObject({ startsOn: week.startsOn, count: 1 });
    expect(JSON.stringify(line)).not.toContain(LEAVING.id);
    await manager.goto("/notifications");
    const title = heT("app.notifications.kinds.schedule.unfilled.title", {
      count: 1,
      date: week.date,
    });
    const unfilled = manager
      .getByRole("button", { name: new RegExp(literal(title)) })
      .filter({ visible: true })
      .first();
    await expect(unfilled).toBeVisible();
    // Next week's: it is filled from the builder.
    await expect(unfilled).toContainText(
      heT("app.notifications.kinds.schedule.unfilled.note", { count: 1 }),
    );
    await expect(
      manager.getByRole("main").filter({ visible: true }),
    ).not.toContainText(LEAVING.name);
    await expectCleanPage(manager);
    await manager.screenshot({
      path: testInfo.outputPath("team-unfilled.png"),
      fullPage: true,
    });

    // Their page says they are no longer on the team, without their name:
    // the manager holds no pay access here.
    await manager.goto(`/team/${LEAVING.id}`);
    await expect(
      manager.getByRole("heading", {
        level: 1,
        name: tt.former.title,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      manager.getByRole("main").filter({ visible: true }),
    ).not.toContainText(LEAVING.name);

    // A manager acts on workers and managers, never on an owner.
    await manager.goto(`/team/${OWNER.id}`);
    await expect(
      manager.getByRole("heading", { level: 1, name: OWNER.name }),
    ).toBeVisible();
    await expect(manager.getByRole("button", { name: tc.remove })).toHaveCount(
      0,
    );
    await expect(roleRow(manager)).toHaveCount(0);
    await manager.goto(`/team/${STAYING.id}`);
    await expect(
      manager.getByRole("button", { name: tc.remove }),
    ).toBeVisible();
    await roleRow(manager).click();
    await expect(manager.getByRole("dialog")).toBeVisible();
    // Only an owner gives an owner's or an accountant's place.
    await expect(roleChoice(manager, "owner")).toHaveCount(0);
    await expect(roleChoice(manager, "accountant")).toHaveCount(0);
    await expect(roleChoice(manager, "manager")).toHaveCount(1);
    await expect(roleChoice(manager, "worker")).toBeChecked();
    await expectCleanPage(manager);
  } finally {
    await manager.context().close();
  }
});

test("someone still in another business is told once, above it, whichever was open", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(90_000);
  // The leaving worker also keeps the books of a second business, and has
  // that one open when they are taken off the first team: nothing of the
  // business they left is open, and it is said all the same.
  await openTeamChangesOther();
  await signIn(page, LEAVING);
  await page
    .context()
    .addCookies([
      { name: "ca_business", value: TEAM_CHANGES_OTHER.id, url: baseURL ?? "" },
    ]);
  await page.goto("/home");
  const notice = page.getByRole("complementary", {
    name: he.app.departure.label,
  });
  await expect(page.getByRole("main")).toBeVisible();
  await expect(notice).toHaveCount(0);

  await removeTeamChangesWorker();
  await page.reload();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    heT("app.departure.title", { business: TEAM_CHANGES_BUSINESS.name }),
  );
  await expect(notice).toContainText(
    heT("app.departure.body", {
      business: TEAM_CHANGES_BUSINESS.name,
      current: TEAM_CHANGES_OTHER.name,
    }),
  );
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("team-left-other.png"),
    fullPage: true,
  });

  // Seen: said once on this device, not again on the next screen.
  await notice.getByRole("button", { name: he.app.departure.seen }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  // The notice comes before the screen's own content, so once that is in,
  // it would be too.
  await expect(page.getByRole("main")).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("a demo business closed to invites keeps its people: nothing to change on a page", async ({
  page,
}) => {
  await closeTeamChangesToInvites();
  await signIn(page, OWNER);
  await page.goto(`/team/${STAYING.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: STAYING.name }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: tc.remove })).toHaveCount(0);
  await expect(roleRow(page)).toHaveCount(0);
  await page.goto("/team");
  await expect(
    page.getByRole("button", {
      name: new RegExp(`^${literal(tt.cancel.action)}`),
    }),
  ).toHaveCount(0);
});
