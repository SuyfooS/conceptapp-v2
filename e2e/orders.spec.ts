import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, saidSince } from "./announcer";
import {
  addOpenDemoEntry,
  clearTimeEntries,
  clearTimeEntriesSince,
  databaseNow,
  demoLine,
  demoLines,
  demoLineTakenBack,
  demoModuleSettings,
  demoOpenOrder,
  demoOrderLog,
  demoOrderPlaceName,
  demoOrderStatus,
  demoOrderToToday,
  demoRounds,
  demoTakeawayStatus,
  demoTicketStatus,
  endDemoEntry,
  resetDemoMenu,
  resetDemoOrders,
  setDemoItemGroups,
  setDemoModuleSettings,
  setDemoRequirePunchCode,
  userIdOf,
} from "./db";
import {
  ADMIN,
  button,
  enterAs,
  expectCleanPage,
  heading,
  link,
  literal,
  loadRestaurantWords,
  main,
  NOA,
  navItem,
  OWNER,
  RESTAURANT,
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
import { secondPage, signIn } from "./session";
import { setDemoModule } from "./sms";
import { expect, type Locator, type Page, test } from "./test";

// Taking orders (waiter mode). P3's settings in the console; P4's screens on
// the demo restaurant, where the local seed has the module on and three
// orders waiting: the mode's items in the app's own shell, a waiter sending
// to the kitchen and the bar, the kitchen marking ready on a phone, serving,
// the same send twice as one round, the draft waiting while the waiter
// clocks in, taking a line back, holding a dish and firing it, and who gets
// the mode at all, and the owner choosing who takes orders. P5's fixes: a
// line cancelled with its reason and its undo, one ready refused to a
// waiter and given on the house by the manager, the till by item and by
// round with no total, a close taken back by its "ביטול" (the kitchen's
// ticket new again), closing and opening again from "נסגרו היום", moving
// an order and cancelling one whole. P6's choices: burgers through their
// sheet, read under each in the kitchen and rung up each at its price; a
// salad's extras from its line in the draft; a doneness gone from the menu
// meanwhile, which the send refuses and the line asks to choose again. The
// restaurant
// reads its template's words ("שולחן", "מנה", "מצב מלצרות"), read here from
// the database as it does. Each test puts the orders and the clock back:
// Yoav's own hours only (his seeded month is the payroll specs', which run
// after these), the others' as the clock specs clear them. Seeded in
// supabase/seed.sql: Yoav in the bar, who signs in by SMS, and the team in
// no business.

const m = he.app.manage;
const o = he.modules.order_taking.settings;

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
  await setDemoRequirePunchCode(false);
  await setDemoModule("order_taking", true);
});

/** An item's choices sheet, by its name (P6). */
const choiceSheet = (page: Page, item: string) =>
  page.getByRole("dialog", { name: item });

/**
 * An option of the sheet picked by its name: a radio in a group of exactly
 * one, else a switch. Exact, with what it adds after it: "מדיום" is in
 * "מדיום רייר".
 */
async function choose(sheet: Locator, option: string) {
  const name = new RegExp(`^${literal(option)}(\\s*\\+.*)?$`);
  const radio = sheet.getByRole("radio", { name });
  if ((await radio.count()) > 0) await radio.check();
  else await sheet.getByRole("switch", { name }).click();
}

/** An item with a choice to make, added through its sheet (P6). */
async function chooseAndAdd(page: Page, item: string, options: string[]) {
  await button(page, item).click();
  const sheet = choiceSheet(page, item);
  await expect(sheet).toBeVisible();
  for (const option of options) await choose(sheet, option);
  await sheet
    .getByRole("button", {
      name: rt("app.orders.choice.add", { count: 1 }),
      exact: true,
    })
    .click();
  await expect(sheet).toHaveCount(0);
}

/**
 * The picker's search: a tablet and a desktop show one category at a time,
 * "הכי מוזמנים" first, and the seeded orders' items are the only ones there.
 */
async function find(page: Page, text: string) {
  await page
    .getByLabel(rt("app.orders.picker.search"))
    .filter({ visible: true })
    .first()
    .fill(text);
}

/** A draft line's "בחירות", by the item's name. */
const choicesOf = (page: Page, item: string) =>
  button(
    page,
    new RegExp(`^${literal(rt("app.orders.draft.choices"))}.*${literal(item)}`),
  );

test("the team chooses who takes orders and when, in the console", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const stored = await demoModuleSettings("order_taking");
  try {
    await signIn(page, ADMIN, /\/admin$/);
    await page.goto("/admin/businesses/demo-restaurant/settings");
    // Its five fields; who takes orders by the business's departments (P4).
    for (const label of [
      o.takerDepartments.label,
      o.onlyOnTheClock.label,
      o.takeBackMinutes.label,
      o.lateAfterMinutes.label,
      o.dayEndsAt.label,
    ]) {
      await expect(
        page.getByText(label).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    await expectCleanPage(page);

    // The kitchen takes orders too.
    await page
      .getByRole("switch", { name: "מטבח", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect
      .poll(
        async () =>
          (await demoModuleSettings("order_taking"))
            .takerDepartments as string[],
      )
      .toContain("kitchen");

    // Orders off a shift too.
    await page
      .getByRole("switch", { name: new RegExp(o.onlyOnTheClock.label) })
      .click();
    await expect(
      page.getByText(m.saved, { exact: true }).first(),
    ).toBeVisible();
    await expect
      .poll(
        async () => (await demoModuleSettings("order_taking")).onlyOnTheClock,
      )
      .toBe(false);

    // Five minutes to take an item back.
    await page
      .getByRole("button", { name: new RegExp(o.takeBackMinutes.label) })
      .click();
    await page
      .getByRole("menuitemradio", { name: o.takeBackMinutes.options[5] })
      .click();
    await expect
      .poll(
        async () => (await demoModuleSettings("order_taking")).takeBackMinutes,
      )
      .toBe(5);
    await expectCleanPage(page);
  } finally {
    await setDemoModuleSettings("order_taking", stored);
  }
});

test("Yoav sends a drink and a starter, the kitchen marks the starter ready, and he serves it", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);

  // On a shift: Home's card for the mode, and its one action.
  await expect(heading(page, 2, rt("modules.order_taking.name"))).toBeVisible();
  await link(page, rt("app.orders.home.open")).click();
  await expect(page).toHaveURL(/\/orders$/);
  // The bar is the mode's: the places, his orders, preparing (he is in the
  // bar) and the menu.
  for (const item of ["places", "mine", "prep", "menu"] as const) {
    await expect(
      navItem(page, rt(`modules.order_taking.mode.${item}`)),
    ).toBeVisible();
  }
  await expectCleanPage(page);

  await tile(page, "5").click();
  await expect(page).toHaveURL(/\/orders\/place\//);
  await showItems(page, project);
  await button(page, "לימונדה").click();
  await button(page, "חומוס").click();
  await showOrder(page, project);
  // The starter's allergy, in its one note.
  await button(
    page,
    new RegExp(`^${literal(rt("app.orders.draft.allergy"))}.*חומוס`),
  ).click();
  // Saved without its words: the field takes the focus, marked, and why is
  // said after its own read.
  const allergy = page.getByLabel(rt("app.orders.note.allergyLabel"));
  const polite = announcer(page, "polite");
  await heardSoFar(polite);
  await page.getByRole("button", { name: rt("app.orders.note.save") }).click();
  await expect(allergy).toBeFocused();
  await expect(allergy).toHaveAttribute("aria-invalid", "true");
  await expect(
    saidSince(polite, rt("app.orders.note.allergyMissing")),
  ).toHaveCount(1);
  await allergy.fill("בוטנים");
  await page.getByRole("button", { name: rt("app.orders.note.save") }).click();
  await expect(
    shown(page, rt("app.orders.line.allergy", { note: "בוטנים" })),
  ).toBeVisible();
  await expectCleanPage(page);
  await send(page);
  await expect(
    toast(
      page,
      rt("app.orders.toast.sent", {
        place: rt("app.orders.place.numbered", { name: "5" }),
      }),
    ),
  ).toBeVisible();
  await expect.poll(() => demoRounds("5")).toBe(1);
  expect(await demoTicketStatus("5", "kitchen")).toBe("new");
  expect(await demoTicketStatus("5", "bar")).toBe("new");

  // He goes back to the floor, where table 5 waits on its tickets.
  await toFloor(page);
  await expect(page).toHaveURL(/\/orders$/);
  const ready = rt("app.orders.floor.state.ready");
  await expect(tile(page, "5")).not.toContainText(ready);

  // Noa prepares in the kitchen: the mode opens on preparing for her.
  const noa = await secondPage(browser, testInfo);
  await enterAs(noa, "worker");
  await noa.goto("/orders");
  await expect(noa).toHaveURL(/\/orders\/prep$/);
  await expect(
    navItem(noa, rt("modules.order_taking.mode.places")),
  ).toHaveCount(0);
  const ticket = noa
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: rt("app.orders.place.numbered", { name: "5" }),
        department: "מטבח",
      }),
    })
    .filter({ visible: true });
  await expect(
    ticket.getByText(rt("app.orders.line.allergy", { note: "בוטנים" })),
  ).toBeVisible();
  await expectCleanPage(noa);
  await ticket
    .getByRole("button", { name: rt("app.orders.prep.ready") })
    .click();
  await expect.poll(() => demoTicketStatus("5", "kitchen")).toBe("ready");
  await expect(shown(noa, rt("app.orders.prep.recent"))).toBeVisible();
  await noa.context().close();

  // Yoav's phone hears it by itself, within one of its checks: the mode's
  // toast, and the tile turned ready to serve, with no reload.
  await page.bringToFront();
  const table5 = rt("app.orders.place.numbered", { name: "5" });
  const told = toast(
    page,
    rt("app.orders.toast.ready", { place: table5, department: "מטבח" }),
  );
  await expect(told).toBeVisible({ timeout: 20_000 });
  await expect(tile(page, "5")).toContainText(ready);
  // The toast's "פתיחה" leads to the table's order.
  await told.getByRole("button", { name: rt("app.orders.toast.open") }).click();
  await expect(page).toHaveURL(/\/orders\/place\//);
  await showOrder(page, project);

  // The kitchen's ticket served, put back with the toast's undo, served.
  const serveAt = (department: string) =>
    button(
      page,
      new RegExp(`^${literal(rt("app.orders.order.serve"))}.*${department}`),
    );
  await serveAt("מטבח").click();
  await expect.poll(() => demoTicketStatus("5", "kitchen")).toBe("served");
  await undoOn(
    page,
    rt("app.orders.toast.served", { place: table5, department: "מטבח" }),
  ).click();
  await expect.poll(() => demoTicketStatus("5", "kitchen")).toBe("ready");
  await serveAt("מטבח").click();
  await expect.poll(() => demoTicketStatus("5", "kitchen")).toBe("served");
  // The bar's drink goes out while its ticket is still new.
  expect(await demoTicketStatus("5", "bar")).toBe("new");
  await serveAt("בר").click();
  await expect.poll(() => demoTicketStatus("5", "bar")).toBe("served");
  await expectCleanPage(page);
});

test("the same round sent twice is one round, and only from the app's own pages", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await enterAs(page, "manager");
  // A manager reads off a shift, and sends on one only (the rule's default).
  await addOpenDemoEntry(SHIRAN, 1);
  await page.goto("/orders");
  const ids = await page.evaluate(async (business) => {
    const answer = await fetch(`/orders-sync?b=${business}&m=`);
    const read = (await answer.json()) as {
      menu: {
        places: { id: string; name: string }[];
        items: { id: string; name: string }[];
      };
    };
    return {
      place: read.menu.places.find((p) => p.name === "8")?.id ?? "",
      item: read.menu.items.find((i) => i.name === "לימונדה")?.id ?? "",
    };
  }, RESTAURANT);
  const body = {
    business: RESTAURANT,
    user: await userIdOf(SHIRAN),
    key: "e7000000-0000-4000-a000-000000000001",
    target: { place: ids.place },
    lines: [{ item: ids.item, quantity: 1 }],
  };
  const origin = new URL(page.url()).origin;
  const headers = { origin, "sec-fetch-site": "same-origin" };
  const first = await page.request.post("/orders-send", {
    data: body,
    headers,
  });
  expect(first.status()).toBe(200);
  const again = await page.request.post("/orders-send", {
    data: body,
    headers,
  });
  expect((await again.json()).round).toEqual((await first.json()).round);
  expect(await demoRounds("8")).toBe(1);
  // The same key with other lines is refused.
  const other = await page.request.post("/orders-send", {
    data: { ...body, lines: [{ item: ids.item, quantity: 2 }] },
    headers,
  });
  expect(other.status()).toBe(422);
  expect((await other.json()).failure).toBe("body");
  // The body names its person (P7): another's is never sent as hers, a
  // business she isn't in is refused before the database, and a body
  // without one isn't a round.
  const asYoav = await page.request.post("/orders-send", {
    data: { ...body, user: await userIdOf(YOAV.e164) },
    headers,
  });
  expect(asYoav.status()).toBe(409);
  expect((await asYoav.json()).failure).toBe("person");
  const notHers = await page.request.post("/orders-send", {
    data: { ...body, business: "e7000000-0000-4000-b000-0000000000ff" },
    headers,
  });
  expect(notHers.status()).toBe(403);
  expect((await notHers.json()).failure).toBe("notMember");
  const { user: _, ...nobody } = body;
  const unnamed = await page.request.post("/orders-send", {
    data: nobody,
    headers,
  });
  expect(unnamed.status()).toBe(400);
  expect(await demoRounds("8")).toBe(1);
  // Another site, and someone signed out.
  const elsewhere = await page.request.post("/orders-send", {
    data: body,
    headers: { origin: "https://example.com", "sec-fetch-site": "cross-site" },
  });
  expect(elsewhere.status()).toBe(403);
  const stranger = await secondPage(browser, testInfo);
  const out = await stranger.request.post("/orders-send", {
    data: body,
    headers,
  });
  expect(out.status()).toBe(401);
  await stranger.context().close();
});

test("off a shift the draft waits while the waiter clocks in", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const project = testInfo.project.name;
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.goto("/orders");
  await tile(page, "8").click();
  await showItems(page, project);
  await button(page, "לימונדה").click();
  await button(page, "לימונדה").click();
  // His shift ended 31 minutes ago.
  await endDemoEntry(YOAV.e164, 31);
  await showOrder(page, project);
  await send(page);
  await expect(heading(page, 2, rt("app.orders.offClock.title"))).toBeVisible();
  expect(await demoRounds("8")).toBe(0);
  await expectCleanPage(page);
  await link(page, rt("app.orders.offClock.action")).click();
  await expect(page).toHaveURL(/\/clock$/);
  await page
    .getByRole("button", {
      name: new RegExp(`(^|\\s)${he.app.clock.circle.in}$`),
    })
    .click();
  await link(page, rt("modules.order_taking.name")).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(
    shown(page, rt("app.orders.floor.state.draft", { count: 2 })),
  ).toBeVisible();
  await tile(page, "8").click();
  await showOrder(page, project);
  await send(page);
  await expect.poll(() => demoRounds("8")).toBe(1);
});

/** A ticket on Noa's prep screen, by its place and department. */
const prepTicket = (page: Page, name: string) =>
  page
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: rt("app.orders.place.numbered", { name }),
        department: "מטבח",
      }),
    })
    .filter({ visible: true });

test("Shiran takes a line back in time, with the toast's undo first", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await enterAs(page, "manager");
  await addOpenDemoEntry(SHIRAN, 1);
  await page.goto("/orders");
  await tile(page, "9").click();
  await showItems(page, project);
  // Two starters, so the kitchen's ticket still has one to make.
  await button(page, "חומוס").click();
  await button(page, "פוקאצ'ה").click();
  await showOrder(page, project);
  await send(page);
  await expect.poll(() => demoRounds("9")).toBe(1);
  // What was sent shows at once, though the table was free a moment ago.
  const takeBack = button(
    page,
    new RegExp(`^${literal(rt("app.orders.rounds.takeBack"))}.*חומוס`),
  );
  // Taken back, then kept with the toast's undo.
  await takeBack.click();
  await undoOn(
    page,
    rt("app.orders.toast.takenBack", { name: "חומוס" }),
  ).click();
  expect(await demoLineTakenBack("9", "חומוס")).toBe(false);
  // Again, and leaving the screen sends it.
  await takeBack.click();
  await navItem(page, rt("modules.order_taking.mode.mine")).click();
  await expect.poll(() => demoLineTakenBack("9", "חומוס")).toBe(true);

  // The kitchen sees it struck, and still makes the focaccia.
  const noa = await secondPage(browser, testInfo);
  await enterAs(noa, "worker");
  await noa.goto("/orders/prep");
  const ticket = prepTicket(noa, "9");
  await expect(ticket).toContainText(rt("app.orders.line.takenBack"));
  await expect(ticket).toContainText("פוקאצ'ה");
  await expectCleanPage(noa);
  await noa.context().close();
});

test("Shiran holds a dish for later, and fires it", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await enterAs(page, "manager");
  await addOpenDemoEntry(SHIRAN, 1);
  await page.goto("/orders");
  await tile(page, "10").click();
  await showItems(page, project);
  await button(page, "פוקאצ'ה").click();
  await button(page, "לימונדה").click();
  await showOrder(page, project);
  await button(
    page,
    new RegExp(`^${literal(rt("app.orders.draft.hold"))}.*פוקאצ`),
  ).click();
  await send(page);
  await expect.poll(() => demoTicketStatus("10", "kitchen")).toBe("held");

  // In the kitchen it waits greyed, to be called, with no "מוכן".
  const noa = await secondPage(browser, testInfo);
  await enterAs(noa, "worker");
  await noa.goto("/orders/prep");
  const ticket = prepTicket(noa, "10");
  await expect(ticket).toContainText(rt("app.orders.ticketState.held"));
  await expect(
    ticket.getByRole("button", { name: rt("app.orders.prep.ready") }),
  ).toHaveCount(0);

  await page.bringToFront();
  await button(page, rt("app.orders.rounds.fire")).click();
  await expect(
    toast(page, rt("app.orders.toast.fired", { department: "מטבח" })),
  ).toBeVisible();
  await expect.poll(() => demoTicketStatus("10", "kitchen")).toBe("new");

  // Called: the kitchen makes it now.
  await noa.reload();
  await expect(
    prepTicket(noa, "10").getByRole("button", {
      name: rt("app.orders.prep.ready"),
    }),
  ).toBeVisible();
  await noa.context().close();
});

test("the mode is for whoever takes or prepares, and nobody else", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  // The accountant: not found.
  await enterAs(page, "accountant");
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  // The owner, with no shift: Home's card, the floor, and back to the app.
  // Signed out first: the door sends whoever is signed in to Home.
  await page.context().clearCookies();
  await enterAs(page, "owner");
  await expect(heading(page, 2, rt("modules.order_taking.name"))).toBeVisible();
  await page.goto("/orders");
  await expect(heading(page, 1, rt("app.orders.floor.title"))).toBeVisible();
  await link(page, rt("app.mode.leave")).click();
  await expect(page).toHaveURL(/\/home$/);
  // With the module off, none of it.
  await setDemoModule("order_taking", false);
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  await page.goto("/home");
  await expect(heading(page, 2, rt("modules.order_taking.name"))).toHaveCount(
    0,
  );
});

test("the owner chooses on the management page who takes orders", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  const stored = await demoModuleSettings("order_taking");
  try {
    await enterAs(page, "owner");
    await page.goto("/manage/order_taking");
    await expect(
      page
        .getByText(o.takerDepartments.label)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    // The kitchen takes orders too.
    await page
      .getByRole("switch", { name: "מטבח", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect
      .poll(
        async () =>
          (await demoModuleSettings("order_taking"))
            .takerDepartments as string[],
      )
      .toContain("kitchen");
    await expectCleanPage(page);

    // Noa, in the kitchen and on a shift, gets the floor now, not only
    // preparing.
    await addOpenDemoEntry(NOA, 1);
    const noa = await secondPage(browser, testInfo);
    await enterAs(noa, "worker");
    await noa.goto("/orders");
    await expect(noa).toHaveURL(/\/orders$/);
    await expect(heading(noa, 1, rt("app.orders.floor.title"))).toBeVisible();
    await expect(
      navItem(noa, rt("modules.order_taking.mode.places")),
    ).toBeVisible();
    await noa.context().close();
  } finally {
    await setDemoModuleSettings("order_taking", stored);
  }
});

/** A row of a sheet, by its words. */
const sheetRow = (page: Page, name: string) =>
  page.getByRole("dialog").getByRole("button", { name, exact: true });

/** A sent line's "תיקון", by the item's name. */
const fixOf = (page: Page, name: string) =>
  button(page, rt("app.orders.line.fix", { name }));

const table = (name: string) => rt("app.orders.place.numbered", { name });

/**
 * A row of "נסגרו היום", by its place: a link on a phone and a tablet, its
 * first cell's button in the desktop's table.
 */
const closedRow = (page: Page, project: string, place: string) =>
  main(page)
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        level: 2,
        name: rt("app.orders.floor.closed.title"),
      }),
    })
    .getByRole(project === "desktop" ? "button" : "link", {
      name: new RegExp(`^${literal(place)}(\\D|$)`),
    })
    .filter({ visible: true })
    .first();

test("Yoav cancels the beer he sent to his own bar with a reason, the bar sees it struck, and the owner reads it with its price", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.goto("/orders");
  await tile(page, "9").click();
  await showItems(page, project);
  // The beer has a size to choose since P6.
  await chooseAndAdd(page, "בירה מהחבית", ["שליש"]);
  await button(page, "לימונדה").click();
  await showOrder(page, project);
  await send(page);
  await expect.poll(() => demoRounds("9")).toBe(1);

  // His own bar's: never taken back, cancelled with a reason.
  await expect(fixOf(page, "בירה מהחבית")).toBeVisible();
  await expect(
    button(
      page,
      new RegExp(`^${literal(rt("app.orders.rounds.takeBack"))}.*בירה`),
    ),
  ).toHaveCount(0);
  await fixOf(page, "בירה מהחבית").click();
  await expect(
    page.getByRole("dialog").getByText(rt("app.orders.failed.ownDepartment")),
  ).toBeVisible();
  await expectCleanPage(page);
  const guest = rt("app.orders.reasons.line.guest");
  await sheetRow(page, guest).click();
  await expect(
    toast(page, rt("app.orders.toast.cancelled", { name: "בירה מהחבית" })),
  ).toBeVisible();
  // Kept with the toast's undo.
  await undoOn(
    page,
    rt("app.orders.toast.cancelled", { name: "בירה מהחבית" }),
  ).click();
  expect(await demoLine("9", "בירה מהחבית")).toEqual({
    state: "live",
    reason: null,
  });
  // Again, and leaving the screen sends it.
  await fixOf(page, "בירה מהחבית").click();
  await sheetRow(page, guest).click();
  await navItem(page, rt("modules.order_taking.mode.mine")).click();
  await expect
    .poll(() => demoLine("9", "בירה מהחבית"))
    .toEqual({ state: "cancelled", reason: "guest" });
  const log = await demoOrderLog(began);
  expect(log.map((row) => row.action)).toContain("order.line.cancel");

  // Back at the table it reads struck, with its reason.
  await toFloor(page);
  await tile(page, "9").click();
  await showOrder(page, project);
  await expect(
    shown(page, rt("app.orders.line.cancelledWhy", { reason: guest })),
  ).toBeVisible();

  // The bar's screen strikes it, and still makes the lemonade.
  await page.goto("/orders/prep");
  const ticket = page
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: table("9"),
        department: "בר",
      }),
    })
    .filter({ visible: true });
  await expect(ticket).toContainText(rt("app.orders.line.cancelled"));
  await expect(ticket).toContainText("לימונדה");
  await expectCleanPage(page);

  // The owner reads it in the activity log with its price, and today's line.
  const owner = await secondPage(browser, testInfo);
  await enterAs(owner, "owner");
  await owner.goto("/manage/activity");
  const row = shown(
    owner,
    rt("app.manage.activity.actions.order.cancel", { name: "בירה מהחבית" }),
  );
  await expect(row).toBeVisible();
  // The newest row first: this run's, its own lines under it. The log is
  // never reset, and earlier runs' cancels and P4's focaccia taken back
  // say 28.00 too.
  const entry = row.locator("..");
  await expect(entry).toContainText("28.00");
  await expect(entry).toContainText(
    rt("app.manage.activity.actions.order.reason", {
      reason: rt("app.manage.activity.actions.order.reasons.guest"),
    }),
  );
  await expectCleanPage(owner);
  await owner.goto("/manage/order_taking");
  await expect(
    shown(
      owner,
      rt("app.manage.orderFixes.today", {
        takenBack: 0,
        cancelled: 1,
        comped: 0,
      }),
    ),
  ).toBeVisible();
  await expectCleanPage(owner);
  await owner.context().close();
});

test("a waiter can't cancel a dish already ready; the manager gives it on the house and the till marks it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "a phone and a desktop do");
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.goto("/orders");
  // Table 7's drinks are ready at the bar.
  await tile(page, "7").click();
  await showOrder(page, project);
  await fixOf(page, "בירה מהחבית").click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByText(rt("app.orders.failed.managersOnly")),
  ).toBeVisible();
  await expect(
    sheetRow(page, rt("app.orders.reasons.line.guest")),
  ).toBeDisabled();
  await expect(sheet.getByText(rt("app.orders.fix.comp"))).toHaveCount(0);
  await expectCleanPage(page);
  await page.keyboard.press("Escape");

  // Shiran runs the orders, on a shift or not.
  const shiran = await secondPage(browser, testInfo);
  await enterAs(shiran, "manager");
  await shiran.goto("/orders");
  await tile(shiran, "7").click();
  await showOrder(shiran, project);
  await fixOf(shiran, "בירה מהחבית").click();
  await sheetRow(shiran, rt("app.orders.reasons.comp.make_good")).click();
  await expect(
    toast(shiran, rt("app.orders.toast.comped", { name: "בירה מהחבית" })),
  ).toBeVisible();
  await navItem(shiran, rt("modules.order_taking.mode.mine")).click();
  await expect
    .poll(() => demoLine("7", "בירה מהחבית"))
    .toEqual({ state: "comped", reason: "make_good" });
  await toFloor(shiran);
  await tile(shiran, "7").click();
  await showOrder(shiran, project);
  await expect(
    shown(
      shiran,
      rt("app.orders.line.comped", {
        reason: rt("app.orders.reasons.comp.make_good"),
      }),
    ),
  ).toBeVisible();

  // Her list for the till marks it, its price struck.
  await link(shiran, rt("app.orders.rounds.till")).click();
  await expect(shiran).toHaveURL(/\/orders\/till\//);
  const byItem = shiran
    .getByRole("list", { name: rt("app.orders.till.byItem") })
    .filter({ visible: true });
  await expect(byItem).toContainText(rt("app.orders.till.free"));
  await expectCleanPage(shiran);
  await shiran.context().close();
});

test("Shiran reads table 4's till by item and by round with no total, closes it, and opens it again from נסגרו היום", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await enterAs(page, "manager");
  await addOpenDemoEntry(SHIRAN, 1);
  // Today's, whenever the reset before it ran: one just after the day
  // turned at 05:00 leaves the seed's table 4 on the day before.
  await demoOrderToToday("4");
  await page.goto("/orders");
  await tile(page, "4").click();
  await showOrder(page, project);
  await link(page, rt("app.orders.rounds.till")).click();
  await expect(page).toHaveURL(/\/orders\/till\//);
  await expect(
    heading(page, 1, rt("app.orders.till.title", { place: table("4") })),
  ).toBeVisible();
  await expect(shown(page, rt("app.orders.till.note"))).toBeVisible();
  const byItem = page
    .getByRole("list", { name: rt("app.orders.till.byItem") })
    .filter({ visible: true });
  await expect(byItem).toContainText("חומוס");
  await expect(byItem).toContainText("32.00");
  // By round: one view at a time on a phone and a tablet, both on a desktop.
  if (project !== "desktop") {
    await page
      .getByRole("button", { name: rt("app.orders.till.byRound") })
      .filter({ visible: true })
      .first()
      .click();
  }
  await expect(
    main(page)
      .getByRole("heading", { name: /^סבב 1 · .* · יואב$/ })
      .filter({ visible: true }),
  ).toBeVisible();
  // No total anywhere: neither its words nor the sum of the hummus and the
  // focaccia (32.00 + 28.00).
  await expect(main(page)).not.toContainText("סה״כ");
  await expect(main(page)).not.toContainText("סך הכל");
  await expect(main(page)).not.toContainText("60.00");
  await expectCleanPage(page);

  // Closed by mistake: its "ביטול" takes the close back whole, the hummus
  // the kitchen hasn't made back on its screen as new.
  expect(await demoTicketStatus("4", "kitchen")).toBe("new");
  await button(page, rt("app.orders.close.place")).click();
  await expect.poll(() => demoOrderStatus("4")).toBe("closed");
  await undoOn(
    page,
    rt("app.orders.toast.closed", { place: table("4") }),
  ).click();
  await expect.poll(() => demoOrderStatus("4")).toBe("open");
  expect(await demoTicketStatus("4", "kitchen")).toBe("new");
  await expect(button(page, rt("app.orders.close.place"))).toBeEnabled();

  // Closed: the table is free, and the order is under "נסגרו היום".
  await button(page, rt("app.orders.close.place")).click();
  await expect(
    toast(page, rt("app.orders.toast.closed", { place: table("4") })),
  ).toBeVisible();
  await expect.poll(() => demoOrderStatus("4")).toBe("closed");
  await expect(button(page, rt("app.orders.close.reopen"))).toBeEnabled();
  await toFloor(page);
  await expect(tile(page, "4")).toContainText(
    rt("app.orders.floor.state.free"),
  );
  await expect(
    heading(page, 2, rt("app.orders.floor.closed.title")),
  ).toBeVisible();
  await expectCleanPage(page);

  // From there, opened again.
  await closedRow(page, project, table("4")).click();
  await expect(page).toHaveURL(/\/orders\/till\//);
  await button(page, rt("app.orders.close.reopen")).click();
  await expect(
    toast(page, rt("app.orders.toast.reopened", { place: table("4") })),
  ).toBeVisible();
  await expect.poll(() => demoOrderStatus("4")).toBe("open");
  // The floor reads it open again, no longer under "נסגרו היום".
  await toFloor(page);
  await expect(tile(page, "4")).not.toContainText(
    rt("app.orders.floor.state.free"),
  );
  await expect(closedRow(page, project, table("4"))).toHaveCount(0);
  await tile(page, "4").click();
  await showOrder(page, project);
  await link(page, rt("app.orders.rounds.till")).click();
  await expect(page).toHaveURL(/\/orders\/till\//);

  // Closed again, then a lemonade opens the table anew: the closed one
  // can't open again while it is taken.
  await button(page, rt("app.orders.close.place")).click();
  await expect.poll(() => demoOrderStatus("4")).toBe("closed");
  await toFloor(page);
  await tile(page, "4").click();
  await showItems(page, project);
  await button(page, "לימונדה").click();
  await showOrder(page, project);
  await send(page);
  await expect.poll(() => demoRounds("4")).toBe(1);
  await toFloor(page);
  await closedRow(page, project, table("4")).click();
  await expect(button(page, rt("app.orders.close.reopen"))).toBeDisabled();
  await expect(shown(page, rt("app.orders.failed.reopenTaken"))).toBeVisible();
  await expectCleanPage(page);
});

test("Shiran moves table 4 to a free table, and cancels takeaway 1 for good", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "a phone and a desktop do");
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await enterAs(page, "manager");
  await page.goto("/orders");
  const order = await demoOpenOrder("4");
  await tile(page, "4").click();
  await showOrder(page, project);
  await button(page, rt("app.orders.order.actions.move")).click();
  const sheet = page.getByRole("dialog");
  await expect(sheetRow(page, table("11"))).toBeVisible();
  await expect(sheetRow(page, table("4"))).toHaveCount(0);
  await expect(sheetRow(page, table("7"))).toHaveCount(0);
  await expect(sheet).toContainText(rt("app.orders.move.subtitle"));
  await expectCleanPage(page);
  await sheetRow(page, table("11")).click();
  await expect(
    toast(page, rt("app.orders.toast.moved", { place: table("11") })),
  ).toBeVisible();
  await expect.poll(() => demoOrderPlaceName(order ?? "")).toBe("11");
  await expect(heading(page, 1, table("11"))).toBeVisible();
  await toFloor(page);
  await expect(tile(page, "4")).toContainText(
    rt("app.orders.floor.state.free"),
  );
  await expect(tile(page, "11")).not.toContainText(
    rt("app.orders.floor.state.free"),
  );

  // Takeaway 1, cancelled whole: the sheet says what goes and that it's final.
  const takeaway = rt("app.orders.place.takeaway", { number: 1 });
  await link(
    page,
    new RegExp(`^${literal(rt("app.orders.place.takeawayKind"))}\\s*1(\\D|$)`),
  ).click();
  await showOrder(page, project);
  await button(page, rt("app.orders.order.actions.cancel")).click();
  await expect(page.getByRole("dialog")).toContainText(
    rt("app.orders.cancelOrder.subtitle", { count: 2 }),
  );
  await sheetRow(page, rt("app.orders.reasons.order.mistake")).click();
  await expect(
    toast(page, rt("app.orders.toast.orderCancelled", { place: takeaway })),
  ).toBeVisible();
  await expect(
    undoOn(page, rt("app.orders.toast.orderCancelled", { place: takeaway })),
  ).toBeVisible();
  await toFloor(page);
  await expect.poll(() => demoTakeawayStatus(1)).toBe("cancelled");
  // Listed as cancelled: the row's words on a phone, the name of its
  // button (its place, its state and its time) on a desktop.
  const cancelledRow = closedRow(page, project, takeaway);
  await expect(cancelledRow).toHaveAccessibleName(
    new RegExp(literal(rt("app.orders.floor.closed.state.cancelled"))),
  );
  await cancelledRow.click();
  await expect(page).toHaveURL(/\/orders\/till\//);
  await expect(shown(page, rt("app.orders.till.cancelled"))).toBeVisible();
  await expect(
    page.getByRole("list", { name: rt("app.orders.till.byItem") }),
  ).toHaveCount(0);
  await expectCleanPage(page);
});

test("Yoav serves a ticket while his cancel of one of its lines waits: the cancel goes first", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "a phone and a desktop do");
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await addOpenDemoEntry(YOAV.e164, 1);
  await signIn(page, YOAV);
  await page.goto("/orders");
  await tile(page, "9").click();
  await showItems(page, project);
  // The beer has a size to choose since P6.
  await chooseAndAdd(page, "בירה מהחבית", ["שליש"]);
  await button(page, "לימונדה").click();
  await showOrder(page, project);
  await send(page);
  await expect.poll(() => demoRounds("9")).toBe(1);

  // The beer cancelled, its 8 seconds still running: the bar's ticket is
  // new, so a taker may.
  await fixOf(page, "בירה מהחבית").click();
  await sheetRow(page, rt("app.orders.reasons.line.guest")).click();
  await expect(
    toast(page, rt("app.orders.toast.cancelled", { name: "בירה מהחבית" })),
  ).toBeVisible();
  // The lemonade served meanwhile: the cancel lands first, so the ticket
  // served after it never refuses it as too late for a taker.
  await button(
    page,
    new RegExp(`^${literal(rt("app.orders.order.serve"))}.*בר`),
  ).click();
  await expect(
    toast(
      page,
      rt("app.orders.toast.served", { place: table("9"), department: "בר" }),
    ),
  ).toBeVisible();
  await expect.poll(() => demoTicketStatus("9", "bar")).toBe("served");
  await expect
    .poll(() => demoLine("9", "בירה מהחבית"))
    .toEqual({ state: "cancelled", reason: "guest" });
  await expect(
    shown(
      page,
      rt("app.orders.line.cancelledWhy", {
        reason: rt("app.orders.reasons.line.guest"),
      }),
    ),
  ).toBeVisible();
  await expect(shown(page, rt("app.orders.failed.managersOnly"))).toHaveCount(
    0,
  );
});

test("Shiran adds burgers through their choices, the kitchen reads them under each, and the till rings each at its price", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  await enterAs(page, "manager");
  await addOpenDemoEntry(SHIRAN, 1);
  await page.goto("/orders");
  await tile(page, "11").click();
  await showItems(page, project);
  await find(page, "המבורגר");

  // A choice to make: its row says so, and opens its sheet, whose "הוספה"
  // waits and says for what.
  await expect(button(page, "המבורגר")).toContainText(
    rt("app.orders.picker.needsChoice"),
  );
  await button(page, "המבורגר").click();
  const sheet = choiceSheet(page, "המבורגר");
  await expect(sheet).toBeVisible();
  const add = (count: number) =>
    sheet.getByRole("button", {
      name: rt("app.orders.choice.add", { count }),
      exact: true,
    });
  await expect(add(1)).toBeDisabled();
  await expect(
    sheet.getByText(rt("app.orders.choice.missing", { groups: "מידת עשייה" })),
  ).toBeVisible();
  await expect(sheet.getByText(rt("app.orders.choice.rule.one"))).toBeVisible();
  await choose(sheet, "מדיום");
  await choose(sheet, "גבינה");
  await sheet
    .getByRole("button", {
      name: rt("app.orders.draft.more", { name: "המבורגר" }),
    })
    .click();
  // Its price with the cheese, under its name.
  await expect(sheet).toContainText("74.00");
  await expect(add(2)).toBeEnabled();
  await expectCleanPage(page);
  await add(2).click();
  await expect(sheet).toHaveCount(0);
  // Another doneness is a line of its own.
  await chooseAndAdd(page, "המבורגר", ["וול דאן"]);

  await showOrder(page, project);
  await expect(shown(page, "מדיום · גבינה")).toBeVisible();
  await expect(shown(page, "74.00")).toBeVisible();
  await expect(choicesOf(page, "המבורגר")).toBeVisible();
  await send(page);
  await expect.poll(() => demoRounds("11")).toBe(1);
  expect(await demoLines("11")).toEqual([
    {
      name: "המבורגר",
      choices: ["מדיום", "גבינה"],
      unitAgorot: 7400,
      quantity: 2,
    },
    { name: "המבורגר", choices: ["וול דאן"], unitAgorot: 6800, quantity: 1 },
  ]);

  // The kitchen reads the choices under each burger, and no price.
  const noa = await secondPage(browser, testInfo);
  await enterAs(noa, "worker");
  await noa.goto("/orders/prep");
  const ticket = prepTicket(noa, "11");
  await expect(ticket.getByText("מדיום · גבינה")).toBeVisible();
  await expect(ticket.getByText("וול דאן")).toBeVisible();
  await expect(ticket).not.toContainText("74.00");
  await noa.context().close();

  // The till: a row for each, at its price, and no total (2 × 74 + 68).
  await page.bringToFront();
  await link(page, rt("app.orders.rounds.till")).click();
  await expect(page).toHaveURL(/\/orders\/till\//);
  const byItem = page
    .getByRole("list", { name: rt("app.orders.till.byItem") })
    .filter({ visible: true });
  await expect(byItem).toContainText("מדיום · גבינה");
  await expect(byItem).toContainText("74.00");
  await expect(byItem).toContainText("וול דאן");
  await expect(byItem).toContainText("68.00");
  await expect(main(page)).not.toContainText("216.00");
  await expectCleanPage(page);
});

test("a salad's extras are chosen from its line in the draft", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  await enterAs(page, "manager");
  await addOpenDemoEntry(SHIRAN, 1);
  await page.goto("/orders");
  await tile(page, "12").click();
  await showItems(page, "phone");

  // Only optional choices: one tap adds it, and says where they change.
  await expect(button(page, "סלט ירוק")).toContainText(
    rt("app.orders.picker.optionalChoices"),
  );
  await button(page, "סלט ירוק").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await showOrder(page, "phone");
  await choicesOf(page, "סלט ירוק").click();
  const sheet = choiceSheet(page, "סלט ירוק");
  await expect(sheet).toBeVisible();
  await choose(sheet, "פטה");
  await expect(sheet).toContainText("42.00");
  await sheet
    .getByRole("button", { name: rt("app.orders.choice.save") })
    .click();
  await expect(sheet).toHaveCount(0);
  await expect(shown(page, "פטה")).toBeVisible();
  await expect(shown(page, "42.00")).toBeVisible();

  // One tap more is a plain salad of its own: the one with feta stays.
  await showItems(page, "phone");
  await button(page, "סלט ירוק").click();
  await showOrder(page, "phone");
  await expect(
    main(page)
      .getByRole("button", {
        name: new RegExp(
          `^${literal(rt("app.orders.draft.choices"))}.*סלט ירוק`,
        ),
      })
      .filter({ visible: true }),
  ).toHaveCount(2);
});

test("a doneness gone from the menu meanwhile: the send says so, and the line asks to choose again", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "tablet", "a phone and a desktop do");
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  try {
    await enterAs(page, "manager");
    await addOpenDemoEntry(SHIRAN, 1);
    await page.goto("/orders");
    await tile(page, "12").click();
    await showItems(page, project);
    await find(page, "המבורגר");
    await chooseAndAdd(page, "המבורגר", ["מדיום"]);

    // Meanwhile the menu's manager takes "מדיום" off the burger.
    await setDemoItemGroups("המבורגר", [
      {
        id: "doneness",
        name: "מידת עשייה",
        min: 1,
        max: 1,
        options: [
          { id: "mr", name: "מדיום רייר", priceAgorot: 0 },
          { id: "mw", name: "מדיום וול", priceAgorot: 0 },
          { id: "wd", name: "וול דאן", priceAgorot: 0 },
        ],
      },
      {
        id: "extras",
        name: "תוספות",
        min: 0,
        max: 2,
        options: [
          { id: "egg", name: "ביצה", priceAgorot: 600 },
          { id: "cheese", name: "גבינה", priceAgorot: 600 },
        ],
      },
    ]);
    await showOrder(page, project);
    await send(page);
    await expect(shown(page, rt("app.orders.failed.choices"))).toBeVisible();
    expect(await demoRounds("12")).toBe(0);
    // Once the mode reads the menu again, the line says what to do.
    await expect(shown(page, rt("app.orders.draft.choicesStale"))).toBeVisible({
      timeout: 20_000,
    });
    await choicesOf(page, "המבורגר").click();
    const sheet = choiceSheet(page, "המבורגר");
    // Said for its save: nothing is added from a line.
    await expect(
      sheet.getByText(
        rt("app.orders.choice.missingSave", { groups: "מידת עשייה" }),
      ),
    ).toBeVisible();
    await choose(sheet, "מדיום וול");
    await sheet
      .getByRole("button", { name: rt("app.orders.choice.save") })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect(shown(page, rt("app.orders.draft.choicesStale"))).toHaveCount(
      0,
    );
    await send(page);
    await expect.poll(() => demoRounds("12")).toBe(1);
    expect(await demoLines("12")).toEqual([
      {
        name: "המבורגר",
        choices: ["מדיום וול"],
        unitAgorot: 6800,
        quantity: 1,
      },
    ]);
  } finally {
    await resetDemoMenu();
  }
});
