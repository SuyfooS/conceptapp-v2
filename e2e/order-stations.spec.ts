import he from "../messages/he.json" with { type: "json" };
import {
  addDemoOrderStation,
  addDemoStations,
  addOpenDemoEntry,
  cancelDemoLine,
  clearDemoStations,
  clearTimeEntriesSince,
  databaseNow,
  demoItemAvailability,
  demoOpenTicket,
  demoOrderStation,
  demoOrderStations,
  demoTicketStation,
  pairingsSince,
  resetDemoMenu,
} from "./db";
import {
  button,
  enterAs,
  expectCleanPage,
  heading,
  loadRestaurantWords,
  rt,
  SHIRAN,
  send,
  showItems,
  shown,
  showOrder,
  tile,
  toast,
  toFloor,
  YOAV,
} from "./orders-parts";
import { secondPage, signIn } from "./session";
import { stubAudio, tones } from "./station-audio";
import { expect, type Page, test } from "./test";

// The kitchen's screen and the till (waiter mode P8a): a tablet locked from
// "הכנה" by whoever runs orders shows the kitchen's tickets with nobody's
// account, chimes on a new one once its button was pressed, and its "מוכן"
// reaches the waiter's phone; a line cancelled is struck with the double
// chime; "מה נגמר" marks an item sold out for the floor's picker; a till
// closes and opens again, each kept as the station's; the screens are
// stopped from the prep screen with an undo; the routes answer only their
// own device; ten devices in all; and a banner with no connection. The
// sounds are a stand-in that keeps each tone's frequency
// (station-audio.ts). The flows run on the phone only (CI minutes); the
// three widths are checked on the twins (design.spec.ts). Each test leaves
// no station, the evening's orders and menu as seeded, and of Yoav's hours
// only his own (his seeded month is the payroll specs', which run after
// these).

test.beforeAll(loadRestaurantWords);

/** When the test began, by the database's clock: what it wrote is newer. */
let began = new Date(0);

/** The flows run on the phone only. */
const flows = (project: string) => project === "phone";

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(
    !flows(testInfo.project.name),
    "The flows run on the phone; design.spec.ts covers the three widths.",
  );
  began = await databaseNow();
  await clearDemoStations();
  await resetDemoMenu();
});

test.afterEach(async ({ page }, testInfo) => {
  void page;
  if (!flows(testInfo.project.name)) return;
  await clearDemoStations();
  // The menu's reset puts the evening's orders back too.
  await resetDemoMenu();
  await clearTimeEntriesSince(YOAV.e164, began);
});

const KITCHEN = "מטבח";
const CHIME = 880;
const DOUBLE = 520;
const table = (name: string) => rt("app.orders.place.numbered", { name });
const ticketOf = (page: Page, place: string) =>
  page
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: table(place),
        department: KITCHEN,
      }),
    })
    .first();

/**
 * How many records the device keeps in the orders' store, of every kind:
 * none where there is no store. The store stays once made (locking empties
 * it, as signing out does, and deletes nothing), so what counts is what is
 * left in it.
 */
async function keptOnDevice(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const known = await indexedDB.databases();
    if (!known.some((db) => db.name === "conceptapp-orders")) return 0;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("conceptapp-orders");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      const stores = Array.from(db.objectStoreNames);
      if (stores.length === 0) return 0;
      const tx = db.transaction(stores);
      const counts = await Promise.all(
        stores.map(
          (store) =>
            new Promise<number>((resolve, reject) => {
              const request = tx.objectStore(store).count();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            }),
        ),
      );
      return counts.reduce((sum, count) => sum + count, 0);
    } finally {
      db.close();
    }
  });
}

/**
 * Shiran locks the device `page` is on from "הכנה", as the kitchen's screen
 * of the kitchen or as the till, and it signs out there and opens /station.
 */
async function lockAs(page: Page, shows: "prep" | "till") {
  await enterAs(page, "manager");
  await page.goto("/orders/prep");
  await button(
    page,
    rt(
      shows === "prep"
        ? "app.orders.stations.prep.lock"
        : "app.orders.stations.till.lock",
    ),
  ).click();
  const sheet = page.getByRole("dialog", {
    name: rt(
      shows === "prep"
        ? "app.orders.stations.lock.prep.title"
        : "app.orders.stations.lock.till.title",
    ),
  });
  if (shows === "prep") {
    await expect(
      sheet.getByText(rt("app.orders.stations.lock.prep.only")),
    ).toBeVisible();
    await expect(
      sheet.getByText(rt("app.orders.stations.lock.prep.sound")),
    ).toBeVisible();
    await sheet.getByRole("radio", { name: KITCHEN }).check();
  }
  await sheet
    .getByRole("button", { name: he.app.clock.station.lock.submit })
    .click();
  await expect(page).toHaveURL(/\/station$/);
}

/** Yoav, on the clock, sends that place the items named, from his phone. */
async function yoavSends(phone: Page, place: string, items: string[]) {
  await phone.goto("/orders");
  await tile(phone, place).click();
  await expect(heading(phone, 1, table(place))).toBeVisible();
  await showItems(phone, "phone");
  for (const item of items) await button(phone, item).click();
  await showOrder(phone, "phone");
  await send(phone);
  await expect(
    toast(phone, rt("app.orders.toast.sent", { place: table(place) })),
  ).toBeVisible();
}

test("a manager locks a tablet as the kitchen; it chimes on a new ticket and מוכן reaches the waiter", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const tablet = page;
  await stubAudio(tablet);
  await lockAs(tablet, "prep");
  const open = tablet.getByRole("button", {
    name: rt("app.orders.station.open"),
  });
  await expect(open).toBeVisible();
  // The gate reads nothing: no ticket is drawn, no sound played.
  await expect(tablet.getByRole("article")).toHaveCount(0);
  expect(await tones(tablet)).toEqual([]);
  await open.click();
  await expect.poll(() => tones(tablet)).toEqual([CHIME]);
  await expect(ticketOf(tablet, "4")).toBeVisible();
  expect(await demoOrderStations()).toMatchObject([
    { name: KITCHEN, shows: "prep", department: "kitchen", stopped: false },
  ]);

  const phone = await secondPage(browser, testInfo);
  try {
    await addOpenDemoEntry(YOAV.e164, 1);
    await signIn(phone, YOAV);
    await yoavSends(phone, "2", ["פוקאצ'ה", "לימונדה"]);

    // On the kitchen's screen within a poll or two, the bar's lemonade not.
    const two = ticketOf(tablet, "2");
    await expect(two).toBeVisible({ timeout: 15_000 });
    await expect(two.getByText(/לימונדה/)).toHaveCount(0);
    await expect.poll(() => tones(tablet)).toEqual([CHIME, CHIME]);
    await expect(
      tablet.getByRole("status").filter({
        hasText: rt("app.orders.station.news.new", { place: table("2") }),
      }),
    ).toHaveCount(1);
    // Read by the screen, so Yoav's order says it is on it, at his next check.
    await expect(
      shown(
        phone,
        rt("app.orders.ticketState.onScreen", { department: KITCHEN }),
      ),
    ).toBeVisible({ timeout: 20_000 });

    await two
      .getByRole("button", { name: rt("app.orders.prep.ready") })
      .click();
    const ready = rt("app.orders.toast.ready", {
      place: table("2"),
      department: KITCHEN,
    });
    await expect(toast(tablet, ready)).toBeVisible();
    await expect(
      heading(tablet, 2, rt("app.orders.prep.recent")),
    ).toBeVisible();
    expect(await demoTicketStation("2", "kitchen")).toEqual({
      status: "ready",
      station: KITCHEN,
      readyBy: null,
    });
    // Yoav's mode tells him, and the floor says so.
    await expect(toast(phone, ready)).toBeVisible({ timeout: 20_000 });
    await toFloor(phone);
    await expect(tile(phone, "2")).toContainText(
      rt("app.orders.floor.state.ready"),
    );

    // The station keeps nothing of anyone's: no session, and nothing in the
    // orders' store, which Shiran's screens made on the device before the
    // lock emptied it.
    const cookies = await tablet.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "ca_station")).toBe(true);
    expect(cookies.some((cookie) => cookie.name.startsWith("sb-"))).toBe(false);
    expect(await keptOnDevice(tablet)).toBe(0);
    await expectCleanPage(tablet);
    await tablet.screenshot({ path: testInfo.outputPath("kitchen.png") });
  } finally {
    await phone.context().close();
  }
});

test("a line cancelled is struck with the double chime, and נגמר from the kitchen reaches the menu", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  await stubAudio(page);
  await lockAs(page, "prep");
  await page
    .getByRole("button", { name: rt("app.orders.station.open") })
    .click();
  const four = ticketOf(page, "4");
  await expect(four).toBeVisible();

  // Table 4's hummus cancelled for the guest: struck, kept, two low tones.
  await cancelDemoLine(SHIRAN, "4", "חומוס");
  await expect(four.getByText(rt("app.orders.line.cancelled"))).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(async () => (await tones(page)).filter((tone) => tone === DOUBLE))
    .toEqual([DOUBLE, DOUBLE]);

  await page
    .getByRole("button", { name: rt("app.orders.station.soldOut.open") })
    .click();
  const sheet = page.getByRole("dialog");
  const hummus = sheet.getByRole("switch", { name: "חומוס" });
  await hummus.click();
  await expect(hummus).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => demoItemAvailability("חומוס"))
    .toEqual({
      available: false,
      station: KITCHEN,
    });
  await sheet
    .getByRole("button", { name: rt("app.orders.toast.undo") })
    .click();
  await expect
    .poll(() => demoItemAvailability("חומוס"))
    .toEqual({
      available: true,
      station: KITCHEN,
    });

  // Yoav's picker, open on his phone, hears it at its next check: the
  // hummus "נגמר", greyed, until the kitchen has it again.
  const phone = await secondPage(browser, testInfo);
  try {
    await addOpenDemoEntry(YOAV.e164, 1);
    await signIn(phone, YOAV);
    await phone.goto("/orders");
    await tile(phone, "2").click();
    await expect(heading(phone, 1, table("2"))).toBeVisible();
    await showItems(phone, "phone");
    const picked = button(phone, "חומוס");
    await expect(picked).toBeEnabled();
    await hummus.click();
    await expect(hummus).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => demoItemAvailability("חומוס"))
      .toEqual({ available: false, station: KITCHEN });
    await expect(picked).toBeDisabled({ timeout: 30_000 });
    await expect(picked).toContainText(rt("app.orders.picker.soldOut"));
  } finally {
    await phone.context().close();
  }
});

test("a till closes a table with its undo and opens it again, each kept as the till's", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await lockAs(page, "till");
  const till = rt("app.orders.stations.lock.defaultTill");
  await page
    .getByRole("button", { name: new RegExp(`^${table("4")}`) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: rt("app.orders.till.title", { place: table("4") }),
    }),
  ).toBeVisible();
  const close = page.getByRole("button", {
    name: rt("app.orders.close.place"),
  });
  await close.click();
  const closed = rt("app.orders.toast.closed", { place: table("4") });
  await expect(toast(page, closed)).toBeVisible();
  await expect
    .poll(() => demoOrderStation("4"))
    .toMatchObject({
      status: "closed",
      closedBy: till,
    });
  await toast(page, closed)
    .getByRole("button", { name: rt("app.orders.toast.undo") })
    .click();
  await expect
    .poll(() => demoOrderStation("4"))
    .toMatchObject({
      status: "open",
      closedBy: null,
      reopenedBy: till,
    });
  expect(await demoTicketStation("4", "kitchen")).toMatchObject({
    status: "new",
  });
  await close.click();
  await page
    .getByRole("button", { name: rt("app.orders.close.reopen") })
    .click();
  await expect
    .poll(() => demoOrderStation("4"))
    .toMatchObject({
      status: "open",
      reopenedBy: till,
    });
});

test("the screens are stopped from the prep screen with an undo", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const tablet = page;
  await lockAs(tablet, "prep");
  await tablet
    .getByRole("button", { name: rt("app.orders.station.open") })
    .click();
  await expect(ticketOf(tablet, "4")).toBeVisible();
  // And a till another device locked, not opened yet.
  const TILL = rt("app.orders.stations.lock.defaultTill");
  await addDemoOrderStation({ name: TILL, shows: "till" });

  const phone = await secondPage(browser, testInfo);
  try {
    await enterAs(phone, "manager");
    await phone.goto("/orders/prep");
    const words = he.app.orders.stations;
    // Both rows: the kitchen's screen open now, the till never opened.
    await expect(phone.getByText(words.showing)).toBeVisible();
    await expect(phone.getByText(words.never)).toBeVisible();
    const stopOf = (name: string) =>
      phone.getByRole("button", {
        name: rt("app.orders.stations.stopLabel", { name }),
      });
    await expect(stopOf(TILL)).toBeVisible();
    await stopOf(KITCHEN).click();
    const stopped = rt("app.orders.stations.stopped", { name: KITCHEN });
    await expect(toast(phone, stopped)).toBeVisible();
    // The pointer on the toast keeps its "ביטול" (10 seconds otherwise)
    // while the tablet hears of the stop at its next ask.
    await toast(phone, stopped).hover();
    await expect(
      tablet.getByRole("heading", {
        level: 1,
        name: he.station.stopped.prep.title,
      }),
    ).toBeVisible({ timeout: 30_000 });
    await toast(phone, stopped)
      .getByRole("button", { name: words.undo })
      .click();
    await expect(
      tablet.getByRole("button", { name: rt("app.orders.station.open") }),
    ).toBeVisible({ timeout: 45_000 });
    expect(await demoOrderStations()).toMatchObject([
      { name: KITCHEN, stopped: false },
      { name: TILL, shows: "till", stopped: false },
    ]);
  } finally {
    await phone.context().close();
  }
});

test("the station's routes answer only their own device", async ({
  page,
  request,
  baseURL,
}) => {
  const url = baseURL ?? "http://127.0.0.1:3000";
  const kitchen = await addDemoOrderStation({
    name: "Kitchen route",
    shows: "prep",
    department: "kitchen",
  });
  const clock = await addDemoOrderStation({
    name: "Clock route",
    shows: "clock_code",
  });
  const asked = async (token: string | null, path = "/station/tickets") => {
    const context = page.context();
    await context.clearCookies();
    if (token) {
      await context.addCookies([{ name: "ca_station", value: token, url }]);
    }
    return page.evaluate(async (to) => {
      const response = await fetch(to, { cache: "no-store" });
      return {
        status: response.status,
        body: response.status === 204 ? null : await response.json(),
      };
    }, path);
  };
  await page.goto("/enter");
  expect(await asked(null)).toEqual({
    status: 403,
    body: { ok: false, failure: "notStation" },
  });
  expect(await asked(clock.token)).toEqual({
    status: 409,
    body: { ok: false, failure: "notOrders" },
  });
  expect((await asked(kitchen.token)).status).toBe(200);
  // Another site's request is refused, cookie or not.
  const elsewhere = await request.get("/station/tickets", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(elsewhere.status()).toBe(403);
  // The kitchen's secret makes no clock code.
  const code = await page.evaluate(async () => {
    const response = await fetch("/station/code", { method: "POST" });
    return response.status;
  });
  expect(code).toBe(403);
  // A ticket of the bar is none of the kitchen's.
  const bar = await demoOpenTicket("bar");
  const written = await page.evaluate(async (ticket) => {
    const response = await fetch("/station/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ do: "ready", ticket, ready: true }),
    });
    return { status: response.status, body: await response.json() };
  }, bar ?? "");
  expect(written).toEqual({
    status: 404,
    body: { ok: false, failure: "gone" },
  });

  // Someone signed in on the kitchen's device: no ticket beside an account.
  await page.context().clearCookies();
  await enterAs(page, "manager");
  await page
    .context()
    .addCookies([{ name: "ca_station", value: kitchen.token, url }]);
  const signedIn = await page.evaluate(async () => {
    const response = await fetch("/station/tickets", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
  expect(signedIn).toEqual({
    status: 409,
    body: { ok: false, failure: "signedIn" },
  });
});

test("ten devices in all: neither the till's lock nor the clock's makes an eleventh", async ({
  page,
}) => {
  const since = new Date(Date.now() - 2000);
  await addDemoStations(Array.from({ length: 9 }, (_, i) => `Clock ${i + 1}`));
  await addDemoOrderStation({
    name: "Kitchen ten",
    shows: "prep",
    department: "kitchen",
  });
  await enterAs(page, "manager");
  await page.goto("/orders/prep");
  await expect(
    page
      .getByText(rt("app.orders.stations.lock.full", { count: 10 }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page.goto("/clock/code");
  await expect(
    page.getByText(rt("app.clock.station.lock.full", { count: 10 })),
  ).toBeVisible();
  expect(await pairingsSince(since)).toBe(0);
});

test("with no connection, the kitchen's screen says so across the top", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await stubAudio(page);
  await lockAs(page, "prep");
  await page
    .getByRole("button", { name: rt("app.orders.station.open") })
    .click();
  await expect(ticketOf(page, "4")).toBeVisible();
  await page.context().setOffline(true);
  const banner = page
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: rt("app.orders.station.offline") });
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await page.context().setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 40_000 });
});
