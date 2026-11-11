import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearDemoChat,
  demoActivityActions,
  demoChatLines,
  demoChatLogBy,
  demoChatMembers,
  demoChatMuted,
  demoChatPushStates,
  demoChatRead,
  demoConversation,
  endViewSessions,
  seeDemoChatNotice,
} from "./db";
import { secondPage, signIn } from "./session";
import { heT } from "./t";

// Announcements, removing and muting (C3 of the chat plan). The demo
// restaurant's reset pins Shiran's 08:10 line in the whole team's group as an
// announcement, which Noa and Yoav confirmed (private.seed_demo_chat); each
// test puts the demo's chats back before and after (clearDemoChat) and marks
// the notice of who sees what as read for the people it signs in. Noa is in
// the kitchen, Shiran (the manager) announces and moderates, Uri is the
// owner. These write the shared demo, so they run once, on the phone, where a
// conversation takes the whole screen and a message's actions open with a
// tap; design.spec.ts covers the three shapes on /design/chat and
// screens.spec.ts opens the new screens at each width. Counts are read
// before and compared after, or computed, never assumed.
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const YOAV = { local: "050-000-0004", e164: "+972500000004" };
const SHIRAN = { local: "050-000-0002", e164: "+972500000002" };
const URI = { local: "050-000-0001", e164: "+972500000001" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const NAMES = {
  noa: "נועה כהן",
  yoav: "יואב לוי",
  shiran: "שירן הדגמה",
  uri: "אורי הדגמה",
};
const KITCHEN = "מטבח";
/** The seed's announcement, pinned in the whole team's group. */
const SEEDED = "מהשבוע הבא סוגרים את הקופה ב-22:00";

const c = he.app.chat;
const e = he.auth.enter;
const activity = he.app.manage.activity;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

type DoorPerson = "owner" | "manager" | "worker";

/** In through the door, as one of the demo restaurant's people. */
async function enterAs(page: Page, key: DoorPerson) {
  await page.goto("/enter");
  await page
    .getByRole("region", { name: e.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

const nav = (page: Page) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
const chatTab = (page: Page) =>
  nav(page).getByRole("link", {
    name: new RegExp(`^${literal(he.modules.chat.name)}`),
  });
/** How many chats the Chat tab says wait (0 when it carries no count). */
async function tabCount(page: Page): Promise<number> {
  const text = (await chatTab(page).textContent()) ?? "";
  return Number(/,\s*(\d+)/.exec(text)?.[1] ?? 0);
}
const main = (page: Page) => page.getByRole("main");
const composer = (page: Page) =>
  page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true });
/** The conversation on screen; a kept, hidden copy of another never counts. */
const log = (page: Page) =>
  page.getByRole("log", { name: c.conversation.log }).filter({ visible: true });
const button = (page: Page | Locator, name: string) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });
/** The toast that says `text`, with its way back while it shows. */
const toast = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });
/** "1 מתוך 3 אישרו שקראו", as the card's button reads. */
const readBy = (count: number, total: number) =>
  c.announcement.readBy
    .replace("<ltr>{count}</ltr>", String(count))
    .replace("<ltr>{total}</ltr>", String(total));

/** Any count of who confirmed, for whoever may see it. */
const anyReadBy = new RegExp(
  c.announcement.readBy
    .replace("<ltr>{count}</ltr>", "\\d+")
    .replace("<ltr>{total}</ltr>", "\\d+"),
);

/** Writes in the conversation on screen, and waits until it went. */
async function send(page: Page, words: string, label = c.conversation.send) {
  await composer(page).fill(words);
  await button(page, label).click();
  await expect(log(page).getByText(words, { exact: true })).toBeVisible();
  await expect(log(page).getByText(c.conversation.sending)).toHaveCount(0);
}

/**
 * A message's actions as a phone opens them, with a tap on what it says (the
 * button "פעולות" stays for keyboards and screen readers); the sheet.
 */
async function openActions(page: Page, words: string): Promise<Locator> {
  await log(page).getByText(words, { exact: true }).click();
  const sheet = page.getByRole("dialog", { name: c.messageActions.title });
  await expect(sheet).toBeVisible();
  return sheet;
}
/** A row of the actions sheet, by its title (its hint follows in its name). */
const actionRow = (sheet: Locator, title: string) =>
  sheet.getByRole("button", { name: new RegExp(`^${literal(title)}`) });

const PHONE_ONLY =
  "These write the shared demo: one run is enough, on the phone; design.spec.ts and screens.spec.ts cover the three widths.";

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(testInfo.project.name !== "phone", PHONE_ONLY);
  await clearDemoChat();
  for (const person of [NOA, YOAV, SHIRAN, URI]) {
    await seeDemoChatNotice(person.e164);
  }
});

test.afterEach(async ({ page }, testInfo) => {
  void page;
  if (testInfo.project.name !== "phone") return;
  await clearDemoChat();
  await endViewSessions(ADMIN.e164);
});

test("management posts an announcement to the whole team, a worker confirms it from Today, and management sees who did", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const words = "מחר בשמונה ישיבת צוות קצרה, לפני הפתיחה";
  const team = (await demoConversation({ kind: "team" })) ?? "";
  expect(team).not.toBe("");
  // Everyone in the group but its author: computed, as other specs may add
  // people to the restaurant.
  const total = (await demoChatMembers(team)) - 1;
  expect(total).toBeGreaterThanOrEqual(3);

  // Shiran, from the announcements: the main action asks for the group,
  // then opens its composer as an announcement.
  await enterAs(page, "manager");
  await page.goto("/chat/announcements");
  await expect(
    page.getByRole("heading", { level: 1, name: c.announcement.page.title }),
  ).toBeVisible();
  // The seeded one, pinned: Noa and Yoav confirmed it.
  await expect(
    page.getByRole("heading", { name: c.announcement.page.pinnedTitle }),
  ).toBeVisible();
  await expect(button(page, readBy(2, total))).toBeVisible();
  await expectCleanPage(page);
  await button(page, c.announcement.page.publish).click();
  const choose = page.getByRole("dialog", {
    name: c.announcement.page.chooseGroup,
  });
  await expect(choose).toBeVisible();
  await expect(
    choose.getByRole("link", { name: KITCHEN, exact: true }),
  ).toBeVisible();
  await choose.getByRole("link", { name: c.list.team, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${team}\\?announce=1$`));

  const asAnnouncement = page
    .getByRole("switch", { name: c.announcement.switch })
    .filter({ visible: true });
  await expect(asAnnouncement).toBeChecked();
  await expect(
    page.getByText(c.announcement.switchHint).filter({ visible: true }),
  ).toBeVisible();
  await send(page, words, c.announcement.send);
  // One announcement at a time: what is written next is a message again.
  await expect(asAnnouncement).not.toBeChecked();
  await expect(button(page, c.conversation.send)).toBeVisible();
  // Hers, pinned at the top of the group: nobody confirmed it yet, of
  // everyone else in it, and the seeded one is one more.
  await expect(button(page, readBy(0, total))).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page
      .getByRole("link", {
        name: heT("app.chat.announcement.more", { count: 1 }),
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: c.announcement.unpin })
      .filter({ visible: true }),
  ).toBeVisible();
  await expectCleanPage(page);

  const noa = await secondPage(browser, testInfo);
  try {
    // Noa's Today has it, with "קראתי" and, before she presses, who sees
    // that she did.
    await enterAs(noa, "worker");
    await expect(
      main(noa)
        .getByRole("heading", { name: c.today.title, exact: true })
        .filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      main(noa).getByText(words, { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
    await expect(button(main(noa), c.announcement.confirm)).toHaveCount(1);
    await expect(
      main(noa).getByText(c.announcement.whoSees).filter({ visible: true }),
    ).toHaveCount(1);
    // The group counts on the Chat tab: a message she hasn't read, and an
    // announcement waiting for her.
    const waitingBefore = await tabCount(noa);
    expect(waitingBefore).toBeGreaterThanOrEqual(1);
    expect(
      (await demoChatLines(NOA.e164)).filter(
        (line) => line.kind === "chat.announcement" && !line.read,
      ),
    ).toHaveLength(1);

    // Her list marks the group, and the way to every announcement says one
    // waits for her.
    await noa.goto("/chat");
    const teamRow = noa
      .locator(`a[href="/chat/${team}"]`)
      .filter({ visible: true })
      .first();
    await expect(teamRow).toContainText(c.list.waiting);
    await expect(
      noa
        .getByRole("link", { name: new RegExp(literal(c.list.announcements)) })
        .filter({ visible: true }),
    ).toContainText(heT("app.chat.list.announcementsWaiting", { count: 1 }));

    // In the group it is pinned under the title, with "קראתי"; who confirmed
    // is for its author and management only.
    await teamRow.click();
    await expect(noa).toHaveURL(new RegExp(`/chat/${team}$`));
    await expect(
      noa
        .getByRole("heading", { level: 2, name: c.announcement.label })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(button(noa, c.announcement.confirm)).toBeVisible();
    await expect(
      noa.getByText(c.announcement.whoSees).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      noa.getByRole("button", { name: anyReadBy }).filter({ visible: true }),
    ).toHaveCount(0);
    await expectCleanPage(noa);
    await noa.screenshot({
      path: testInfo.outputPath("chat-announcement-pinned.png"),
      fullPage: true,
    });

    // Reading it isn't confirming it: the Chat tab still counts the group.
    await expect.poll(() => demoChatRead(NOA.e164, team)).toBe(true);
    await noa.goto("/home");
    expect(await tabCount(noa)).toBe(waitingBefore);

    // "קראתי" on Today: it says so, and Today goes on without it.
    await button(main(noa), c.announcement.confirm).click();
    await expect(
      main(noa).getByText(words, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        (await demoChatLines(NOA.e164)).filter(
          (line) => line.kind === "chat.announcement" && !line.read,
        ),
      )
      .toHaveLength(0);
    await noa.reload();
    expect(await tabCount(noa)).toBe(waitingBefore - 1);

    // Her announcements: it is confirmed, she has no main action here, and
    // never who else confirmed.
    await noa.goto("/chat/announcements");
    await expect(
      noa.getByRole("heading", { level: 1, name: c.announcement.page.title }),
    ).toBeVisible();
    await expect(
      noa.getByText(c.announcement.confirmed).filter({ visible: true }),
    ).toHaveCount(2);
    await expect(
      noa.getByRole("button", { name: c.announcement.page.publish }),
    ).toHaveCount(0);
    await expect(
      noa.getByRole("button", { name: c.announcement.readersOpen }),
    ).toHaveCount(0);
    await expectCleanPage(noa);
  } finally {
    await noa.context().close();
  }

  // Shiran's screen, open all along, counts Noa's "קראתי" by itself.
  const counted = button(page, readBy(1, total));
  await expect(counted).toBeVisible({ timeout: 20_000 });
  await counted.click();
  const readers = page.getByRole("dialog", {
    name: c.announcement.readers.title,
  });
  await expect(readers).toBeVisible();
  await expect(
    readers.getByText(c.announcement.readers.subtitle),
  ).toBeVisible();
  // The section of that title itself, never the sheet's own around both.
  const section = (title: string) =>
    readers
      .getByRole("heading", { name: title, exact: true })
      .locator("xpath=ancestor::section[1]");
  const confirmed = section(c.announcement.readers.confirmed);
  const waiting = section(c.announcement.readers.waiting);
  await expect(confirmed).toContainText(NAMES.noa);
  await expect(confirmed).not.toContainText(NAMES.yoav);
  await expect(waiting).toContainText(NAMES.yoav);
  await expect(waiting).toContainText(NAMES.uri);
  await expect(waiting).not.toContainText(NAMES.noa);
  // Its author isn't one it asks.
  await expect(readers).not.toContainText(NAMES.shiran);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("chat-announcement-readers.png"),
    fullPage: true,
  });
});

test("management removes a worker's message in a group, takes it back and removes it again; the owner's log says so and a view's doesn't", async ({
  page,
  browser,
}, testInfo) => {
  // Four people in, one with a code by SMS (which may wait out the auth
  // server's resend wait), and a sync to wait for.
  test.setTimeout(240_000);
  const since = new Date(Date.now() - 1000);
  const words = "אפשר לקבל עוד שתי קופסאות כפפות למטבח?";
  const kitchen = (await demoConversation({
    kind: "department",
    name: KITCHEN,
  })) as string;
  expect(kitchen).not.toBeNull();
  const removeLine = heT("app.manage.activity.actions.chat.remove", {
    author: NAMES.noa,
    group: heT("app.manage.activity.actions.chat.group.department", {
      name: KITCHEN,
    }),
  });
  const restoreLine = heT("app.manage.activity.actions.chat.restore", {
    author: NAMES.noa,
    group: heT("app.manage.activity.actions.chat.group.department", {
      name: KITCHEN,
    }),
  });
  // Any row about a removed message, whoever's and wherever.
  const anyChatLine = new RegExp(
    [activity.actions.chat.remove, activity.actions.chat.restore]
      .map((text) => literal(text.split("{author}")[0] ?? text))
      .join("|"),
  );

  // Noa writes in her department's group, and stays on it.
  await enterAs(page, "worker");
  await page.goto(`/chat/${kitchen}`);
  await send(page, words);

  const shiran = await secondPage(browser, testInfo);
  try {
    await enterAs(shiran, "manager");
    await shiran.goto(`/chat/${kitchen}`);
    await expect(log(shiran).getByText(words, { exact: true })).toBeVisible();

    // Removing asks nothing: it goes for everyone, and the toast offers the
    // way back.
    let sheet = await openActions(shiran, words);
    await expect(actionRow(sheet, c.messageActions.copy)).toBeVisible();
    await expect(actionRow(sheet, c.messageActions.delete)).toHaveCount(0);
    await expect(sheet.getByText(c.messageActions.removeHint)).toBeVisible();
    await expectCleanPage(shiran);
    await actionRow(sheet, c.messageActions.remove).click();
    await expect(sheet).toHaveCount(0);
    const removed = toast(shiran, c.messageActions.removed);
    await expect(removed).toBeVisible();
    await expect(
      log(shiran).getByText(c.message.removedByManager),
    ).toBeVisible();
    await expect(log(shiran).getByText(words, { exact: true })).toHaveCount(0);
    await removed.getByRole("button", { name: c.messageActions.undo }).click();
    await expect(toast(shiran, c.messageActions.restored)).toBeVisible();
    await expect(log(shiran).getByText(words, { exact: true })).toBeVisible();
    await expect(log(shiran).getByText(c.message.removedByManager)).toHaveCount(
      0,
    );

    // Removed again, and left so.
    sheet = await openActions(shiran, words);
    await actionRow(sheet, c.messageActions.remove).click();
    await expect(toast(shiran, c.messageActions.removed)).toBeVisible();
    await expect(
      log(shiran).getByText(c.message.removedByManager),
    ).toBeVisible();

    // Noa's screen, never reloaded, has it gone within a sync: what it said
    // is gone, and who took it out is said.
    await expect(log(page).getByText(c.message.removedByManager)).toBeVisible({
      timeout: 20_000,
    });
    await expect(log(page).getByText(words, { exact: true })).toHaveCount(0);
    await expectCleanPage(page);
    await page.screenshot({
      path: testInfo.outputPath("chat-removed.png"),
      fullPage: true,
    });
  } finally {
    await shiran.context().close();
  }

  // The log has both removals and the way back, with whose and where.
  await expect
    .poll(() => demoActivityActions("chat.remove", since))
    .toBeGreaterThanOrEqual(2);
  expect(
    await demoActivityActions("chat.restore", since),
  ).toBeGreaterThanOrEqual(1);

  // The owner reads it in the activity log.
  const uri = await secondPage(browser, testInfo);
  try {
    await enterAs(uri, "owner");
    await uri.goto("/manage/activity");
    await expect(
      uri.getByRole("heading", { level: 1, name: activity.title }),
    ).toBeVisible();
    await expect(
      main(uri).getByText(removeLine).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      main(uri).getByText(restoreLine).filter({ visible: true }).first(),
    ).toBeVisible();
    // Never what it said.
    await expect(main(uri).getByText(words)).toHaveCount(0);
    await expectCleanPage(uri);
  } finally {
    await uri.context().close();
  }

  // The ConceptApp team viewing the business reads no row about a chat, as
  // a manager or as the owner (view-as.spec.ts's way in), and nothing of
  // chat at all: not on Today (no section, no announcement, no "קראתי"),
  // not the announcements, not a group's details.
  const teamGroup = (await demoConversation({ kind: "team" })) ?? "";
  expect(teamGroup).not.toBe("");
  const team = await secondPage(browser, testInfo);
  try {
    await signIn(team, ADMIN, /\/admin$/);
    for (const role of ["manager", "owner"] as const) {
      await team.goto("/admin/businesses/demo-restaurant");
      await team
        .getByRole("button", {
          name: he.admin.setup.viewAs.as[role],
          exact: true,
        })
        .click();
      await expect(team).toHaveURL(/\/home$/);
      await expect(
        main(team).getByRole("heading", { level: 1 }).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        main(team).getByRole("heading", { name: c.today.title, exact: true }),
      ).toHaveCount(0);
      await expect(main(team).getByText(SEEDED)).toHaveCount(0);
      await expect(
        main(team).getByRole("button", {
          name: c.announcement.confirm,
          exact: true,
        }),
      ).toHaveCount(0);
      await team.goto("/chat/announcements");
      await expect(
        team.getByText(c.viewing).filter({ visible: true }),
      ).toBeVisible();
      await expect(team.getByText(SEEDED)).toHaveCount(0);
      await expect(
        team.getByRole("heading", { name: c.announcement.label }),
      ).toHaveCount(0);
      await team.goto(`/chat/${teamGroup}/info`);
      await expect(
        team.getByText(c.viewing).filter({ visible: true }),
      ).toBeVisible();
      await expect(team.getByRole("switch", { name: c.info.mute })).toHaveCount(
        0,
      );
      await expect(
        team.getByRole("heading", { name: c.details.members }),
      ).toHaveCount(0);
      await team.goto("/manage/activity");
      await expect(
        team.getByRole("heading", { level: 1, name: activity.title }),
      ).toBeVisible();
      // The log is there: this view is the newest thing in it.
      await expect(
        main(team)
          .getByText(
            activity.actions.view_as.start.replace(
              "{role}",
              he.app.team.roles[role],
            ),
          )
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(main(team).getByText(anyChatLine)).toHaveCount(0);
      await team
        .getByRole("complementary", { name: he.app.viewAs.label })
        .getByRole("button", { name: he.app.viewAs.end })
        .click();
      await expect(team).toHaveURL(/\/admin\/businesses\/demo-restaurant$/);
    }
  } finally {
    await team.context().close();
  }
});

test("management can't remove a message in a private chat, and a worker deletes their own and takes it back", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const since = new Date(Date.now() - 1000);
  // Shiran's private chat with Noa, as the seed writes it.
  const direct = await demoConversation({
    kind: "direct",
    between: [SHIRAN.e164, NOA.e164],
  });
  expect(direct).not.toBeNull();
  const question = "אפשר להחליף איתך משמרת ביום שלישי?";
  const answer = "כן, אין בעיה";

  // Shiran manages, but a private chat is the two people's: Noa's message
  // offers her a copy and nothing more; her own, deleting it.
  await enterAs(page, "manager");
  await page.goto(`/chat/${direct}`);
  let sheet = await openActions(page, answer);
  await expect(actionRow(sheet, c.messageActions.copy)).toBeVisible();
  await expect(actionRow(sheet, c.messageActions.remove)).toHaveCount(0);
  await expect(actionRow(sheet, c.messageActions.delete)).toHaveCount(0);
  await sheet.getByRole("button", { name: c.messageActions.close }).click();
  await expect(sheet).toHaveCount(0);
  sheet = await openActions(page, question);
  await expect(actionRow(sheet, c.messageActions.delete)).toBeVisible();
  await expect(actionRow(sheet, c.messageActions.remove)).toHaveCount(0);
  await sheet.getByRole("button", { name: c.messageActions.close }).click();
  await expect(sheet).toHaveCount(0);

  // Noa deletes her own answer: it goes for both, and the toast takes it
  // back.
  const noa = await secondPage(browser, testInfo);
  try {
    await enterAs(noa, "worker");
    await noa.goto(`/chat/${direct}`);
    sheet = await openActions(noa, answer);
    await expect(sheet.getByText(c.messageActions.deleteHint)).toBeVisible();
    await expect(actionRow(sheet, c.messageActions.remove)).toHaveCount(0);
    await actionRow(sheet, c.messageActions.delete).click();
    const deleted = toast(noa, c.messageActions.deleted);
    await expect(deleted).toBeVisible();
    await expect(log(noa).getByText(c.message.removedOwn)).toBeVisible();
    await expect(log(noa).getByText(answer, { exact: true })).toHaveCount(0);
    await expectCleanPage(noa);
    await deleted.getByRole("button", { name: c.messageActions.undo }).click();
    await expect(toast(noa, c.messageActions.restored)).toBeVisible();
    await expect(log(noa).getByText(answer, { exact: true })).toBeVisible();
    await expect(log(noa).getByText(c.message.removedOwn)).toHaveCount(0);

    // Deleted again, and left so.
    sheet = await openActions(noa, answer);
    await actionRow(sheet, c.messageActions.delete).click();
    await expect(toast(noa, c.messageActions.deleted)).toBeVisible();
    await expect(log(noa).getByText(c.message.removedOwn)).toBeVisible();
  } finally {
    await noa.context().close();
  }

  // Shiran's screen, never reloaded, has it gone within a sync, though it is
  // the chat's newest message: no word of it is left there. Deleting one's
  // own message writes nothing to the log.
  await expect(
    log(page).getByText(c.message.removed, { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(log(page).getByText(answer, { exact: true })).toHaveCount(0);
  expect(await demoChatLogBy(NOA.e164, since)).toBe(0);
});

test("a group's details open on the phone with its people, and muting it shows on the list and stops its pushes", async ({
  page,
}, testInfo) => {
  test.slow();
  const team = (await demoConversation({ kind: "team" })) ?? "";
  expect(team).not.toBe("");

  await enterAs(page, "worker");
  await page.goto("/chat");
  const teamRow = () =>
    page.locator(`a[href="/chat/${team}"]`).filter({ visible: true }).first();
  await expect(teamRow()).not.toContainText(c.list.muted);
  await teamRow().click();
  await expect(page).toHaveURL(new RegExp(`/chat/${team}$`));

  // The title's way to the details is a page of its own on a phone.
  await page
    .getByRole("link", { name: c.info.open, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/chat/${team}/info$`));
  await expect(
    page.getByRole("heading", { level: 1, name: c.info.open }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: c.details.members }),
  ).toBeVisible();
  for (const name of Object.values(NAMES)) {
    await expect(
      main(page).getByText(name, { exact: true }).filter({ visible: true }),
    ).not.toHaveCount(0);
  }
  await expect(
    page.getByRole("heading", { name: c.notice.title }).filter({
      visible: true,
    }),
  ).toBeVisible();
  const mute = page
    .getByRole("switch", { name: c.info.mute })
    .filter({ visible: true });
  await expect(mute).not.toBeChecked();
  // The conversation, kept hidden for going back, holds the desktop's
  // details column too: only what shows counts.
  await expect(
    page.getByText(c.info.muteHint).filter({ visible: true }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("chat-info.png"),
    fullPage: true,
  });

  await mute.click();
  await expect(mute).toBeChecked();
  await expect.poll(() => demoChatMuted(NOA.e164, team)).toBe(true);

  // A message in the group would reach the owner's phone and not hers: the
  // database decides each push as the message is sent (checked as if the
  // demo reached phones, and taken back).
  expect(
    await demoChatPushStates(team, SHIRAN.e164, [NOA.e164, URI.e164]),
  ).toEqual({ [NOA.e164]: "none", [URI.e164]: "queued" });

  // Back through the conversation to the list, which marks the group.
  await page
    .getByRole("link", { name: c.info.back })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/chat/${team}$`));
  await page
    .getByRole("link", { name: c.conversation.back })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(teamRow()).toContainText(c.list.muted);
  await expectCleanPage(page);

  // Kept after a reload: it is the database's.
  await page.reload();
  await expect(teamRow()).toContainText(c.list.muted);
});
