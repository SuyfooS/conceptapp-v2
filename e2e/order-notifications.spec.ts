import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  addDemoOrderStation,
  addOpenDemoEntry,
  ageDemoRound,
  clearDemoStations,
  clearOrderNoticesSince,
  clearTimeEntriesSince,
  databaseNow,
  demoOrderLine,
  demoTicketId,
  readyDemoTicket,
  resetDemoMenu,
  runOrderNotices,
  stationReads,
} from "./db";
import {
  button,
  expectCleanPage,
  heading,
  literal,
  loadRestaurantWords,
  NOA,
  RESTAURANT,
  rt,
  send,
  showItems,
  shown,
  showOrder,
  tile,
  toast,
  YOAV,
} from "./orders-parts";
import { signIn } from "./session";

// The lines about orders in the app (waiter mode P8b), in the demo
// restaurant, whose lines never reach a phone (order-push.spec.ts covers the
// phone in a business of its own): a ticket marked ready tells its sender in
// the inbox, with Home saying it waits for him, and opens the order; served,
// it no longer waits. An open mode reads it at once. A kitchen screen running
// that no ticket reached in 2 minutes tells the sender and shows on the
// order, until the screen fetches it; a department with no screen never
// does. The minute job is off in CI, so the tests run its check themselves.
// The flows run on the phone only (CI minutes); the three widths are checked
// on the twins (design.spec.ts). Each test leaves no station, the evening's
// orders and menu as seeded, no line about orders it wrote, and of Yoav's
// hours only his own.

test.beforeAll(loadRestaurantWords);

let began = new Date(0);

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
  await resetDemoMenu();
  await clearOrderNoticesSince(began);
  await clearTimeEntriesSince(YOAV.e164, began);
});

const KITCHEN = "מטבח";
const words = he.app.notifications;
const table = (name: string) => rt("app.orders.place.numbered", { name });
const NEEDS = (he.ui.appShell.needsAction.split("}")[1] ?? "").trim();
const homeTab = (page: Page) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    .getByRole("link", { name: new RegExp(`^${literal(he.app.nav.home)}`) });
/** A line of the inbox, by its title. */
const line = (page: Page, title: string) =>
  page
    .getByRole("button", { name: new RegExp(literal(title)) })
    .filter({ visible: true })
    .first();
const readyTitle = (place: string) =>
  rt("app.notifications.kinds.order.ready.title", {
    place: table(place),
    department: KITCHEN,
  });
const unseenTitle = (place: string) =>
  rt("app.notifications.kinds.order.unseen.title", {
    place: table(place),
    department: KITCHEN,
  });

/** Yoav, on the clock, sends that place the items named, from his phone. */
async function yoavSends(page: Page, place: string, items: string[]) {
  await page.goto("/orders");
  await tile(page, place).click();
  await expect(heading(page, 1, table(place))).toBeVisible();
  await showItems(page, "phone");
  for (const item of items) await button(page, item).click();
  await showOrder(page, "phone");
  await send(page);
  await expect(
    toast(page, rt("app.orders.toast.sent", { place: table(place) })),
  ).toBeVisible();
}

test("a ready ticket tells its sender, and opening it opens the order", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await yoavSends(page, "2", ["פוקאצ'ה"]);

  // Out of the mode, nothing reads it for him: the inbox does.
  await page.goto("/notifications");
  await readyDemoTicket(NOA, "2", "kitchen");
  await page.reload();
  const ready = line(page, readyTitle("2"));
  await expect(ready).toBeVisible();
  await expect(ready).toContainText(
    rt("app.notifications.kinds.order.ready.body", { count: 1 }),
  );
  await expect(homeTab(page)).toHaveAccessibleName(new RegExp(NEEDS));
  await expectCleanPage(page);

  // It opens the table's order.
  await ready.click();
  await expect(page).toHaveURL(/\/orders\/place\/[0-9a-f-]{36}$/);
  await expect(heading(page, 1, table("2"))).toBeVisible();
  await showOrder(page, "phone");
  await button(
    page,
    new RegExp(`^${literal(rt("app.orders.order.serve"))}.*${KITCHEN}`),
  ).click();
  await expect(
    toast(
      page,
      rt("app.orders.toast.served", { place: table("2"), department: KITCHEN }),
    ),
  ).toBeVisible();

  // Served: it no longer waits.
  await page.goto("/notifications");
  await expect(line(page, readyTitle("2"))).toContainText(
    words.kinds.order.ready.settledNote,
  );
});

test("the open mode reads the ready line, so no push follows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await yoavSends(page, "2", ["פוקאצ'ה"]);

  const ticket = await readyDemoTicket(NOA, "2", "kitchen");
  await expect(
    toast(
      page,
      rt("app.orders.toast.ready", { place: table("2"), department: KITCHEN }),
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () => (await demoOrderLine(YOAV.e164, "order.ready", ticket))?.read,
      {
        timeout: 10_000,
      },
    )
    .toBe(true);
  // A demo's lines never reach a phone anyway.
  expect((await demoOrderLine(YOAV.e164, "order.ready", ticket))?.push).toBe(
    "none",
  );
});

test("a kitchen screen that didn't get the ticket says so, until it does", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const station = await addDemoOrderStation({
    name: KITCHEN,
    shows: "prep",
    department: "kitchen",
  });
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await yoavSends(page, "2", ["פוקאצ'ה", "לימונדה"]);
  await page.goto("/home");

  // Three minutes on, the minute job's check.
  await ageDemoRound("2", 3);
  await runOrderNotices(RESTAURANT);
  const kitchen = await demoTicketId("2", "kitchen");
  const bar = await demoTicketId("2", "bar");
  expect(
    await demoOrderLine(YOAV.e164, "order.unseen", kitchen ?? ""),
  ).toMatchObject({ read: false, settled: false });
  // The bar has no screen: nothing about its lemonade.
  expect(await demoOrderLine(YOAV.e164, "order.unseen", bar ?? "")).toBeNull();

  await page.goto("/notifications");
  const unseen = line(page, unseenTitle("2"));
  await expect(unseen).toBeVisible();
  await expect(unseen).toContainText(words.kinds.order.unseen.body);
  await expectCleanPage(page);

  // The order says so too.
  await unseen.click();
  await expect(page).toHaveURL(/\/orders\/place\/[0-9a-f-]{36}$/);
  await expect(heading(page, 1, table("2"))).toBeVisible();
  await showOrder(page, "phone");
  await expect(
    shown(
      page,
      rt("app.orders.ticketState.screenOff", { department: KITCHEN }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);

  // The screen fetches it: on the screen, and the line settled.
  await stationReads(station.token);
  await expect(
    shown(page, rt("app.orders.ticketState.onScreen", { department: KITCHEN })),
  ).toBeVisible({ timeout: 20_000 });
  expect(
    await demoOrderLine(YOAV.e164, "order.unseen", kitchen ?? ""),
  ).toMatchObject({ settled: true });
  await page.goto("/notifications");
  await expect(line(page, unseenTitle("2"))).toContainText(
    words.kinds.order.unseen.settledNote,
  );
});
