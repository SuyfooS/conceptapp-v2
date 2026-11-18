import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearShopLists,
  resetShopLists,
  sendShopListToWorkers,
  shopList,
  shopListLines,
} from "./db";
import { secondPage, signIn } from "./session";

// Lists, part 5 (L5): lists between departments, in the demo shop (supabase/
// seed.sql): Itai, Liya and Omer (its manager) on the floor, Liya at the
// checkout too, and Roni at the stock. The floor's order to the stock
// ("הזמנה מהמחסן") asks for counts, and the shop's reset sends one, waiting at
// the stock with its first item given (20261110001400_lists_pass.sql). Each
// test starts from the shop's lists as its reset leaves them, and leaves them
// so.
const ITAI = {
  local: "050-000-0011",
  e164: "+972500000011",
  id: "00000000-0000-4000-a000-000000000011",
};
const RONI = { local: "050-000-0012", e164: "+972500000012" };
const LIYA = {
  local: "050-000-0013",
  e164: "+972500000013",
  id: "00000000-0000-4000-a000-000000000013",
};
const OMER_ID = "00000000-0000-4000-a000-000000000008";

const ORDER = "הזמנה מהמחסן";
const CLOSING = "סגירת החנות";
const COUNT = "ספירת מלאי";
const FLOOR = "רצפת מכירה";
const STOCK = "מחסן";
const CHECKOUT = "קופה";
const ROLLS = "גלילי קופה";
const NOTE = "שני גלילים יגיעו מחר";

const l = he.app.lists;
const words = he.app.notifications;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );
/** One case of an ICU plural ("one", "other"), with its count, as the screen says it. */
const plural = (text: string, which: "one" | "other", count: number) =>
  (new RegExp(`${which} \\{([^}]*)\\}`).exec(text)?.[1] ?? text).replace(
    "#",
    String(count),
  );

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

/**
 * A list's card or row on Lists, whichever this width draws: named by the
 * list first, so the way to send the order ("שליחת הזמנה מהמחסן") isn't one.
 */
const listLink = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(name)}`) })
    .filter({ visible: true });
const bell = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(words.bell)}`) });
/** A line of the inbox, by its title. */
const line = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(literal(title)) }).first();
/** The department filter's menu, named with what it shows now. */
const filterMenu = (page: Page, shown: string) =>
  page
    .getByRole("button", {
      name: fill(l.filter.menu, { label: l.filter.label, name: shown }),
    })
    .filter({ visible: true });

test.beforeEach(async () => {
  await resetShopLists();
});

test.afterEach(async () => {
  await resetShopLists();
});

// At every width, nothing written: the stock opens the order waiting there,
// with its count given, and the sheet that passes it on is clean.
test("the stock opens the floor's order, and its pass sheet reads cleanly", async ({
  page,
}) => {
  await signIn(page, RONI);
  await page.goto("/lists");
  await listLink(page, ORDER).first().click();
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: ORDER }),
  ).toBeVisible();
  // What was asked for, and the first item given as asked.
  await expect(
    page.getByRole("spinbutton", {
      name: fill(l.list.givenOf, { label: "שקיות" }),
    }),
  ).toHaveValue("2");
  await expectCleanPage(page);

  await page.getByRole("button", { name: l.list.pass.action }).click();
  const sheet = page.getByRole("dialog", { name: l.list.pass.title });
  await expect(
    sheet.getByRole("radio", { name: new RegExp(FLOOR) }),
  ).toBeEnabled();
  // The stock holds it: it isn't offered back to itself.
  await expect(
    sheet.getByRole("radio", { name: new RegExp(`^${STOCK}`) }),
  ).toHaveCount(0);
  await expect(
    sheet.getByRole("button", { name: l.list.pass.choose }),
  ).toBeDisabled();
  // The sheet hides the page from screen readers: axe on it alone.
  const open = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .analyze();
  expect(open.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

// At every width, nothing written: Liya, at the checkout and on the floor,
// follows the floor's order waiting at the stock, and the department filter
// shows one department's lists at a time.
test("someone in two departments follows their order, and filters by department", async ({
  page,
}) => {
  await signIn(page, LIYA);
  await page.goto("/lists");
  await expect(
    page
      .getByRole("heading", { name: plural(l.asked, "one", 1) })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(listLink(page, ORDER).first()).toBeVisible();
  await expect(listLink(page, CLOSING).first()).toBeVisible();
  await expectCleanPage(page);

  // The checkout's lists alone: its closing, not the floor's order.
  await filterMenu(page, l.filter.all).click();
  await page
    .getByRole("menuitemradio", { name: CHECKOUT, exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists\?department=[0-9a-f-]{36}$/);
  await expect(filterMenu(page, CHECKOUT)).toBeVisible();
  await expect(listLink(page, CLOSING).first()).toBeVisible();
  await expect(listLink(page, ORDER)).toHaveCount(0);
  await expectCleanPage(page);

  // The floor's: its order, not the checkout's closing.
  await filterMenu(page, CHECKOUT).click();
  await page.getByRole("menuitemradio", { name: FLOOR, exact: true }).click();
  await expect(filterMenu(page, FLOOR)).toBeVisible();
  await expect(listLink(page, ORDER).first()).toBeVisible();
  await expect(listLink(page, CLOSING)).toHaveCount(0);

  // And back to every department.
  await filterMenu(page, FLOOR).click();
  await page
    .getByRole("menuitemradio", { name: l.filter.all, exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(listLink(page, CLOSING).first()).toBeVisible();
});

// The whole way, once, on the widest screen: it writes the shop's lists, with
// three people. The floor asks with its counts, the stock gives fewer of one
// and says why, passes it back with a note, the floor hears it came back and
// finishes it, and the floor's other people hear it is finished.
test("an order goes to the stock and back, and the floor is told", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await clearShopLists();

  // Itai, on the floor, sends the floor's order: eight rolls this time.
  await signIn(page, ITAI);
  await page.goto("/lists");
  await page
    .getByRole("main")
    .getByRole("link", { name: fill(l.sendOne, { name: ORDER }) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/send\?template=[0-9a-f-]{36}$/);
  await expect(
    page.getByText(fill(l.send.fixedTo, { name: STOCK })),
  ).toBeVisible();
  const rolls = page.getByRole("spinbutton", {
    name: fill(l.send.quantityOf, { label: ROLLS }),
  });
  await expect(rolls).toHaveValue("5");
  await rolls.fill("8");
  await expectCleanPage(page);
  await page
    .getByRole("button", {
      name: fill(l.send.submit.department, { name: STOCK }),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\?sent=[0-9a-f-]{36}$/);
  const id = new URL(page.url()).searchParams.get("sent") ?? "";
  await expect
    .poll(async () => (await shopList(id))?.items.map((i) => i.requested))
    .toEqual([2, 8, 1, 1]);

  // Roni, at the stock, hears of it and opens it from the bell.
  const roni = await secondPage(browser, testInfo);
  try {
    await signIn(roni, RONI);
    await bell(roni).click();
    await line(
      roni,
      fill(words.kinds.lists.sent.title, { name: ORDER }),
    ).click();
    await expect(roni).toHaveURL(new RegExp(`/lists/${id}$`));

    // He gives everything, six rolls of the eight, and says why.
    for (const label of ["שקיות", ROLLS, "תוויות מחיר", "חומרי ניקוי"]) {
      await roni.getByRole("checkbox", { name: label, exact: true }).click();
    }
    const given = roni.getByRole("spinbutton", {
      name: fill(l.list.givenOf, { label: ROLLS }),
    });
    await expect(given).toHaveValue("8");
    await given.fill("6");
    await given.press("Enter");
    await expect
      .poll(async () => (await shopList(id))?.items.map((i) => i.given))
      .toEqual([2, 6, 1, 1]);
    await expect(
      roni
        .getByText(plural(l.list.short, "other", 2), { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await roni
      .getByRole("button", { name: `${l.list.comment.add}: ${ROLLS}` })
      .click();
    const comment = roni.getByRole("dialog", { name: l.list.comment.title });
    await comment
      .getByLabel(l.list.comment.label, { exact: true })
      .fill("נשארו רק 6");
    await comment.getByRole("button", { name: l.list.comment.save }).click();
    await expect
      .poll(async () => (await shopList(id))?.items[1]?.comment)
      .toBe("נשארו רק 6");

    // And passes it back to the floor, with a note.
    await roni.getByRole("button", { name: l.list.pass.action }).click();
    const sheet = roni.getByRole("dialog", { name: l.list.pass.title });
    await sheet.getByRole("radio", { name: new RegExp(FLOOR) }).check();
    await sheet.getByLabel(l.list.pass.note, { exact: true }).fill(NOTE);
    await sheet
      .getByRole("button", { name: fill(l.list.pass.submit, { name: FLOOR }) })
      .click();
    await expect(
      roni
        .getByRole("status")
        .filter({ hasText: fill(l.list.pass.passed, { name: FLOOR }) }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const list = await shopList(id);
        return list ? { holder: list.holder, passes: list.passes } : null;
      })
      .toEqual({
        holder: FLOOR,
        passes: [{ from: STOCK, to: FLOOR, note: NOTE }],
      });
    // The stock still reads it, and says where it went.
    await expect(
      roni
        .getByText(
          fill(l.list.readOnly.passedElsewhere, {
            to: fill(l.card.to.department, { name: FLOOR }),
          }),
        )
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(
      roni.getByRole("button", { name: l.list.pass.action }),
    ).toHaveCount(0);
  } finally {
    await roni.context().close();
  }

  // The floor hears it came back, and opens it from the bell.
  await page.goto("/home");
  await bell(page).click();
  await line(
    page,
    fill(words.kinds.lists.passed.title, { name: ORDER, department: FLOOR }),
  ).click();
  await expect(page).toHaveURL(new RegExp(`/lists/${id}$`));
  await expect(
    page
      .getByText(fill(l.list.timeline.note, { note: NOTE }))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", {
      name: fill(l.list.givenOf, { label: ROLLS }),
    }),
  ).toHaveValue("6");
  await expectCleanPage(page);

  // Itai finishes it: the floor's others hear it is finished, not him.
  await page
    .getByRole("button", { name: l.list.finish, exact: true })
    .filter({ visible: true })
    .click();
  await expect.poll(async () => (await shopList(id))?.status).toBe("finished");
  await expect
    .poll(() => shopListLines("lists.finished", id))
    .toEqual([OMER_ID, LIYA.id]);
  expect(await shopListLines("lists.passed", id)).toEqual([
    OMER_ID,
    ITAI.id,
    LIYA.id,
  ]);
});

// Once, on the widest screen: it writes the shop's lists. Itai holds the
// stock count only as one of the workers it was sent to, so once he passes it
// to the stock he no longer reads it: back on Lists, which says where it went.
test("someone who held a list by their role passes it on, and Lists says where it went", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const id = await sendShopListToWorkers(COUNT);

  await signIn(page, ITAI);
  await page.goto("/lists");
  await listLink(page, COUNT).first().click();
  await expect(page).toHaveURL(new RegExp(`/lists/${id}$`));
  await page.getByRole("button", { name: l.list.pass.action }).click();
  const sheet = page.getByRole("dialog", { name: l.list.pass.title });
  await sheet.getByRole("radio", { name: new RegExp(`^${STOCK}`) }).check();
  await sheet
    .getByRole("button", { name: fill(l.list.pass.submit, { name: STOCK }) })
    .click();

  // Lists says so, once: the address loses what brought it.
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: fill(l.list.pass.passed, { name: STOCK }) }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(listLink(page, COUNT)).toHaveCount(0);
  await expect.poll(async () => (await shopList(id))?.holder).toBe(STOCK);
  await expectCleanPage(page);
});
