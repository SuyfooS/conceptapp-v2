import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import {
  addOpenDemoEntry,
  clearTimeEntries,
  clearTimeEntriesSince,
  databaseNow,
  demoLineTakenBack,
  demoModuleSettings,
  demoRounds,
  demoTicketStatus,
  endDemoEntry,
  resetDemoOrders,
  setDemoModuleSettings,
  setDemoRequirePunchCode,
  templateWording,
} from "./db";
import { secondPage, signIn } from "./session";
import { setDemoModule } from "./sms";
import { heT } from "./t";

// Taking orders (waiter mode). P3's settings in the console; P4's screens on
// the demo restaurant, where the local seed has the module on and three
// orders waiting: the mode's items in the app's own shell, a waiter sending
// to the kitchen and the bar, the kitchen marking ready on a phone, serving,
// the same send twice as one round, the draft waiting while the waiter
// clocks in, taking a line back, holding a dish and firing it, and who gets
// the mode at all, and the owner choosing who takes orders. The restaurant
// reads its template's words ("שולחן", "מנה", "מצב מלצרות"), read here from
// the database as it does. Each test puts the orders and the clock back:
// Yoav's own hours only (his seeded month is the payroll specs', which run
// after these), the others' as the clock specs clear them. Seeded in
// supabase/seed.sql: Yoav in the bar, who signs in by SMS, and the team in
// no business.
const YOAV = { local: "050-000-0004", e164: "+972500000004" };
const OWNER = "+972500000001";
const SHIRAN = "+972500000002";
const NOA = "+972500000003";
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const RESTAURANT = "00000000-0000-4000-b000-000000000001";

const m = he.app.manage;
const o = he.modules.order_taking.settings;
const e = he.auth.enter;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The restaurant's words: the app's, with its template's sentences in place. */
let rt = heT;

test.beforeAll(async () => {
  const words = await templateWording("restaurant");
  rt = createTranslator({
    locale: "he",
    messages: mergeWording(he as MessageTree, words) as typeof he,
  }) as typeof heT;
});

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

const main = (page: Page) => page.getByRole("main");
const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();
const toast = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });
const button = (page: Page, text: string | RegExp) =>
  main(page)
    .getByRole("button", {
      name: typeof text === "string" ? new RegExp(`^${literal(text)}`) : text,
    })
    .filter({ visible: true })
    .first();
const link = (page: Page, text: string | RegExp) =>
  main(page)
    .getByRole("link", {
      name: typeof text === "string" ? new RegExp(`^${literal(text)}`) : text,
    })
    .filter({ visible: true })
    .first();
const navItem = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true })
    .first()
    .getByRole("link", { name: new RegExp(`^${literal(name)}`) });
const heading = (page: Page, level: number, name: string) =>
  main(page).getByRole("heading", { level, name }).filter({ visible: true });

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

/** In through the door, as one of the demo restaurant's people. */
async function enterAs(page: Page, key: keyof typeof e.people) {
  await page.goto("/enter");
  await page
    .getByRole("region", { name: e.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
}

/** A table's tile on the floor, by its name. */
const tile = (page: Page, name: string) =>
  link(
    page,
    new RegExp(`^${literal(rt("app.orders.place.kind"))}\\s*${name}(\\D|$)`),
  );

/**
 * On a phone the items and the order show one at a time, switched by a
 * Segmented: buttons with aria-pressed. The order's own "הוספת מנות" comes
 * after it, and switches the same way.
 */
async function showItems(page: Page, project: string) {
  if (project !== "phone") return;
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(rt("app.orders.order.view.add"))}`),
    })
    .filter({ visible: true })
    .first()
    .click();
}

async function showOrder(page: Page, project: string) {
  if (project !== "phone") return;
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(rt("app.orders.order.view.order"))}`),
    })
    .filter({ visible: true })
    .first()
    .click();
}

const send = (page: Page) => button(page, rt("app.orders.send.label")).click();

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
  await page.getByLabel(rt("app.orders.note.allergyLabel")).fill("בוטנים");
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
  await navItem(page, rt("modules.order_taking.mode.places")).click();
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
  await page.getByRole("button", { name: rt("app.orders.toast.undo") }).click();
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
  await page.getByRole("button", { name: rt("app.orders.toast.undo") }).click();
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
