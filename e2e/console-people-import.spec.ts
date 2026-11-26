import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { HOLD_MS } from "./build-screen";
import { CAPTCHA_FRAME } from "./captcha";
import {
  CONSOLE_IMPORT,
  type ConsoleImportBusiness,
  closeConsoleImportBusiness,
  consoleImportRole,
  importLog,
  invitesIn,
  notificationsIn,
  openConsoleImportBusiness,
} from "./db";
import { secondPage, signIn } from "./session";
import { codesSince, lastCodeId } from "./sms";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// "הוספת אנשים מרשימה" (inviting from a list, part 4; Orel, 25 November
// 2026: the ConceptApp team pastes first, in the console, at setup). The
// seeded platform admin pastes a business's sheet: a line to fix holds it,
// the owner's own line and the accountant's waiting invite are left out, a
// number on the demo restaurant's staff refuses the list until its line
// goes, and then the five are saved at once with no link, nobody told. The
// list taken back cancels them; pasted again, it is read against the
// invites it made. The owner then finds them on /team, under "עוד לא קיבלו
// קישור". A demo business never takes invites here, so each screen size
// opens a real business of its own (e2e/db.ts) through the wizard's own
// function, and takes it away after.

type Size = keyof typeof CONSOLE_IMPORT;

const PLATFORM_ADMIN = { local: "050-000-0005", e164: "+972500000005" };
/** The demo restaurant's worker (supabase/seed.sql): on another business's staff. */
const ON_THE_RESTAURANT = { name: "רון מהמסעדה", local: "050-000-0003" };
const NO_NUMBER = "ליאור בלי נייד";

const a = he.admin;
const i = he.app.team.import;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function expectCleanPage(page: Page) {
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page })
    .exclude(CAPTCHA_FRAME)
    .analyze();
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

/** The business's sheet as copied from Excel: a header, an ID column, and what each line is for. */
function sheetOf(business: ConsoleImportBusiness, withFixes: boolean): string {
  const row = (...cells: string[]) => cells.join("\t");
  return [
    row("שם", "נייד", "ת.ז.", "תפקיד"),
    // The owner's own line: on the team already.
    row(business.owner.name, business.owner.local, "000000018", "בעלים"),
    // The wizard's accountant: an invite that is never changed by a list.
    row(business.accountant.name, business.accountant.local, "000000026", ""),
    ...business.people.map((person, at) =>
      row(
        person.name,
        person.local,
        `00000003${at}`,
        person.role === "manager" ? "ניהול" : "",
      ),
    ),
    ...(withFixes
      ? [
          row(ON_THE_RESTAURANT.name, ON_THE_RESTAURANT.local, "000000059", ""),
          row(NO_NUMBER, "", "000000067", ""),
        ]
      : []),
  ].join("\n");
}

test("the console pastes a business's list: to fix, left out, refused for another staff, saved with no link, taken back and read again", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const business = CONSOLE_IMPORT[testInfo.project.name as Size];
  const listed = [...business.people, business.accountant, business.owner];
  // What each of the list's numbers was ever sent, from before anything here.
  const before = new Map<string, number>();
  for (const person of listed) {
    before.set(person.e164, await lastCodeId(person.e164));
  }
  const sentNothing = async (people: readonly { e164: string }[]) => {
    for (const person of people) {
      expect(
        await codesSince(person.e164, before.get(person.e164) ?? 0),
        person.e164,
      ).toBe(0);
    }
    expect(await notificationsIn(business)).toBe(0);
  };

  await openConsoleImportBusiness(business);
  try {
    await signIn(page, PLATFORM_ADMIN, /\/admin$/);
    await page.goto(`/admin/businesses/${business.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: business.name }),
    ).toBeVisible();
    const importHref = `/admin/businesses/${business.slug}/people/import`;
    // The checklist's staff item leads to the list; the owner's is done.
    await expect(
      page
        .getByRole("link", {
          name: new RegExp(literal(a.setup.checklist.items.staff.title)),
        })
        .filter({ visible: true }),
    ).toHaveAttribute("href", importHref);
    await page
      .getByRole("link", { name: a.setup.people.import, exact: true })
      .filter({ visible: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${literal(importHref)}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: a.peopleImport.title }),
    ).toBeVisible();
    // The owner on the team, the accountant's invite waiting.
    await expect(
      page.getByText(
        heT("app.team.import.existing", { members: 1, invites: 1 }),
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("console-import-1-empty.png"),
      fullPage: true,
    });

    // The sheet, with a line on another staff and a line with no number.
    const field = page.getByRole("textbox", {
      name: i.paste.label,
      exact: true,
    });
    await field.fill(sheetOf(business, true));
    const submit = (count: number) =>
      page.getByRole("button", {
        name: heT("app.team.import.submit", { count }),
        exact: true,
      });
    const blocked = heT("app.team.import.status.blocked", { count: 1 });
    await expect(submit(6)).toBeDisabled();
    await expect(submit(6)).toHaveAccessibleDescription(blocked);
    // The ID column is read by nobody, and said so.
    await expect(
      page.getByText(
        heT("app.team.import.paste.ignored", { count: 1, names: "ת.ז." }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page
        .getByText(i.problem.noPhone, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    // The owner's own line ("בעלים") and the accountant's are left out,
    // never to fix.
    await expect(
      page.getByRole("button", {
        name: heT("app.team.import.fixLineFor", { line: "2" }),
        exact: true,
      }),
    ).toHaveCount(0);
    if (testInfo.project.name !== "desktop") {
      await page
        .getByRole("button", { name: new RegExp(literal(i.groups.show)) })
        .click();
    }
    await expect(
      page
        .getByText(i.outcome.member, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      page
        .getByText(
          heT("app.team.import.outcome.otherRole", { role: "הנהלת חשבונות" }),
          { exact: true },
        )
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("console-import-2-to-fix.png"),
      fullPage: true,
    });

    // "תיקון השורה" puts the caret at the line's end in the field.
    await page
      .getByRole("button", {
        name: heT("app.team.import.fixLineFor", { line: "10" }),
        exact: true,
      })
      .click();
    await expect(field).toBeFocused();
    expect(
      await field.evaluate((area: HTMLTextAreaElement) =>
        area.selectionStart === area.selectionEnd
          ? area.value.slice(0, area.selectionEnd).split("\n").at(-1)
          : null,
      ),
    ).toBe(`${NO_NUMBER}\t\t000000067\t`);

    // "הסרת השורה", and back with the toast's "ביטול", then out for good.
    const removeLine = (line: number) =>
      page.getByRole("button", {
        name: heT("app.team.import.removeLineFor", { line: String(line) }),
        exact: true,
      });
    await removeLine(10).click();
    await expect(field).not.toHaveValue(new RegExp(NO_NUMBER));
    // Its line number is held apart (`isolate`), so the words are matched
    // around it.
    const undo = page
      .getByRole("status")
      .filter({ hasText: /הוסרה מהרשימה/ })
      .getByRole("button", { name: i.undoRemove, exact: true });
    await expect(undo).toBeFocused();
    await undo.click();
    await expect(field).toHaveValue(new RegExp(NO_NUMBER));
    await expect(removeLine(10)).toBeFocused();
    await removeLine(10).click();
    await expect(field).not.toHaveValue(new RegExp(NO_NUMBER));
    await expect(submit(6)).toBeEnabled();
    await expect(invitesIn(business)).resolves.toHaveLength(1);

    // On the demo restaurant's staff: the list is refused whole, the line
    // marked, and its removal has the focus. Nothing was written.
    await submit(6).click();
    await expect(
      page.getByRole("alert").filter({
        hasText: heT("admin.peopleImport.errors.elsewhere", {
          count: 1,
          accountant: "הנהלת חשבונות",
        }),
      }),
    ).toBeVisible();
    await expect(
      page
        .getByText(a.peopleImport.problem.elsewhere, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expect(removeLine(9)).toBeFocused();
    await expect(submit(5)).toBeDisabled();
    expect(await invitesIn(business)).toHaveLength(1);
    expect(await importLog(business)).toEqual([]);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("console-import-3-elsewhere.png"),
      fullPage: true,
    });

    // Its line gone, the five go at once, and the done card says who.
    await removeLine(9).click();
    await expect(submit(5)).toBeEnabled();
    await submit(5).click();
    const done = page.getByRole("heading", {
      level: 2,
      name: heT("app.team.import.done.title", { count: 5 }),
    });
    await expect(done).toBeFocused();
    await expect(
      page.getByText(
        heT("app.team.import.done.more", { updated: 0, skipped: 2 }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(a.peopleImport.done.console, { exact: true }),
    ).toBeVisible();
    for (const person of business.people) {
      await expect(
        page.getByText(person.name, { exact: true }).filter({ visible: true }),
      ).toHaveCount(1);
    }
    // No link is made here: the owners send each one from /team.
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    await expect(page.getByText(/\/join\//)).toHaveCount(0);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("console-import-4-done.png"),
      fullPage: true,
    });

    // Each invite with no link, by the team, all of one import; the
    // accountant's as the wizard left it, the owner still the owner.
    const saved = await invitesIn(business);
    const first = saved.find((invite) => invite.importId)?.importId;
    expect(first).toEqual(expect.any(String));
    expect(saved).toEqual([
      {
        phone: business.accountant.e164,
        name: business.accountant.name,
        role: "accountant",
        pending: true,
        open: true,
        cancelled: false,
        importId: null,
        byTeam: true,
      },
      ...business.people.map((person) => ({
        phone: person.e164,
        name: person.name,
        role: person.role,
        pending: true,
        open: true,
        cancelled: false,
        importId: first,
        byTeam: true,
      })),
    ]);
    expect(await consoleImportRole(business, business.owner.e164)).toBe(
      "owner",
    );
    // One line in the log: counts and the import, never a name or a number.
    const log = await importLog(business);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: "invite.import",
      details: {
        import: first,
        created: 5,
        updated: 0,
        member: 1,
        kept: 1,
        by: "console",
        roles: { manager: 1, worker: 4 },
      },
    });
    const logged = JSON.stringify(log);
    for (const person of listed) {
      expect(logged).not.toContain(person.e164.slice(4));
      expect(logged).not.toContain(person.name);
    }
    // Saving them sent nothing to anyone.
    await sentNothing(listed);

    // Taken back, held for its "ביטול": the paste reads as new at once.
    await page
      .getByRole("button", { name: i.done.remove, exact: true })
      .click();
    const removed = heT("app.team.import.done.removed", { count: 5 });
    await expect(
      page.getByRole("status").filter({ hasText: removed }),
    ).toBeVisible();
    await expect(
      page.getByText(i.done.removedBack, { exact: true }),
    ).toBeVisible();
    await expect(submit(5)).toBeEnabled();
    // Its time up, the five are cancelled, kept as rows for the log.
    await expect(
      page.getByRole("status").filter({ hasText: removed }),
    ).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
    await expect
      .poll(async () =>
        (await invitesIn(business))
          .filter((invite) => invite.importId === first)
          .map((invite) => [invite.open, invite.cancelled]),
      )
      .toEqual(business.people.map(() => [false, true]));
    expect((await importLog(business)).at(-1)).toMatchObject({
      action: "invite.import_undo",
      details: { import: first, cancelled: 5, kept: 0, joined: 0 },
    });
    // Read again with the undo done, the paste still reads as new.
    await expect(submit(5)).toBeEnabled();

    // Invited again from the same paste, then the same list once more: it is
    // read against the invites just made, and nothing is new.
    await submit(5).click();
    await expect(done).toBeFocused();
    await page
      .getByRole("button", { name: i.done.another, exact: true })
      .click();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("");
    await field.fill(sheetOf(business, false));
    await expect(
      page.getByText(i.status.nothingNew, { exact: true }),
    ).toBeVisible();
    await expect(submit(0)).toBeDisabled();
    if (testInfo.project.name !== "desktop") {
      await page
        .getByRole("button", { name: new RegExp(literal(i.groups.show)) })
        .click();
    }
    await expect(
      page.getByText(i.outcome.same, { exact: true }).filter({ visible: true }),
    ).toHaveCount(5);
    const open = (await invitesIn(business)).filter(
      (invite) => invite.open && invite.role !== "accountant",
    );
    expect(open.map((invite) => invite.phone)).toEqual(
      business.people.map((person) => person.e164),
    );
    expect(open.every((invite) => invite.pending)).toBe(true);
    await sentNothing(listed);

    // The business's people say each one waits for the owners to send a
    // link, as the accountant's invite does.
    await page.goto(`/admin/businesses/${business.slug}`);
    await expect(
      page.getByRole("heading", { level: 1, name: business.name }),
    ).toBeVisible();
    await expect(
      page
        .getByText(a.setup.people.pending, { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(6);

    // The owner, on their own phone, finds them on /team, under "עוד לא
    // קיבלו קישור": the five and the accountant. Signing in is the owner's
    // own code alone.
    const theirs = await secondPage(browser, testInfo);
    try {
      await signIn(theirs, business.owner);
      await theirs.goto("/team");
      await expect(
        theirs.getByRole("heading", { level: 1, name: he.app.team.title }),
      ).toBeVisible();
      await expect(
        theirs
          .getByRole("main")
          .getByText(heT("app.team.pending.count", { count: 6 }), {
            exact: true,
          })
          .filter({ visible: true }),
      ).toHaveCount(1);
    } finally {
      await theirs.context().close();
    }
    await sentNothing([...business.people, business.accountant]);
  } finally {
    await closeConsoleImportBusiness(business);
  }
});
