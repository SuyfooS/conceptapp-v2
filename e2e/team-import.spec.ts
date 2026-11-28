import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { isolateName } from "../packages/domain/bidi";
import { shareText } from "../packages/domain/share";
import { announcer, heardSoFar, saidSince } from "./announcer";
import { HOLD_MS } from "./build-screen";
import { CAPTCHA_FRAME } from "./captcha";
import {
  closeTeamImportBusiness,
  importLog,
  invitesIn,
  notificationsIn,
  openTeamImportBusiness,
  pendingLinkStates,
  setTeamImportInvites,
  TEAM_IMPORT,
  type TeamImportBusiness,
  teamImportInvite,
} from "./db";
import { secondPage, signIn } from "./session";
import { codesSince, lastCodeId } from "./sms";
import { heT } from "./t";
import { expect, type Locator, type Page, test } from "./test";

// "הזמנה מרשימה" on the Team screen (inviting from a list, part 5; Orel, 25
// November 2026: owners and managers paste on /team, and each person's link
// is made at the moment of sending). The owner finds the import from /team
// and from the invite form, pastes a sheet with their own line, the
// wizard's manager and an invite whose link ran out among it, and saves
// three people at once with no link, nobody told. On the done screen each
// one's link is made, WhatsApp to their own number (read, never opened) or
// a copy, the focus on to the next person; the lapsed invite gets "קישור
// חדש". Taken back then, only the one with no link would go, and "ביטול"
// says so; a second list is taken back. Back on /team the rest still wait
// for their links. A manager's line naming the owner's role is for the
// owners alone, and a worker who edits the team can't name a manager. A
// demo never takes invites here, so each screen size opens a real business
// of its own (e2e/db.ts) through the wizard's own function, and takes it
// away after.
// No code reaches anyone on the lists: they are never sent anything.

type Size = keyof typeof TEAM_IMPORT;

const tt = he.app.team;
const i = he.app.team.import;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function expectCleanPage(page: Page) {
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect(page).toHaveTitle(/ConceptApp$/);
  // Cloudflare's "אני לא רובוט" box isn't the app's to fix.
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

/**
 * The owner's sheet, copied from a spreadsheet with its header: their own
 * line ("בעלים"), the wizard's manager with no role written, the invite
 * whose link ran out, and three new people, the second a manager.
 */
function sheetOf(business: TeamImportBusiness): string {
  const row = (...cells: string[]) => cells.join("\t");
  return [
    row("שם", "נייד", "תפקיד"),
    row(business.owner.name, business.owner.local, "בעלים"),
    row(business.wizard.name, business.wizard.local, ""),
    row(business.lapsed.name, business.lapsed.local, ""),
    ...business.people.map((person) =>
      row(person.name, person.local, person.role === "manager" ? "ניהול" : ""),
    ),
  ].join("\n");
}

/** What the role card says of owners and accountants, by whether the viewer invites them. */
const oneByOneWords = (key: "role.oneByOne" | "role.oneByOneOwners") =>
  heT(`app.team.import.${key}`, {
    owner: he.app.roles.owner,
    accountant: he.app.roles.accountant,
  });

/** The import's field and press, on any page. */
const screenOf = (page: Page) => ({
  title: page.getByRole("heading", { level: 1, name: i.title }),
  field: page.getByRole("textbox", { name: i.paste.label, exact: true }),
  submit: (count: number) =>
    page.getByRole("button", {
      name: heT("app.team.import.submit", { count }),
      exact: true,
    }),
  done: (count: number) =>
    page.getByRole("heading", {
      level: 2,
      name: heT("app.team.import.done.title", { count }),
    }),
  shown: (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true }),
});

test("the Team screen's import: a sheet saved at once with no link, each link sent from the done screen, and the rank rule on each line", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const business = TEAM_IMPORT[testInfo.project.name as Size];
  const onComputer = testInfo.project.name === "desktop";
  const [first, second, third] = business.people;
  const listed = [
    business.wizard,
    business.lapsed,
    ...business.people,
    business.takenBack,
    business.fromManager,
    business.ownerLine,
    business.managerLine,
  ];
  // What each listed number was ever sent, from before anything here.
  const before = new Map<string, number>();
  for (const person of listed) {
    before.set(person.e164, await lastCodeId(person.e164));
  }
  const sentNothing = async () => {
    for (const person of listed) {
      expect(
        await codesSince(person.e164, before.get(person.e164) ?? 0),
        person.name,
      ).toBe(0);
    }
    expect(await notificationsIn(business)).toBe(0);
  };

  await openTeamImportBusiness(business);
  try {
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page, business.owner);
    const screen = screenOf(page);
    const teamTitle = page.getByRole("heading", { level: 1, name: tt.title });
    const entry = page
      .getByRole("link", { name: new RegExp(`^${literal(i.entry)}`) })
      .filter({ visible: true });

    // Closed to invites, as a hosted demo is: no import, and no row to it.
    await setTeamImportInvites(business, false);
    await page.goto("/team/import");
    await expect(
      page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
    ).toBeVisible();
    await page.goto("/team");
    await expect(teamTitle).toBeVisible();
    await expect(entry).toHaveCount(0);
    await setTeamImportInvites(business, true);

    // Open: a quiet row at the foot of the invites, beside the screen's
    // one main action, and above the invite form.
    await page.goto("/team");
    await expect(teamTitle).toBeVisible();
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveAttribute("href", "/team/import");
    await expect(entry).toContainText(i.entryHint);
    await expect(
      page
        .getByRole("link", { name: tt.inviteAction, exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await page.goto("/team/invite");
    await expect(
      page.getByRole("heading", { level: 1, name: tt.invite.title }),
    ).toBeVisible();
    await expect(entry).toHaveAttribute("href", "/team/import");
    await entry.click();
    await expect(page).toHaveURL(/\/team\/import$/);
    await expect(screen.title).toBeVisible();
    // The three on the team, and the wizard's invite waiting.
    await expect(
      page.getByText(
        heT("app.team.import.existing", { members: 3, invites: 1 }),
        { exact: true },
      ),
    ).toBeVisible();
    // An owner invites owners and accountants on "הזמנה לצוות": the words
    // lead there.
    await expect(screen.shown(oneByOneWords("role.oneByOne"))).toHaveCount(1);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("team-import-1-empty.png"),
      fullPage: true,
    });

    // The sheet: the owner's own line ("בעלים") is on the team, never to
    // fix; the wizard's manager stays as she is; the lapsed one is left.
    await screen.field.fill(sheetOf(business));
    await expect(screen.submit(3)).toBeEnabled();
    await expect(
      page.getByRole("button", {
        name: heT("app.team.import.fixLineFor", { line: "2" }),
        exact: true,
      }),
    ).toHaveCount(0);
    if (!onComputer) {
      await page
        .getByRole("button", { name: new RegExp(literal(i.groups.show)) })
        .click();
    }
    for (const outcome of [
      i.outcome.member,
      i.outcome.same,
      i.outcome.expired,
    ]) {
      await expect(screen.shown(outcome)).toHaveCount(1);
    }
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("team-import-2-sheet.png"),
      fullPage: true,
    });

    await screen.submit(3).click();
    await expect(screen.done(3)).toBeFocused();
    await expect(
      page.getByText(
        heT("app.team.import.done.more", { updated: 0, skipped: 3 }),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText(i.done.team, { exact: true })).toBeVisible();
    // Each with no link, of one import, by the owner; the wizard's manager
    // as she was.
    const saved = await invitesIn(business);
    const made = saved.find((invite) => invite.importId)?.importId;
    expect(made).toEqual(expect.any(String));
    for (const person of business.people) {
      expect(
        saved.find((invite) => invite.phone === person.e164),
        person.name,
      ).toMatchObject({
        name: person.name,
        role: person.role,
        pending: true,
        open: true,
        importId: made,
      });
      expect((await teamImportInvite(business, person.e164))?.invitedBy).toBe(
        business.owner.id,
      );
    }
    expect(
      saved.find((invite) => invite.phone === business.wizard.e164),
    ).toMatchObject({ role: "manager", pending: true, importId: null });
    // One line in the log: counts, never a name or a number.
    const [logged] = await importLog(business);
    expect(logged).toMatchObject({
      action: "invite.import",
      details: {
        import: made,
        created: 3,
        updated: 0,
        by: "team",
        roles: { manager: 1, worker: 2 },
      },
    });
    for (const person of listed) {
      expect(JSON.stringify(logged)).not.toContain(person.e164.slice(4));
      expect(JSON.stringify(logged)).not.toContain(person.name);
    }
    await sentNothing();

    // "עוד לא קיבלו קישור": the three and the wizard's manager, by name,
    // each in the role they end with, and no link made yet.
    const main = page.getByRole("main");
    const left = (count: number) =>
      main
        .getByText(heT("app.team.pending.count", { count }), { exact: true })
        .filter({ visible: true });
    await expect(left(4)).toHaveCount(1);
    const rowOf = (name: string) =>
      page
        .locator("[data-pending-links]")
        .filter({ visible: true })
        .locator(onComputer ? "tr" : "li")
        .filter({ hasText: name });
    await expect(rowOf(business.wizard.name)).toContainText(
      he.app.roles.manager,
    );
    await expect(rowOf(second.name)).toContainText(he.app.roles.manager);
    await expect(rowOf(first.name)).toContainText(he.app.roles.worker);
    await expect(rowOf(first.name)).toContainText(first.local);
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    // The ways on never stand between the card's words and the first
    // "יצירת קישור": after the list on a phone and a computer, under the
    // card, beside the list, on a tablet; after the list in the reading
    // order everywhere.
    const remove = page.getByRole("button", {
      name: i.done.remove,
      exact: true,
    });
    const firstCreate = page
      .locator("[data-pending-create]")
      .filter({ visible: true })
      .first();
    const boxOf = async (what: Locator) => {
      const box = await what.boundingBox();
      if (!box) throw new Error("Not drawn");
      return box;
    };
    const across = (
      a: { x: number; width: number },
      b: { x: number; width: number },
    ) => a.x < b.x + b.width && b.x < a.x + a.width;
    const removeBox = await boxOf(remove);
    const heading = await boxOf(screen.done(3));
    const sendList = await boxOf(
      page.locator("[data-pending-links]").filter({ visible: true }),
    );
    if (testInfo.project.name === "tablet") {
      expect(across(removeBox, heading)).toBe(true);
      expect(across(sendList, heading)).toBe(false);
      expect(removeBox.y).toBeGreaterThan(heading.y);
    } else {
      expect(removeBox.y).toBeGreaterThanOrEqual(sendList.y + sendList.height);
    }
    expect(
      await firstCreate.evaluate((create) => {
        const button = document.querySelector("[data-import-remove]");
        return Boolean(
          button &&
            create.compareDocumentPosition(button) &
              Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("team-import-3-done.png"),
      fullPage: true,
    });

    // The first person's link, made at the moment of sending: WhatsApp to
    // their own number takes the focus, the message and the link written,
    // no name in it.
    const create = (name: string) =>
      page
        .getByRole("button", {
          name: heT("app.team.pending.createFor", { name }),
        })
        .filter({ visible: true });
    const whatsapp = (name: string) =>
      page
        .getByRole("link", {
          name: heT("app.team.pending.whatsappFor", { name }),
        })
        .filter({ visible: true });
    await create(first.name).click();
    await expect(whatsapp(first.name)).toBeFocused();
    const field = page
      .getByLabel(heT("app.team.link.linkFor", { name: first.name }))
      .filter({ visible: true });
    await expect(field).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
    const link = await field.inputValue();
    const href = new URL(
      (await whatsapp(first.name).getAttribute("href")) ?? "",
    );
    expect(`${href.origin}${href.pathname}`).toBe(
      `https://wa.me/${first.e164.slice(1)}`,
    );
    expect(href.searchParams.get("text")).toBe(
      shareText(
        heT("app.team.pending.message", {
          business: isolateName(business.name),
        }),
        link,
      ),
    );
    expect(href.searchParams.get("text")).not.toContain(first.name);
    await expect(whatsapp(first.name)).toHaveAttribute("target", "_blank");
    await expect(whatsapp(first.name)).toHaveAttribute("rel", /noopener/);
    await expect(left(3)).toHaveCount(1);

    // Copied, and on to the next person, whose "יצירת קישור" has the focus.
    await rowOf(first.name).getByRole("button", { name: tt.link.copy }).click();
    await expect(
      rowOf(first.name).getByRole("button", { name: tt.link.copied }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await expect(create(second.name)).toBeFocused();
    // The second one's too: on to the wizard's manager, next by name.
    await create(second.name).click();
    await expect(whatsapp(second.name)).toBeFocused();
    await rowOf(second.name)
      .getByRole("button", { name: tt.link.copy })
      .click();
    await expect(create(business.wizard.name)).toBeFocused();
    await expect(left(2)).toHaveCount(1);
    expect(await pendingLinkStates(business)).toMatchObject({
      [first.e164]: { pending: false, open: true },
      [second.e164]: { pending: false, open: true },
      [business.wizard.e164]: { pending: true, open: true },
      [third.e164]: { pending: true, open: true },
    });

    // The one whose link ran out: folded under its own title, its new link
    // made here.
    await expect(
      page.getByRole("heading", { level: 2, name: i.done.expired.title }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: new RegExp(
          literal(heT("app.team.import.done.expired.count", { count: 1 })),
        ),
      })
      .click();
    await page
      .getByRole("button", {
        name: heT("app.team.link.newFor", { name: business.lapsed.name }),
      })
      .click();
    const lapsedField = page.getByLabel(
      heT("app.team.link.linkFor", { name: business.lapsed.name }),
    );
    await expect(lapsedField).toHaveValue(/\/join\/[A-Za-z0-9_-]{43}$/);
    // On WhatsApp to their own number too, which takes the focus, with the
    // team's sentence and the new link.
    const lapsedWhatsapp = whatsapp(business.lapsed.name);
    await expect(lapsedWhatsapp).toBeFocused();
    const lapsedLink = await lapsedField.inputValue();
    const lapsedHref = new URL(
      (await lapsedWhatsapp.getAttribute("href")) ?? "",
    );
    expect(`${lapsedHref.origin}${lapsedHref.pathname}`).toBe(
      `https://wa.me/${business.lapsed.e164.slice(1)}`,
    );
    expect(lapsedHref.searchParams.get("text")).toBe(
      shareText(
        heT("app.team.pending.message", {
          business: isolateName(business.name),
        }),
        lapsedLink,
      ),
    );
    expect(
      await teamImportInvite(business, business.lapsed.e164),
    ).toMatchObject({ pending: false, open: true, runs: true });

    // WhatsApp opened (kept out: wa.me answers with an empty page, whose
    // tab is closed), the row says so, and folded and unfolded again the
    // row still has its link and says so: the screen keeps both.
    const expired = page.getByRole("list", { name: i.done.expired.title });
    const openedThere = expired
      .getByText(tt.pending.opened, { exact: true })
      .filter({ visible: true });
    await expect(openedThere).toHaveCount(0);
    await page.context().route(
      (url) => url.hostname === "wa.me",
      (route) => route.fulfill({ contentType: "text/html", body: "" }),
    );
    const opened = page.context().waitForEvent("page");
    await lapsedWhatsapp.click();
    await (await opened).close();
    await expect(openedThere).toHaveCount(1);
    const fold = page.getByRole("button", {
      name: new RegExp(
        literal(heT("app.team.import.done.expired.count", { count: 1 })),
      ),
    });
    await fold.click();
    await expect(expired).toHaveCount(0);
    await fold.click();
    await expect(lapsedField).toHaveValue(lapsedLink);
    await expect(openedThere).toHaveCount(1);
    // Making links sends nothing either.
    await sentNothing();
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("team-import-4-sent.png"),
      fullPage: true,
    });

    // Taken back now, the undo would cancel only the one still with no
    // link: its "ביטול" says so at once, never "3 הזמנות נמחקו", and brings
    // the done screen back with the links made, never "יצירת קישור" again.
    // The lines whose link was made read as invited now, so the preview's
    // counts differ from those said before the import ("אדם אחד יוזמן"):
    // with nothing edited they are never said over "ביטול"'s words.
    const polite = announcer(page, "polite");
    await heardSoFar(polite);
    await remove.click();
    const keptBack = page.getByRole("status").filter({
      hasText: [
        heT("app.team.import.done.removed", { count: 1 }),
        heT("app.team.import.done.removedKept", { count: 2 }),
      ].join(". "),
    });
    await expect(keptBack).toBeVisible();
    // Longer than the screen waits after typing to say its counts.
    await page.waitForTimeout(1_500);
    await expect(
      saidSince(polite, heT("app.team.import.summary.ready", { count: 1 })),
    ).toHaveCount(0);
    await keptBack.getByRole("button").click();
    await expect(screen.done(3)).toBeVisible();
    await expect(remove).toBeFocused();
    await expect(whatsapp(first.name)).toBeVisible();
    await expect(whatsapp(second.name)).toBeVisible();
    await expect(create(first.name)).toHaveCount(0);
    await expect(create(third.name)).toBeVisible();
    await expect(left(2)).toHaveCount(1);
    expect(await pendingLinkStates(business)).toMatchObject({
      [first.e164]: { pending: false, open: true },
      [third.e164]: { pending: true, open: true },
    });

    // A second list, taken back with its "ביטול" left to run out: its
    // invite is cancelled, kept as a row for the log.
    await page
      .getByRole("button", { name: i.done.another, exact: true })
      .click();
    await expect(screen.field).toBeFocused();
    await expect(screen.field).toHaveValue("");
    await screen.field.fill(
      `${business.takenBack.name} ${business.takenBack.local}`,
    );
    await screen.submit(1).click();
    await expect(screen.done(1)).toBeFocused();
    await page
      .getByRole("button", { name: i.done.remove, exact: true })
      .click();
    const removed = page.getByRole("status").filter({
      hasText: heT("app.team.import.done.removed", { count: 1 }),
    });
    await expect(removed).toBeVisible();
    await expect(
      page.getByText(i.done.removedBack, { exact: true }),
    ).toBeVisible();
    await expect(removed).toHaveCount(0, { timeout: HOLD_MS + 5_000 });
    await expect
      .poll(
        async () =>
          (await teamImportInvite(business, business.takenBack.e164))?.open,
      )
      .toBe(false);
    expect((await importLog(business)).at(-1)).toMatchObject({
      action: "invite.import_undo",
      details: { cancelled: 1, kept: 0 },
    });
    await sentNothing();

    // Back on /team, the two still waiting for their links are there.
    await page.goto("/team");
    await expect(teamTitle).toBeVisible();
    await expect(left(2)).toHaveCount(1);
    await expect(create(business.wizard.name)).toBeVisible();
    await expect(create(third.name)).toBeVisible();
    await expect(create(first.name)).toHaveCount(0);
    await expect(create(business.takenBack.name)).toHaveCount(0);

    // A manager: a line naming the owner's role is for the owners alone,
    // one at a time (their invite form offers neither role), and holds the
    // list until it goes; the rest is the manager's to invite.
    const managers = await secondPage(browser, testInfo);
    try {
      await signIn(managers, business.manager);
      const theirs = screenOf(managers);
      await managers.goto("/team/import");
      await expect(theirs.title).toBeVisible();
      await expect(
        theirs.shown(oneByOneWords("role.oneByOneOwners")),
      ).toHaveCount(1);
      await expect(theirs.shown(oneByOneWords("role.oneByOne"))).toHaveCount(0);
      await theirs.field.fill(
        [
          `${business.fromManager.name} ${business.fromManager.local}`,
          `${business.ownerLine.name} ${business.ownerLine.local} בעלים`,
        ].join("\n"),
      );
      await expect(
        theirs.shown(
          heT("app.team.import.problem.oneByOneOwners", {
            role: he.app.roles.owner,
          }),
        ),
      ).toHaveCount(1);
      await expect(theirs.submit(1)).toBeDisabled();
      await expect(theirs.submit(1)).toHaveAccessibleDescription(
        heT("app.team.import.status.blocked", { count: 1 }),
      );
      await expectCleanPage(managers);
      await managers.screenshot({
        path: testInfo.outputPath("team-import-5-manager.png"),
        fullPage: true,
      });
      await managers
        .getByRole("button", {
          name: heT("app.team.import.removeLineFor", { line: "2" }),
          exact: true,
        })
        .click();
      await expect(theirs.submit(1)).toBeEnabled();
      await theirs.submit(1).click();
      await expect(theirs.done(1)).toBeFocused();
      expect(
        await teamImportInvite(business, business.fromManager.e164),
      ).toMatchObject({
        role: "worker",
        invitedBy: business.manager.id,
        pending: true,
        open: true,
      });
      expect(
        await teamImportInvite(business, business.ownerLine.e164),
      ).toBeNull();
    } finally {
      await managers.context().close();
    }

    // A worker who edits the team: only workers are offered, and a line
    // naming a manager can't be invited from here.
    const editors = await secondPage(browser, testInfo);
    try {
      await signIn(editors, business.editor);
      const theirs = screenOf(editors);
      await editors.goto("/team/import");
      await expect(theirs.title).toBeVisible();
      const roles = editors.getByRole("radio");
      await expect(roles).toHaveCount(1);
      await expect(roles).toHaveAccessibleName(
        new RegExp(`^${literal(he.app.roles.worker)}`),
      );
      await expect(
        theirs.shown(oneByOneWords("role.oneByOneOwners")),
      ).toHaveCount(1);
      await theirs.field.fill(
        `${business.managerLine.name} ${business.managerLine.local} מנהל`,
      );
      await expect(
        theirs.shown(
          heT("app.team.import.problem.notAllowed", {
            role: he.app.roles.manager,
          }),
        ),
      ).toHaveCount(1);
      await expect(theirs.submit(0)).toBeDisabled();
      await expectCleanPage(editors);
      await editors.screenshot({
        path: testInfo.outputPath("team-import-6-editor.png"),
        fullPage: true,
      });
      expect(
        await teamImportInvite(business, business.managerLine.e164),
      ).toBeNull();
    } finally {
      await editors.context().close();
    }
    // Nobody on any list was sent anything, start to end.
    await sentNothing();
  } finally {
    await closeTeamImportBusiness(business);
  }
});
