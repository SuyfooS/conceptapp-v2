import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { dateIn } from "../packages/domain/availability";
import { chatDay, chatShortDate } from "../packages/domain/chat-days";
import { noteIfSaid, pastDrawing, wasSaid } from "./announcer";
import {
  clearDemoChat,
  closeDemoDepartment,
  databaseNow,
  demoChatLines,
  demoChatMessagesSince,
  demoConversation,
  demoOldTeamMessage,
  endViewSessions,
  seeDemoChatNotice,
} from "./db";
import { cameraPhoto } from "./photo";
import {
  countLoads,
  markBeforeRelease,
  stillBeforeRelease,
  unknownId,
} from "./release";
import { secondPage, signIn } from "./session";
import { countedTabName, heT, needsActionCount } from "./t";
import { expect, type Locator, type Page, test } from "./test";

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
/** Shiran, the manager, as the demo restaurant names her. */
const SHIRAN_NAME = "שירן הדגמה";
/** A time in a button's name, as the app writes it: in Unicode isolates. */
const isolate = (chunks: string) => `⁦${chunks}⁩`;
/** The demo restaurant's clock. */
const TZ = "Asia/Jerusalem";

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
/**
 * How many chats the Chat tab says wait (0 when it carries no count), from
 * its words: one is said with no digit ("אחד דורש טיפול").
 */
async function tabCount(page: Page): Promise<number> {
  return needsActionCount((await chatTab(page).textContent()) ?? "");
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
/** What has the keyboard's focus now, and its words. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    return {
      tag: active?.tagName.toLowerCase() ?? null,
      words: active?.textContent?.trim() ?? "",
    };
  });

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
      countedTabName(he.modules.chat.name, waiting + 1),
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

// Accessibility, part 7. A text message whose sending is dropped on its way
// (nothing reaches the server, so nothing is written) is said where the
// field keeps the focus, with its way to try again under it; and each
// message's actions button says whose message it opens, when (with its day
// when not today's: the demo's morning is yesterday's before 09:00) and how
// it starts, after the tooltip's word, so each reads apart in a list of the
// page's buttons. Its tooltip says the same, so it adds no description.
test("a message that didn't go is said, and each message's actions say whose and when", async ({
  page,
}) => {
  const words = "e2e: this one never leaves the phone";
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  await enterAs(page, "worker");
  await page.goto(`/chat/${kitchen}`);
  await expect(
    page.getByRole("heading", { level: 1, name: KITCHEN }),
  ).toBeVisible();

  // The kitchen's two from the demo: Noa's own, and Shiran's answer.
  const bubble = (text: string) =>
    log(page).locator("[data-bubble]").filter({ hasText: text });
  /** What the button says of a message after whose: when, and its words. */
  const sentAs = async (one: Locator, said: string) => {
    const time = one.locator("time");
    const day = dateIn(
      new Date((await time.getAttribute("datetime")) ?? ""),
      TZ,
    );
    const today = dateIn(new Date(), TZ);
    const which = chatDay(day, today);
    return {
      when: which.kind,
      date: which.kind === "date" ? chatShortDate(day, today) : "",
      time: (await time.textContent()) ?? "",
      words: said,
      ltr: isolate,
    };
  };
  const shiransWords = "תודה, ההזמנה יוצאת היום";
  const ownWords = "סיימנו לסדר להיום. חסרים חומרי ניקוי";
  const shirans = bubble(shiransWords);
  const own = bubble(ownWords);
  const shiransName = heT.markup("app.chat.messageActions.openFor", {
    name: SHIRAN_NAME,
    ...(await sentAs(shirans, shiransWords)),
  });
  await expect(shirans.locator("[data-message-actions]")).toHaveAttribute(
    "aria-label",
    shiransName,
  );
  await expect(shirans.locator("[data-message-actions]")).toHaveAttribute(
    "title",
    shiransName,
  );
  await expect(
    shirans.locator("[data-message-actions]"),
  ).not.toHaveAccessibleDescription(c.messageActions.open);
  await expect(own.locator("[data-message-actions]")).toHaveAttribute(
    "aria-label",
    heT.markup(
      "app.chat.messageActions.openForOwn",
      await sentAs(own, ownWords),
    ),
  );

  // Its sending dropped on the way: the server never has it.
  let dropped = 0;
  await page.route(
    (url) => url.pathname === `/chat/${kitchen}`,
    async (route) => {
      const request = route.request();
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] !== undefined &&
        (request.postData() ?? "").includes(words)
      ) {
        dropped += 1;
        await route.abort();
        return;
      }
      await route.fallback();
    },
  );
  await noteIfSaid(page, c.conversation.notSent);
  await send(page, words);
  await expect(
    log(page).getByRole("button", { name: c.conversation.failed }),
  ).toBeVisible();
  await expect.poll(() => wasSaid(page, c.conversation.notSent)).toBe(true);
  expect(dropped).toBe(1);
  // The field keeps the focus, for the next message or the way back.
  await expect(composer(page)).toBeFocused();
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

// A page of the release before (closing the pilot, PR 1b): the message goes
// out with an action id the server doesn't have, as e2e/release.ts does it,
// so nothing reaches the demo. It comes back to the field, the line over it
// says the app was updated, with "טעינה מחדש", and it is said once; sent
// again from that page, nothing goes and "טעינה מחדש" takes the focus, its
// description the line; pressed, it loads the page once, and the words
// wait in the field there.
test("a message sent from a page of the release before comes back to the field, and 'טעינה מחדש' keeps it there", async ({
  page,
}) => {
  const words = "e2e: written before the release";
  const u = he.app.updated;
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  const path = `/chat/${kitchen}`;
  await enterAs(page, "worker");
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: KITCHEN }),
  ).toBeVisible();

  // Only its sending goes as from the release before: the chat's own reads
  // go as they are.
  const sent: string[] = [];
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const request = route.request();
      const id = request.headers()["next-action"];
      if (
        request.method() !== "POST" ||
        id === undefined ||
        !(request.postData() ?? "").includes(words)
      ) {
        await route.fallback();
        return;
      }
      sent.push(id);
      const headers = await request.allHeaders();
      await route.continue({
        headers: { ...headers, "next-action": unknownId(id) },
      });
    },
  );
  const loads = countLoads(page);
  await markBeforeRelease(page);
  await noteIfSaid(page, u.chat);
  const reload = page.getByRole("button", { name: u.reload, exact: true });
  const bubble = log(page).locator("[data-bubble]").filter({ hasText: words });
  try {
    await send(page, words);
    // Nothing went: the words are back in the field and nowhere in the
    // conversation, and the line says so, with its button; the page as it was.
    await expect(page.getByText(u.chat)).toBeVisible();
    await expect(reload).toBeVisible();
    await expect(composer(page)).toHaveValue(words);
    await expect(bubble).toHaveCount(0);
    await expect.poll(() => wasSaid(page, u.chat)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(loads.count).toBe(0);
    expect(await stillBeforeRelease(page)).toBe(true);
    await expectCleanPage(page);

    // Sent again from that page: nothing goes, the words stay, and
    // "טעינה מחדש", the only way on, takes the focus, after the composer
    // put it back in its field: its focus reads the line, once, and no line
    // of the screen's own says it again.
    await sendButton(page).click();
    await expect(reload).toBeFocused();
    await expect(reload).toHaveAccessibleDescription(u.chat);
    await pastDrawing(page);
    await expect(
      page.locator("p[aria-live]").filter({ hasText: u.chat }),
    ).toHaveCount(0);
    await expect(composer(page)).toHaveValue(words);
    await expect(bubble).toHaveCount(0);
    expect(sent).toHaveLength(1);

    // "טעינה מחדש": the same address loaded once, the words in the field,
    // and nothing sent.
    const loaded = page.waitForEvent("load");
    await reload.click();
    await loaded;
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(composer(page)).toHaveValue(words);
    await expect(page.getByText(u.chat)).toHaveCount(0);
    await expect(bubble).toHaveCount(0);
    expect(sent).toHaveLength(1);
    expect(loads.count).toBe(1);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

// The same, as an announcement: Shiran runs the chat, so she may post one in
// the kitchen, its switch turned on by hand (no "?announce=1" in the
// address, which would turn it on by itself after the reload). The words
// come back with the switch still on, and "טעינה מחדש" keeps both for the
// page loaded, which turns the switch on again with them. Nothing reaches
// the demo.
test("an announcement sent from a page of the release before keeps its switch, in the field and across 'טעינה מחדש'", async ({
  page,
}) => {
  const words = "e2e: an announcement written before the release";
  const u = he.app.updated;
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  const path = `/chat/${kitchen}`;
  await enterAs(page, "manager");
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: KITCHEN }),
  ).toBeVisible();
  const asAnnouncement = page
    .getByRole("switch", { name: c.announcement.switch })
    .filter({ visible: true });
  await expect(asAnnouncement).not.toBeChecked();
  await asAnnouncement.click();
  await expect(asAnnouncement).toBeChecked();

  const sent: string[] = [];
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const request = route.request();
      const id = request.headers()["next-action"];
      if (
        request.method() !== "POST" ||
        id === undefined ||
        !(request.postData() ?? "").includes(words)
      ) {
        await route.fallback();
        return;
      }
      sent.push(id);
      const headers = await request.allHeaders();
      await route.continue({
        headers: { ...headers, "next-action": unknownId(id) },
      });
    },
  );
  const loads = countLoads(page);
  await markBeforeRelease(page);
  const reload = page.getByRole("button", { name: u.reload, exact: true });
  const bubble = log(page).locator("[data-bubble]").filter({ hasText: words });
  const post = page
    .getByRole("button", { name: c.announcement.send, exact: true })
    .filter({ visible: true });
  try {
    await composer(page).fill(words);
    await post.click();
    // Nothing went: the words are back, and so is the switch, which a send
    // turns off as the message goes.
    await expect(page.getByText(u.chat)).toBeVisible();
    await expect(composer(page)).toHaveValue(words);
    await expect(asAnnouncement).toBeChecked();
    await expect(post).toBeVisible();
    await expect(bubble).toHaveCount(0);
    expect(sent).toHaveLength(1);
    expect(loads.count).toBe(0);

    // "טעינה מחדש": the words in the field, the switch on with them, and
    // nothing sent.
    const loaded = page.waitForEvent("load");
    await reload.click();
    await loaded;
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(composer(page)).toHaveValue(words);
    await expect(asAnnouncement).toBeChecked();
    await expect(page.getByText(u.chat)).toHaveCount(0);
    await expect(bubble).toHaveCount(0);
    expect(sent).toHaveLength(1);
    expect(loads.count).toBe(1);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

// Accessibility, part 7. The kitchen removed while Shiran writes there: she
// runs the chat, so she still reads it, closed. Her message doesn't go
// ("closed"), the screen is drawn again with the reason, and that line
// takes the focus the field had; nothing says "אפשר לנסות שוב", nor the
// reason a second time. Tried again from its bubble while the chat is
// closed, nothing on screen changes, so the conversation says it didn't go
// and why. After the third check, a picture too: one whose sending was
// dropped on its way while the kitchen was open (nothing reached the
// server), tried again there, is refused the same way and said so, as no
// notice over the field is drawn while nobody writes. Nothing is written;
// the kitchen comes back after.
test("a message sent as its chat closes says only why, and trying it or a picture again there says it didn't go", async ({
  page,
}) => {
  // A picture made ready on the page, and the line's seconds waited out.
  test.slow();
  const words = "e2e: written as the kitchen closed";
  const caption = "e2e: a picture dropped on its way";
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  const bubble = (text: string) =>
    log(page).locator("[data-bubble]").filter({ hasText: text });
  await enterAs(page, "manager");
  await page.goto(`/chat/${kitchen}`);
  await expect(
    page.getByRole("heading", { level: 1, name: KITCHEN }),
  ).toBeVisible();
  const since = await databaseNow();

  // The picture first, with its words, its sending dropped on the way: the
  // one action sent with files (a form, so multipart), never a text's.
  let dropped = 0;
  await page.route(
    (url) => url.pathname === `/chat/${kitchen}`,
    async (route) => {
      const request = route.request();
      const type = request.headers()["content-type"] ?? "";
      const body = request.postDataBuffer();
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] !== undefined &&
        (type.startsWith("multipart/form-data") ||
          (body?.includes(caption) ?? false))
      ) {
        dropped += 1;
        await route.abort();
        return;
      }
      await route.fallback();
    },
  );
  await page
    .getByRole("button", { name: c.conversation.attach, exact: true })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: c.attach.title });
  await expect(sheet).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await sheet
    .getByRole("button", { name: new RegExp(`^${literal(c.attach.photo)}`) })
    .click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  await expect(
    page.getByRole("img", { name: c.image.chosen }).filter({ visible: true }),
  ).toBeVisible();
  await send(page, caption);
  const pictureAgain = bubble(caption).getByRole("button", {
    name: c.conversation.failed,
  });
  await expect(pictureAgain).toBeVisible();
  expect(dropped).toBe(1);
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // Then a message, sent as the kitchen is removed.
  await composer(page).fill(words);
  await noteIfSaid(page, c.conversation.notSent);
  await noteIfSaid(page, c.conversation.closed);
  const reopen = await closeDemoDepartment(KITCHEN);
  try {
    await sendButton(page).click();
    await expect(composer(page)).toHaveCount(0);
    await expect
      .poll(() => focused(page))
      .toEqual({ tag: "p", words: c.conversation.closed });
    const again = bubble(words).getByRole("button", {
      name: c.conversation.failed,
    });
    await expect(again).toBeVisible();
    await pastDrawing(page);
    expect(await wasSaid(page, c.conversation.notSent)).toBe(false);
    expect(await wasSaid(page, c.conversation.closed)).toBe(false);

    // Tried again from the keyboard: refused again, and said so.
    await noteIfSaid(page, c.conversation.notSentBlocked);
    await again.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => wasSaid(page, c.conversation.notSentBlocked))
      .toBe(true);
    await expect(again).toBeVisible();

    // The picture tried again there, once the line went quiet: refused the
    // same way ("closed", before anything is stored), and said so too.
    await expect(
      page
        .locator(
          '[role="status"]:not([aria-live="off"]), [aria-live]:not([aria-live="off"])',
        )
        .filter({ hasText: c.conversation.notSentBlocked }),
    ).toHaveCount(0, { timeout: 15_000 });
    await noteIfSaid(page, c.conversation.notSentBlocked);
    await pictureAgain.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(() => wasSaid(page, c.conversation.notSentBlocked))
      .toBe(true);
    await expect(pictureAgain).toBeVisible();
    expect(await wasSaid(page, c.conversation.notSent)).toBe(false);
    expect(await demoChatMessagesSince(kitchen ?? "", since)).toBe(0);
  } finally {
    await reopen();
  }
});

// The kitchen removed while Noa, who is in it, writes there: she no longer
// reads it, so her message doesn't go ("noAccess") and the chat's
// not-found screen takes its place, with no composer to say why: its title
// takes the focus that went with the field. Nothing is written.
test("a message sent as its chat goes from the reader gives the not-found title the focus", async ({
  page,
}) => {
  const words = "e2e: written as the kitchen went";
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  await enterAs(page, "worker");
  await page.goto(`/chat/${kitchen}`);
  await expect(
    page.getByRole("heading", { level: 1, name: KITCHEN }),
  ).toBeVisible();
  await composer(page).fill(words);
  const since = await databaseNow();
  const reopen = await closeDemoDepartment(KITCHEN);
  try {
    await sendButton(page).click();
    await expect(notFoundTitle(page).filter({ visible: true })).toBeFocused();
    expect(await demoChatMessagesSince(kitchen ?? "", since)).toBe(0);
  } finally {
    await reopen();
  }
});

// Accessibility, part 7, after its third check, in the tablet's shape (one
// run, on the phone's device, as the rest of this file). The kitchen removed
// while Noa's list beside the screen still shows it (its syncs answered with
// nothing new meanwhile): its row pressed from the keyboard opens the chat's
// not-found screen beside the list, and its title takes the focus from the
// row, now marked as the chat open, as a chat's title would. Every chat has
// the same page title, so nothing else says the screen beside changed.
test("beside the list, a chat no longer the reader's opened from its row gives the not-found title the focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  const kitchenRow = page
    .locator("[data-chat-list]")
    .filter({ visible: true })
    .locator(`a[href="/chat/${kitchen}"]`)
    .first();
  await enterAs(page, "worker");
  await page.goto("/chat");
  await expect(kitchenRow).toBeVisible();
  await page.route(
    (url) => url.pathname === "/chat-sync",
    (route) => route.fulfill({ status: 204 }),
  );
  const reopen = await closeDemoDepartment(KITCHEN);
  try {
    await kitchenRow.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/chat/${kitchen}$`));
    await expect(notFoundTitle(page).filter({ visible: true })).toBeFocused();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await reopen();
  }
});

// The kitchen removed while Shiran's screen of it is kept hidden for going
// back, left with the focus in its field: opened again from the list, it is
// drawn so from the start. Its title takes the focus, as a conversation
// opened from the list does on a phone, never the line that says why
// nobody writes there, and that line isn't said.
test("a chat that closed while kept for going back opens with its title focused, and says nothing", async ({
  page,
}) => {
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  expect(kitchen).not.toBeNull();
  await enterAs(page, "manager");
  await chatTab(page).click();
  await expect(page).toHaveURL(/\/chat$/);
  const kitchenRow = page
    .locator(`a[href="/chat/${kitchen}"]`)
    .filter({ visible: true })
    .first();
  await kitchenRow.click();
  await expect(page).toHaveURL(new RegExp(`/chat/${kitchen}$`));
  await composer(page).click();
  await expect(composer(page)).toBeFocused();
  const reopen = await closeDemoDepartment(KITCHEN);
  try {
    await page.goBack();
    await expect(page).toHaveURL(/\/chat$/);
    await noteIfSaid(page, c.conversation.closed);
    await kitchenRow.click();
    await expect(page).toHaveURL(new RegExp(`/chat/${kitchen}$`));
    await expect(
      page.getByText(c.conversation.closed).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("heading", { level: 1, name: KITCHEN })
        .filter({ visible: true }),
    ).toBeFocused();
    await pastDrawing(page);
    expect(await wasSaid(page, c.conversation.closed)).toBe(false);
  } finally {
    await reopen();
  }
});

/**
 * Holds a chat screen on its way, as a slow phone network does: the answer
 * to its navigation waits until `release`. Never a prefetch, so what Next
 * draws at once (the screen's skeleton) still comes. `held` says how many
 * were held, so a test knows the hold was in the way.
 */
async function holdScreen(page: Page, path: string) {
  let release = () => {};
  const released = new Promise<void>((go) => {
    release = go;
  });
  let held = 0;
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      const headers = route.request().headers();
      if (
        headers.rsc === "1" &&
        headers["next-router-prefetch"] === undefined &&
        headers["next-router-segment-prefetch"] === undefined
      ) {
        held += 1;
        await released;
      }
      await route.fallback();
    },
  );
  return { held: () => held, release };
}

// Accessibility, part 7, in the tablet's shape (the list beside the
// conversation; one run, on the phone's device, as the rest of this file).
// A chat opened from the list, by the keyboard, whose focus stays on the
// row pressed, gives its title the focus: every chat has the same page
// title, so nothing else says it opened; the announcements' title too. A
// focus moved on while a screen loads stays where it was put, on another
// row of the list too. A chat
// chosen in "שליחת הודעה" beside it takes the focus to its title: while it
// is on its way the sheet's button holds it, never the chat being left or
// a skeleton; the chat on screen chosen again, at once. Closed with no one
// chosen, the sheet gives the focus back to its button. Opening chats marks
// them read: clearDemoChat puts that back.
test("beside the list, a chat opened from it or chosen in a new message takes the focus to its title", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const kitchen = await demoConversation({ kind: "department", name: KITCHEN });
  const team = await demoConversation({ kind: "team" });
  const title = (name: string) =>
    page.getByRole("heading", { level: 1, name }).filter({ visible: true });
  // A row of the list beside the screen (InboxPane).
  const row = (href: string) =>
    page
      .locator("[data-chat-list]")
      .filter({ visible: true })
      .locator(`a[href="${href}"]`)
      .first();
  await enterAs(page, "worker");
  await page.goto(`/chat/${kitchen}`);
  // Opened with the focus nowhere: the kitchen's title takes it, once the
  // page has hydrated and its effect has run.
  await expect(title(KITCHEN)).toBeFocused();

  // The list beside it, its team row pressed from the keyboard.
  const teamRow = row(`/chat/${team}`);
  await expect(teamRow).toBeVisible();
  await teamRow.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/chat/${team}$`));
  await expect(title(c.list.team)).toBeFocused();

  // The announcements' row pressed, and the kitchen's row moved to while
  // they load: the focus stays there.
  const kitchenRow = row(`/chat/${kitchen}`);
  const announcements = await holdScreen(page, "/chat/announcements");
  await row("/chat/announcements").focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => announcements.held()).toBeGreaterThan(0);
  await kitchenRow.focus();
  announcements.release();
  await expect(page).toHaveURL(/\/chat\/announcements$/);
  await expect(title(c.announcement.page.title)).toBeVisible();
  await pastDrawing(page);
  await expect(kitchenRow).toBeFocused();

  // That row pressed: the kitchen, kept for going back, gives its title the
  // focus again. Then the announcements' row, nothing held: their title
  // takes the focus from it, as a conversation's does (ChatPageHeader).
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/chat/${kitchen}$`));
  await expect(title(KITCHEN)).toBeFocused();
  await row("/chat/announcements").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/chat\/announcements$/);
  await expect(title(c.announcement.page.title)).toBeFocused();

  const newMessage = page
    .getByRole("button", { name: c.list.newMessage, exact: true })
    .filter({ visible: true });
  const sheet = page.getByRole("dialog", { name: c.list.newMessage });

  // Yoav chosen, his new chat still on its way: the button holds the focus,
  // and his chat's title takes it as it opens.
  await newMessage.click();
  await sheet.getByLabel(c.newMessage.search).fill("יואב");
  const yoav = sheet.getByRole("link", { name: /יואב לוי/ });
  const yoavPath = (await yoav.getAttribute("href")) ?? "";
  expect(yoavPath).toMatch(/^\/chat\/with\/[0-9a-f-]{36}$/);
  const yoavScreen = await holdScreen(page, yoavPath);
  await yoav.click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => yoavScreen.held()).toBeGreaterThan(0);
  await expect(newMessage).toBeFocused();
  yoavScreen.release();
  await expect(page).toHaveURL(new RegExp(`${yoavPath}$`));
  await expect(title("יואב לוי")).toBeFocused();

  // Shiran chosen: her chat's title.
  await newMessage.click();
  await sheet.getByLabel(c.newMessage.search).fill("שירן");
  await sheet.getByRole("link", { name: new RegExp(SHIRAN_NAME) }).click();
  await expect(sheet).toHaveCount(0);
  await expect(title(SHIRAN_NAME)).toBeFocused();

  // Chosen again, the chat on screen: its title, with no address to change.
  await newMessage.click();
  await sheet.getByLabel(c.newMessage.search).fill("שירן");
  await sheet.getByRole("link", { name: new RegExp(SHIRAN_NAME) }).click();
  await expect(sheet).toHaveCount(0);
  await expect(title(SHIRAN_NAME)).toBeFocused();

  await newMessage.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(newMessage).toBeFocused();
});
