import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearDemoChat,
  demoChatLines,
  demoConversation,
  demoOldTeamMessage,
  endViewSessions,
  seeDemoChatNotice,
} from "./db";
import { secondPage, signIn } from "./session";

// Chat on screen (C2 of the chat plan). The demo restaurant's reset writes
// its conversations (private.seed_demo_chat): Uri's thanks and Shiran's two
// morning messages in the whole team's group, Noa's message and Shiran's
// answer in the kitchen, and Shiran's private chat with Noa. Each
// test puts them back before and after (clearDemoChat), and marks the notice
// of who sees what as read for the people it signs in, but the test of the
// notice itself. The people are seeded in supabase/seed.sql: Noa in the
// kitchen, Yoav at the bar and the storeroom, Shiran (the manager, a
// moderator) on the floor and at the bar, Uri the owner, Galit the
// accountant. These write the shared demo, so they run once, on the phone,
// where a conversation takes the whole screen; design.spec.ts covers the
// three shapes on /design/chat and screens.spec.ts opens /chat at each width.
// Counts are read before and compared after, never assumed.
const NOA = {
  local: "050-000-0003",
  e164: "+972500000003",
  id: "00000000-0000-4000-a000-000000000003",
};
const YOAV = { local: "050-000-0004", e164: "+972500000004" };
const SHIRAN = { local: "050-000-0002", e164: "+972500000002" };
const URI = { local: "050-000-0001", e164: "+972500000001" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const KITCHEN = "מטבח";

const c = he.app.chat;
const e = he.auth.enter;
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

type DoorPerson = "owner" | "manager" | "worker" | "accountant";

/** One of the demo restaurant's people chosen at the door, on it already. */
async function choose(page: Page, key: DoorPerson) {
  await page
    .getByRole("region", { name: e.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/** In through the door, as one of the demo restaurant's people. */
async function enterAs(page: Page, key: DoorPerson) {
  await page.goto("/enter");
  await choose(page, key);
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
const bell = (page: Page) =>
  page.getByRole("main").getByRole("link", {
    name: new RegExp(`^${literal(he.app.notifications.bell)}`),
  });
const composer = (page: Page) =>
  page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true });
const sendButton = (page: Page) =>
  page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true });
/** The conversation on screen; a kept, hidden copy of another never counts. */
const log = (page: Page) =>
  page.getByRole("log", { name: c.conversation.log }).filter({ visible: true });
const notFoundTitle = (page: Page) =>
  page.getByRole("heading", { level: 1, name: he.app.notFound.title });

async function send(page: Page, words: string) {
  await composer(page).fill(words);
  await sendButton(page).click();
}

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

test("a private chat reaches the other phone without a reload, says it was read, and nobody else has it", async ({
  page,
  browser,
}, testInfo) => {
  // Four people in, one with a code by SMS (which may wait out the auth
  // server's resend wait), and two waits for the sync.
  test.setTimeout(180_000);
  const first = "יואב, אפשר להחליף איתך את שישי?";
  const second = "אם לא, גם בסדר";

  await enterAs(page, "worker");
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { level: 1, name: he.modules.chat.name }),
  ).toBeVisible();
  await expectCleanPage(page);

  // A new message, to Yoav: his private chat doesn't exist until it goes.
  await page
    .getByRole("button", { name: c.list.newMessage })
    .filter({ visible: true })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: c.list.newMessage });
  await sheet.getByLabel(c.newMessage.search).fill("יואב");
  await sheet.getByRole("link", { name: /יואב לוי/ }).click();
  await expect(page).toHaveURL(/\/chat\/with\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "יואב לוי" }),
  ).toBeVisible();
  // A demo business: whoever comes in may come in as either of them, so the
  // conversation says so, never "only the two of you".
  await expect(
    page.getByText(c.list.demoNote).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(c.conversation.privateNote).filter({ visible: true }),
  ).toHaveCount(0);
  // The conversation takes the whole phone: no tab bar, the composer instead.
  await expect(nav(page)).toHaveCount(0);
  await send(page, first);
  await expect(log(page).getByText(first)).toBeVisible();
  // The first message made the chat, and the screen went on as it, where it
  // was: nothing drawn again, and the keyboard still in the field.
  await expect(log(page).getByText(c.conversation.sending)).toHaveCount(0);
  await expect(page).toHaveURL(/\/chat\/with\/[0-9a-f-]{36}$/);
  await expect(composer(page)).toBeFocused();
  await expect
    .poll(() =>
      demoConversation({ kind: "direct", between: [NOA.e164, YOAV.e164] }),
    )
    .not.toBeNull();
  const id =
    (await demoConversation({
      kind: "direct",
      between: [NOA.e164, YOAV.e164],
    })) ?? "";
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("chat-private.png"),
    fullPage: true,
  });

  // Yoav, on his own phone, opens it; what Noa writes next comes by itself.
  const yoav = await secondPage(browser, testInfo);
  try {
    await signIn(yoav, YOAV);
    await yoav.goto(`/chat/${id}`);
    await expect(log(yoav).getByText(first)).toBeVisible();
    await expectCleanPage(yoav);

    await send(page, second);
    await expect(log(page).getByText(second)).toBeVisible();
    await expect(log(yoav).getByText(second)).toBeVisible({ timeout: 15_000 });
    // Yoav's screen read it, and Noa's says so, on that message.
    await expect(
      log(page)
        .locator("div")
        .filter({ hasText: second })
        .filter({ hasText: c.conversation.seen })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await yoav.context().close();
  }

  // Not the owner's, not the manager's: not in their list, and its address
  // is the same not-found screen as one that doesn't exist. Shiran's own
  // private chat with Noa isn't Uri's either.
  const theirs = await demoConversation({
    kind: "direct",
    between: [SHIRAN.e164, NOA.e164],
  });
  for (const key of ["owner", "manager"] as const) {
    const other = await secondPage(browser, testInfo);
    try {
      await enterAs(other, key);
      await other.goto("/chat");
      await expect(
        other.getByRole("heading", { level: 1, name: he.modules.chat.name }),
      ).toBeVisible();
      await expect(other.locator(`a[href="/chat/${id}"]`)).toHaveCount(0);
      if (key === "owner") {
        await expect(other.locator(`a[href="/chat/${theirs}"]`)).toHaveCount(0);
      }
      await other.goto(`/chat/${id}`);
      await expect(notFoundTitle(other)).toBeVisible();
      await expect(other.getByText(first)).toHaveCount(0);
      await other.goto("/chat/00000000-0000-4000-a000-0000000000ff");
      await expect(notFoundTitle(other)).toBeVisible();
    } finally {
      await other.context().close();
    }
  }
});

test("a message in the kitchen reaches management, and the Chat tab counts it while the bell doesn't", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const words = "נגמר הקמח, מישהו יכול להביא מהמחסן?";
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();

  const shiran = await secondPage(browser, testInfo);
  try {
    await enterAs(shiran, "manager");
    const waiting = await tabCount(shiran);
    const bellName = await bell(shiran).getAttribute("aria-label");

    // Noa writes in her department's group.
    await enterAs(page, "worker");
    await page.goto(`/chat/${kitchen}`);
    await expect(
      page.getByRole("heading", { level: 1, name: KITCHEN }),
    ).toBeVisible();
    await send(page, words);
    await expect(log(page).getByText(words)).toBeVisible();
    // Written: it no longer says it is being sent, and Shiran's line is there
    // (the same write) before her page is drawn again.
    await expect(log(page).getByText(c.conversation.sending)).toHaveCount(0);
    await expectCleanPage(page);
    await expect
      .poll(async () =>
        (await demoChatLines(SHIRAN.e164)).filter(
          (line) =>
            line.kind === "chat.group" &&
            line.conversation === kitchen &&
            !line.read,
        ),
      )
      .toHaveLength(1);

    // Shiran's Chat tab counts one more chat; her bell is as it was, though
    // the line for her phone is there.
    await shiran.reload();
    await expect(chatTab(shiran)).toHaveAccessibleName(
      new RegExp(`^${literal(he.modules.chat.name)}\\s*,\\s*${waiting + 1}\\b`),
    );
    expect(await bell(shiran).getAttribute("aria-label")).toBe(bellName);

    // Shiran, a moderator, reads the kitchen though she isn't in it.
    await chatTab(shiran).click();
    await expect(shiran).toHaveURL(/\/chat$/);
    await expect(
      shiran.getByRole("heading", { name: c.list.moreDepartments }),
    ).toBeVisible();
    await expectCleanPage(shiran);
    await shiran
      .locator(`a[href="/chat/${kitchen}"]`)
      .filter({ visible: true })
      .first()
      .click();
    await expect(shiran).toHaveURL(new RegExp(`/chat/${kitchen}$`));
    await expect(log(shiran).getByText(words)).toBeVisible();
    await expectCleanPage(shiran);
    await shiran.screenshot({
      path: testInfo.outputPath("chat-kitchen.png"),
      fullPage: true,
    });

    // Read now: the line is read, and the count goes back.
    await expect
      .poll(async () =>
        (await demoChatLines(SHIRAN.e164)).some(
          (line) => line.conversation === kitchen && !line.read,
        ),
      )
      .toBe(false);
    await shiran.goto("/home");
    expect(await tabCount(shiran)).toBe(waiting);
  } finally {
    await shiran.context().close();
  }
});

test("the first visit says who sees what before the list, and 'הבנתי' keeps it away", async ({
  page,
}) => {
  await clearDemoChat("restaurant", { notices: true });
  await enterAs(page, "worker");
  await page.goto("/chat");
  const notice = page.getByRole("heading", { name: c.notice.title });
  await expect(notice).toBeVisible();
  // In a demo business it says what is true there: whoever comes in reads
  // every chat, and what is written goes after an hour.
  await expect(page.getByText(c.notice.demoPrivate)).toBeVisible();
  await expect(page.getByText(c.notice.demoKept)).toBeVisible();
  await expect(page.getByText(c.notice.private)).toHaveCount(0);
  const groups = page.getByRole("heading", {
    name: c.list.groups,
    exact: true,
  });
  const noticeBox = await notice.boundingBox();
  const groupsBox = await groups.boundingBox();
  expect(noticeBox?.y ?? 0).toBeLessThan(groupsBox?.y ?? 0);
  // The demo says that everyone who comes in reads it.
  await expect(page.getByText(c.list.demoNote)).toBeVisible();
  await expectCleanPage(page);

  // The press is kept in the database before the page goes.
  const kept = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/chat",
  );
  await page.getByRole("button", { name: c.notice.ok }).click();
  await expect(notice).toHaveCount(0);
  // The keyboard's focus goes on to the list, not to the page.
  await expect(groups).toBeFocused();
  await kept;
  await page.reload();
  await expect(groups).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("the accountant has no chat, and the owner writes to a colleague from their page", async ({
  page,
  browser,
}, testInfo) => {
  await enterAs(page, "accountant");
  await expect(chatTab(page)).toHaveCount(0);
  await page.goto("/chat");
  await expect(notFoundTitle(page)).toBeVisible();

  const uri = await secondPage(browser, testInfo);
  try {
    await enterAs(uri, "owner");
    await uri.goto(`/team/${NOA.id}`);
    const message = uri
      .getByRole("main")
      .getByRole("link", { name: he.app.team.person.message });
    await expect(message).toHaveAttribute("href", `/chat/with/${NOA.id}`);
    await message.click();
    await expect(uri).toHaveURL(new RegExp(`/chat/with/${NOA.id}$`));
    await expect(
      uri.getByText(c.conversation.emptyPrivate).filter({ visible: true }),
    ).toBeVisible();
    await expect(composer(uri)).toBeVisible();
    await expectCleanPage(uri);
  } finally {
    await uri.context().close();
  }
});

test("someone else coming in on the same phone finds nothing of the last person's chats", async ({
  page,
}) => {
  test.slow();
  // Noa hasn't read the notice; a message from before she came onto the
  // staff is in the team's group, which Shiran, management, reads.
  await clearDemoChat("restaurant", { notices: true });
  await seeDemoChatNotice(SHIRAN.e164);
  const old = "הודעה מלפני שנועה הגיעה לצוות";
  await demoOldTeamMessage(old);
  const team = await demoConversation({ kind: "team" });
  const draft = "טיוטה של שירן שלא נשלחה";
  const teamRow = () =>
    page.locator(`a[href="/chat/${team}"]`).filter({ visible: true }).first();

  // Shiran opens the team's group, reads the old message and starts writing,
  // moving inside the app only, as a hand on a shared phone would.
  await enterAs(page, "manager");
  await chatTab(page).click();
  await expect(page).toHaveURL(/\/chat$/);
  await teamRow().click();
  await expect(log(page).getByText(old)).toBeVisible();
  await composer(page).fill(draft);
  await page
    .getByRole("link", { name: c.conversation.back })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/chat$/);
  await nav(page)
    .getByRole("link", { name: new RegExp(`^${literal(he.app.nav.home)}`) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await page
    .getByRole("main")
    .getByRole("link", { name: he.app.me.open, exact: true })
    .click();
  await expect(page).toHaveURL(/\/me$/);

  // Signing out is a whole new page: nothing the app drew stays in it.
  await page.evaluate(() => {
    (window as Window & { beforeSignOut?: boolean }).beforeSignOut = true;
  });
  const loaded = page.waitForEvent("load");
  await page.getByRole("button", { name: he.app.signOut }).click();
  await loaded;
  await expect(page).toHaveURL(/\/enter$/);
  expect(
    await page.evaluate(
      () => (window as Window & { beforeSignOut?: boolean }).beforeSignOut,
    ),
  ).toBeUndefined();

  // Noa, in the same tab: no draft, nothing from before she came, and the
  // notice of who sees what, where the conversation opens.
  await choose(page, "worker");
  await chatTab(page).click();
  await expect(page).toHaveURL(/\/chat$/);
  await teamRow().click();
  await expect(page).toHaveURL(new RegExp(`/chat/${team}$`));
  await expect(composer(page)).toHaveValue("");
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll("textarea")].map((field) => field.value),
    ),
  ).not.toContain(draft);
  await expect(page.getByText(old)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: c.notice.title }).filter({
      visible: true,
    }),
  ).toBeInViewport();
});

test("viewing as a manager shows only that chats aren't shown", async ({
  page,
}) => {
  // A code by SMS, which may wait out the resend wait of view-as.spec.ts's.
  test.slow();
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", {
      name: he.admin.setup.viewAs.as.manager,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  // The tab stays, as the manager's bar has it.
  await expect(chatTab(page)).toBeVisible();

  await page.goto("/chat");
  await expect(page.getByText(c.viewing)).toBeVisible();
  await expect(page.getByRole("main").locator('a[href^="/chat/"]')).toHaveCount(
    0,
  );
  await expectCleanPage(page);

  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  await page.goto(`/chat/${kitchen}`);
  await expect(page.getByText(c.viewing)).toBeVisible();
  await expect(page.getByRole("log")).toHaveCount(0);
});
