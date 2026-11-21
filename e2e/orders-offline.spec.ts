import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  addOpenDemoEntry,
  clearTimeEntries,
  clearTimeEntriesSince,
  databaseNow,
  demoRoundSenders,
  demoRounds,
  resetDemoOrders,
  userIdOf,
} from "./db";
import {
  button,
  enterAs,
  expectCleanPage,
  heading,
  loadRestaurantWords,
  main,
  NOA,
  OWNER,
  rt,
  SHIRAN,
  send,
  showItems,
  shown,
  showOrder,
  tile,
  toast,
  toFloor,
  undoOn,
  YOAV,
} from "./orders-parts";
import { signIn } from "./session";

// Taking orders with no connection (waiter mode P7): a round sent offline
// waits on the phone as "עוד לא נשלח" and goes once when the connection is
// back; it is never sent as the next person on a shared phone, and goes as
// its own when she is back; a killed app sends what waited as it opens
// again; one waiting more than ten minutes asks first, removed with its
// undo, then sent; and signing out with one waiting asks once and takes it
// off the phone. The network goes with `setOffline`, and with `page.route`
// where the next step needs it (the demo door, a sign-in). The rounds the
// phone keeps are read from its IndexedDB.

test.beforeAll(loadRestaurantWords);

/** When the test began, by the database's clock: what it wrote is newer. */
let began = new Date(0);

test.beforeEach(async () => {
  began = await databaseNow();
});

test.afterEach(async () => {
  await resetDemoOrders();
  await clearTimeEntriesSince(YOAV.e164, began);
  for (const phone of [SHIRAN, NOA, OWNER]) {
    await clearTimeEntries(phone);
  }
});

const SENDS = "**/orders-send";
const lemonade = "לימונדה";

/**
 * How many rounds the phone keeps, a person's or everyone's, read from its
 * store as the outbox wrote it. None kept yet: none, and nothing created.
 */
async function outboxRows(page: Page, user?: string): Promise<number> {
  return page.evaluate(async (who) => {
    const known = await indexedDB.databases();
    if (!known.some((db) => db.name === "conceptapp-orders")) return 0;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("conceptapp-orders");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      if (!db.objectStoreNames.contains("rounds")) return 0;
      const rows = await new Promise<{ user: string }[]>((resolve, reject) => {
        const request = db.transaction("rounds").objectStore("rounds").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return rows.filter((row) => !who || row.user === who).length;
    } finally {
      db.close();
    }
  }, user ?? null);
}

/** Every round the phone keeps, sent `minutes` earlier than it was. */
async function ageRows(page: Page, minutes: number): Promise<void> {
  await page.evaluate(async (by) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("conceptapp-orders");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("rounds", "readwrite");
      const store = tx.objectStore("rounds");
      const all = store.getAll();
      all.onsuccess = () => {
        for (const row of all.result as {
          queuedAt: number;
          askFrom: number;
        }[]) {
          store.put({
            ...row,
            queuedAt: row.queuedAt - by * 60_000,
            askFrom: row.askFrom - by * 60_000,
          });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, minutes);
}

const table = (name: string) => rt("app.orders.place.numbered", { name });

/** Table 8 with a lemonade, sent: the round on its way. */
async function sendLemonade(page: Page, project: string) {
  await page.goto("/orders");
  await expect(heading(page, 1, rt("app.orders.floor.title"))).toBeVisible();
  await tile(page, "8").click();
  await expect(page).toHaveURL(/\/orders\/place\//);
  await expect(heading(page, 1, table("8"))).toBeVisible();
  await showItems(page, project);
  await button(page, lemonade).click();
  await showOrder(page, project);
  await send(page);
}

const notSent = () => rt("app.orders.ticketState.notSent");

test("with no connection the order waits as עוד לא נשלח, and goes once when the connection is back", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const project = testInfo.project.name;
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.goto("/orders");
  await tile(page, "8").click();
  await expect(heading(page, 1, table("8"))).toBeVisible();
  await showItems(page, project);
  await button(page, lemonade).click();
  await showOrder(page, project);

  await page.context().setOffline(true);
  const offline = heading(page, 2, rt("app.orders.offline.title"));
  await expect(offline).toBeVisible();
  await send(page);
  await expect(shown(page, notSent())).toBeVisible();
  expect(await demoRounds("8")).toBe(0);
  expect(await outboxRows(page)).toBe(1);
  await expectCleanPage(page);

  await page.context().setOffline(false);
  await expect.poll(() => demoRounds("8")).toBe(1);
  await expect(shown(page, notSent())).toBeHidden();
  await expect(offline).toHaveCount(0);
  await expect.poll(() => outboxRows(page)).toBe(0);

  // Opened again, it went once.
  const synced = page.waitForResponse((r) => r.url().includes("/orders-sync"));
  await page.reload();
  await synced;
  expect(await demoRounds("8")).toBe(1);
  expect(await outboxRows(page)).toBe(0);
});

test("switching demo person keeps the order unsent, never sent as the next person, and sent as its own when she is back", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  test.setTimeout(120_000);
  await addOpenDemoEntry(SHIRAN, 1);
  await enterAs(page, "manager");
  await page.route(SENDS, (route) => route.abort("internetdisconnected"));
  await sendLemonade(page, "desktop");
  await expect(shown(page, notSent())).toBeVisible();
  const shiran = await userIdOf(SHIRAN);
  expect(await outboxRows(page, shiran)).toBe(1);

  // Uri on the same phone, who takes orders too.
  await enterAs(page, "owner");
  await page.unroute(SENDS);
  const answers: { status: number; user: string | null }[] = [];
  page.on("response", (response) => {
    if (!response.url().includes("/orders-send")) return;
    const body = response.request().postData();
    answers.push({
      status: response.status(),
      user: body
        ? ((JSON.parse(body) as { user?: string }).user ?? null)
        : null,
    });
  });
  await page.goto("/orders");
  await expect(heading(page, 1, rt("app.orders.floor.title"))).toBeVisible();
  const synced = page.waitForResponse((r) => r.url().includes("/orders-sync"));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await synced;
  expect(await demoRounds("8")).toBe(0);
  expect(await outboxRows(page, shiran)).toBe(1);
  // Never sent as Uri; a stale try, if any, was refused as another person's.
  for (const answer of answers.filter((one) => one.user === shiran)) {
    expect(answer.status).toBe(409);
  }
  await expect(tile(page, "8")).not.toContainText(
    rt("app.orders.floor.state.unsent"),
  );

  // Shiran is back: it goes, as hers.
  await enterAs(page, "manager");
  await expect.poll(() => demoRounds("8")).toBe(1);
  expect(await demoRoundSenders("8")).toEqual([SHIRAN]);
  await expect.poll(() => outboxRows(page, shiran)).toBe(0);
});

test("a killed app sends what waited when it opens again", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  test.setTimeout(90_000);
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.route(SENDS, (route) => route.abort("internetdisconnected"));
  await sendLemonade(page, "desktop");
  await expect(shown(page, notSent())).toBeVisible();
  expect(await outboxRows(page)).toBe(1);

  const context = page.context();
  await page.close();
  const again = await context.newPage();
  await again.goto("/home");
  await expect.poll(() => demoRounds("8")).toBe(1);
  await expect.poll(() => outboxRows(again)).toBe(0);
  // Nothing says it waits any more.
  await expect(
    again.getByRole("complementary", {
      name: rt("app.orders.outbox.banner.label"),
    }),
  ).toHaveCount(0);
});

test("an order waiting more than 10 minutes asks first: removed with its undo, then sent", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  test.setTimeout(120_000);
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.route(SENDS, (route) => route.abort("internetdisconnected"));
  await sendLemonade(page, "desktop");
  await expect(shown(page, notSent())).toBeVisible();
  await ageRows(page, 12);
  await page.unroute(SENDS);
  await page.reload();

  const question = rt("app.orders.outbox.ask", { count: 12 });
  await expect(shown(page, question)).toBeVisible();
  const synced = page.waitForResponse((r) => r.url().includes("/orders-sync"));
  await toFloor(page);
  await expect(tile(page, "8")).toContainText(
    rt("app.orders.floor.state.unsent"),
  );
  await synced;
  expect(await demoRounds("8")).toBe(0);
  await tile(page, "8").click();
  await expect(shown(page, question)).toBeVisible();
  await expectCleanPage(page);

  // Off the phone, and back with the toast's undo.
  await button(
    page,
    rt("app.orders.outbox.removeLabel", { place: table("8") }),
  ).click();
  const removed = rt("app.orders.toast.roundRemoved", { place: table("8") });
  await expect(toast(page, removed)).toBeVisible();
  await undoOn(page, removed).click();
  await expect(shown(page, question)).toBeVisible();

  // Sent now, once.
  await button(
    page,
    rt("app.orders.outbox.sendLabel", { place: table("8") }),
  ).click();
  await expect.poll(() => demoRounds("8")).toBe(1);
  const next = page.waitForResponse((r) => r.url().includes("/orders-sync"));
  await next;
  expect(await demoRounds("8")).toBe(1);
  await expect.poll(() => outboxRows(page)).toBe(0);
});

test("signing out with an order waiting asks once and takes it off the phone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  test.setTimeout(120_000);
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.route(SENDS, (route) => route.abort("internetdisconnected"));
  await sendLemonade(page, "desktop");
  await expect(shown(page, notSent())).toBeVisible();

  await page.goto("/me");
  const signOut = main(page).getByRole("button", { name: he.app.signOut });
  await signOut.click();
  const sheet = page.getByRole("dialog", {
    name: rt("app.orders.outbox.unsent", { count: 1 }),
  });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(table("8"));
  await sheet
    .getByRole("button", { name: rt("app.orders.outbox.signOut.back") })
    .filter({ visible: true })
    .last()
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/me$/);

  await signOut.click();
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", { name: rt("app.orders.outbox.signOut.confirm") })
    .click();
  await expect(page).toHaveURL(/\/(sign-in|enter)/);

  await signIn(page, YOAV);
  expect(await outboxRows(page)).toBe(0);
  expect(await demoRounds("8")).toBe(0);
});
