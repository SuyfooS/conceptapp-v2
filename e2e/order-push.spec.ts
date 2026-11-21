import { expect, type Page, test } from "@playwright/test";
import {
  addOrderPushStation,
  ageOrderPushRound,
  closeOrderPushBusiness,
  ORDER_PUSH_BUSINESS,
  ORDER_PUSH_ITEM,
  ORDER_PUSH_PEOPLE,
  openOrderPushBusiness,
  orderLineOf,
  orderPushTicket,
  pushDevices,
  runOrderNotices,
} from "./db";
import { fakePushManager, pushes } from "./fake-push";
import { MockPushService } from "./mock-push";
import {
  button,
  heading,
  loadRestaurantWords,
  rt,
  send,
  tile,
  toast,
} from "./orders-parts";
import { secondPage, signIn } from "./session";

// "מוכן" on the phone (waiter mode P8b), in a restaurant of its own, since
// a demo's lines never reach one: the cook's "מוכן" sends the owner's push by
// itself about 11 seconds later, with no minute job; with the owner's order
// open on the phone, the mode reads the line first and no push follows; and
// a kitchen screen that didn't get a round tells at once, through the cron
// route. The page's PushManager is a fake on the loopback mock push service
// (fake-push.ts). Needs the generated keys CI sets (VAPID_*, CRON_SECRET,
// PUSH_TEST_ORIGIN). Once, on the desktop project, a table per step.

const ORIGIN = process.env.PUSH_TEST_ORIGIN ?? "";
const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const KITCHEN = "מטבח";

test.skip(
  !ORIGIN || !PUBLIC_KEY || !CRON_SECRET,
  "needs VAPID keys, CRON_SECRET and PUSH_TEST_ORIGIN (CI sets them)",
);

test.beforeAll(loadRestaurantWords);

const table = (name: string) => rt("app.orders.place.numbered", { name });

/** The owner sends that table the starter, from its order's screen. */
async function ownerSends(page: Page, place: string) {
  await page.goto("/orders");
  await tile(page, place).click();
  await expect(heading(page, 1, table(place))).toBeVisible();
  await button(page, ORDER_PUSH_ITEM).click();
  await send(page);
  await expect(
    toast(page, rt("app.orders.toast.sent", { place: table(place) })),
  ).toBeVisible();
}

/** The cook marks that table's kitchen ticket ready on the phone's prep screen. */
async function cookReadies(cook: Page, place: string) {
  await cook.goto("/orders/prep");
  await cook
    .getByRole("article", {
      name: rt("app.orders.prep.label", {
        place: table(place),
        department: KITCHEN,
      }),
    })
    .filter({ visible: true })
    .first()
    .getByRole("button", { name: rt("app.orders.prep.ready") })
    .click();
  await expect(
    toast(
      cook,
      rt("app.orders.toast.ready", {
        place: table(place),
        department: KITCHEN,
      }),
    ),
  ).toBeVisible();
}

/** The minute job's call of the app, as Vault's secret makes it. */
const cron = (page: Page) =>
  page.request.post("/cron/notifications", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

test("ready reaches the sender's phone by itself, unless the open mode showed it first", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "once, on the desktop");
  test.setTimeout(180_000);
  await openOrderPushBusiness();
  const mock = new MockPushService(ORIGIN, PUBLIC_KEY);
  await mock.start();
  try {
    await page.context().grantPermissions(["notifications"], {
      origin: baseURL ?? "",
    });
    await fakePushManager(page, ORIGIN);
    await signIn(page, ORDER_PUSH_PEOPLE.owner);
    await page.goto("/notifications");
    const toggle = page.getByRole("switch", { name: /^התראות ל/ });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () => (await pushDevices(ORDER_PUSH_PEOPLE.owner.id)).length)
      .toBe(1);

    const cook = await secondPage(browser, testInfo);
    await signIn(cook, ORDER_PUSH_PEOPLE.cook);

    // Table 4 sent, and the owner off to Home, where no mode reads it: the
    // cook's "מוכן" sends the push by itself, with no cron.
    await ownerSends(page, "4");
    await page.goto("/home");
    await cookReadies(cook, "4");
    const [first] = await pushes(mock, 1, 25_000);
    expect(first?.problems).toEqual([]);

    // Table 5, its order open: the mode shows it first, and reads its line.
    await ownerSends(page, "5");
    const ticket = await orderPushTicket("5");
    await cookReadies(cook, "5");
    await expect(
      toast(
        page,
        rt("app.orders.toast.ready", {
          place: table("5"),
          department: KITCHEN,
        }),
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        async () =>
          (
            await orderLineOf(
              ORDER_PUSH_PEOPLE.owner.id,
              "order.ready",
              ticket ?? "",
            )
          )?.push,
        { timeout: 10_000 },
      )
      .toBe("skipped");
    // Past the push's 10 seconds and the action's own send, and the minute
    // job's: still the one push.
    await page.waitForTimeout(15_000);
    expect((await cron(page)).status()).toBe(202);
    expect(mock.seen).toHaveLength(1);

    // Table 6, and a kitchen screen running that never got it: told at once.
    // The cook's phone leaves the app first: its prep screen asks every 5
    // seconds, and that read marks the kitchen's new tickets seen (a phone's
    // prep screen counts as the kitchen having them), which would leave the
    // minute job nothing to tell, or settle the line before the cron sends.
    await cook.goto("about:blank");
    await addOrderPushStation();
    await ownerSends(page, "6");
    await ageOrderPushRound("6", 3);
    expect(await runOrderNotices(ORDER_PUSH_BUSINESS)).toBe(1);
    expect((await cron(page)).status()).toBe(202);
    const [, unseen] = await pushes(mock, 2);
    expect(unseen?.problems).toEqual([]);
    await cook.context().close();
  } finally {
    await mock.stop();
    await closeOrderPushBusiness();
  }
});
