import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { demoLists, endViewSessions, resetDemoLists } from "./db";
import { secondPage, signIn } from "./session";

// Lists, part 2 (L2): the demo restaurant starts with two example lists
// (supabase/migrations/20261109000700_lists_on.sql): the kitchen's opening
// list sent to Noa, with two of its checks done by her, and the floor's
// opening list sent to the floor. Each test starts from them again. The
// people are seeded in supabase/seed.sql: Noa in the kitchen, Yoav at the bar
// and the storeroom, Shiran (the manager) on the floor and at the bar.
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const YOAV = { local: "050-000-0004", e164: "+972500000004" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const OPENING = "פתיחת מטבח";
const CLOSING = "סגירת מטבח";
const KITCHEN = "מטבח";

const l = he.app.lists;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );
/** The words of an ICU plural for one, as the screen says it. */
const one = (text: string) =>
  /one \{([^}]*)\}/.exec(text)?.[1] ?? text.replace(/\{.*\}/, "");

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

const nav = (page: Page) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
/** A list's card or row on Lists, whichever this width draws. */
const listLink = (page: Page, name: string) =>
  page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(literal(name)) })
    .filter({ visible: true })
    .first();
const finishButton = (page: Page) =>
  page
    .getByRole("button", { name: l.list.finish, exact: true })
    .filter({ visible: true });

test.beforeEach(async () => {
  await resetDemoLists();
});

test.afterEach(async () => {
  await resetDemoLists();
  await endViewSessions(ADMIN.e164);
});

test("a worker fills the kitchen's opening list, finishes it and takes it back", async ({
  page,
}, testInfo) => {
  await signIn(page, NOA);

  // The tab says one list waits for her, and leads to it.
  const tab = nav(page).getByRole("link", {
    name: new RegExp(`^${literal(he.modules.lists.name)}`),
  });
  await expect(tab).toHaveAccessibleName(
    new RegExp(`^${literal(he.modules.lists.name)}\\s*,\\s*1\\b`),
  );
  await tab.click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(
    page.getByRole("heading", { level: 1, name: l.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("lists.png"),
    fullPage: true,
  });

  await listLink(page, OPENING).click();
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: OPENING }),
  ).toBeVisible();
  const hero = page.getByRole("region", { name: l.list.progressLabel });
  await expect(hero).toContainText(
    fill(l.card.progress, { done: 2, total: 6 }),
  );
  await expectCleanPage(page);

  // A tick shows at once and is saved.
  await page.getByRole("checkbox", { name: /ניקוי משטחי עבודה/ }).click();
  await expect(hero).toContainText(
    fill(l.card.progress, { done: 3, total: 6 }),
  );
  await expect.poll(async () => (await demoLists(OPENING))[0]?.done).toBe(3);

  // A reading outside its range is said in words.
  const fridge = page.getByLabel(
    fill(l.list.readingOf, { label: "מקרר ראשי" }),
  );
  await fridge.fill("9");
  await fridge.press("Enter");
  await expect(
    page
      .getByText(new RegExp(literal(l.list.outOfRange.split(" <")[0] ?? "")))
      .first(),
  ).toBeVisible();

  // The freezer is still empty, and it is required: no finishing yet.
  await expect(finishButton(page)).toBeDisabled();
  await expect(
    page.getByText(one(l.list.leftRequired)).filter({ visible: true }).first(),
  ).toBeVisible();

  // Below zero, with the minus beside the field, named for it.
  await expect(
    page.getByRole("button", { name: `${l.list.minus}: מקפיא`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const freezer = page.getByLabel(fill(l.list.readingOf, { label: "מקפיא" }));
  await freezer.fill("20");
  await freezer.press("Enter");
  await expect(finishButton(page)).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("list-filled.png"),
    fullPage: true,
  });

  // Finishing it, with the optional note left empty, then taking it back.
  await finishButton(page).click();
  const undo = page
    .getByRole("status")
    .filter({ hasText: l.list.finished })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeVisible();
  await expect
    .poll(async () => (await demoLists(OPENING))[0]?.status)
    .toBe("finished");
  await expectCleanPage(page);
  await undo.click();
  await expect(finishButton(page)).toBeEnabled();
  await expect
    .poll(async () => (await demoLists(OPENING))[0]?.status)
    .toBe("open");

  // And finishing it for good. Read-only now, the freezer keeps its sign,
  // and a worker's only way back is the undo.
  await finishButton(page).click();
  await expect(undo).toBeVisible();
  await expect
    .poll(async () => (await demoLists(OPENING))[0]?.status)
    .toBe("finished");
  await expect(freezer).toHaveValue("-20");
  await expect(page.getByRole("button", { name: l.list.reopen })).toHaveCount(
    0,
  );

  // Back on Lists, it closed today, and nothing waits for her.
  await page.goto("/lists");
  await expect(
    nav(page).getByRole("link", { name: he.modules.lists.name }),
  ).toHaveAccessibleName(he.modules.lists.name);
  await expectCleanPage(page);
});

test("a manager sends a list to the kitchen, which hears of it and opens it", async ({
  browser,
  page,
}, testInfo) => {
  // Several people, so once, on the widest screen.
  test.skip(testInfo.project.name !== "desktop", "one run is enough");

  await signIn(page, MANAGER);
  await page.goto("/lists");
  // Shiran is on the floor: the floor's opening list is hers too.
  await expect(listLink(page, "פתיחת אולם")).toBeVisible();
  await expect(page.getByText(l.team.title).first()).toBeVisible();

  await page
    .getByRole("main")
    .getByRole("link", { name: l.send.action })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/send$/);
  await expect(
    page.getByRole("heading", { level: 1, name: l.send.title }),
  ).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(literal(CLOSING)) }).check();
  // The kitchen's closing list goes to the kitchen unless someone chooses.
  const send = page.getByRole("button", {
    name: fill(l.send.submit.department, { name: KITCHEN }),
  });
  await expect(send).toBeEnabled();
  await expectCleanPage(page);
  await send.click();

  await expect(page).toHaveURL(/\/lists\?sent=/);
  await expect(
    page
      .getByRole("status")
      .filter({
        hasText: fill(l.send.sent, {
          to: fill(l.card.to.department, { name: KITCHEN }),
        }),
      })
      .first(),
  ).toBeVisible();
  await expect.poll(async () => (await demoLists(CLOSING)).length).toBe(1);

  // Noa, in the kitchen, has a line on her bell that opens the list itself.
  const noa = await secondPage(browser, testInfo);
  try {
    await signIn(noa, NOA);
    await noa
      .getByRole("main")
      .getByRole("link", {
        name: new RegExp(`^${literal(he.app.notifications.bell)}`),
      })
      .click();
    await noa
      .getByRole("button", {
        name: new RegExp(
          literal(
            fill(he.app.notifications.kinds.lists.sent.title, {
              name: CLOSING,
            }),
          ),
        ),
      })
      .first()
      .click();
    await expect(noa).toHaveURL(/\/lists\/[0-9a-f-]{36}$/);
    await expect(
      noa.getByRole("heading", { level: 1, name: CLOSING }),
    ).toBeVisible();
  } finally {
    await noa.context().close();
  }

  // Yoav isn't in the kitchen: it isn't his.
  const yoav = await secondPage(browser, testInfo);
  try {
    await signIn(yoav, YOAV);
    await yoav.goto("/lists");
    await expect(
      yoav.getByRole("heading", { level: 1, name: l.title }),
    ).toBeVisible();
    await expect(
      yoav
        .getByRole("main")
        .getByRole("link", { name: new RegExp(literal(CLOSING)) }),
    ).toHaveCount(0);
  } finally {
    await yoav.context().close();
  }
});

test("sending can be taken back while nobody started the list", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, MANAGER);
  await page.goto("/lists/send");
  await page.getByRole("radio", { name: new RegExp(literal(CLOSING)) }).check();
  await page
    .getByRole("button", {
      name: fill(l.send.submit.department, { name: KITCHEN }),
    })
    .click();
  await expect(page).toHaveURL(/\/lists\?sent=/);
  await page
    .getByRole("status")
    .filter({ hasText: KITCHEN })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect(page).toHaveURL(/\/lists$/);
  // The word that it was taken back outlives the list it took back.
  await expect(
    page.getByRole("status").filter({ hasText: l.send.cancelled }),
  ).toBeVisible();
  await expect
    .poll(async () => (await demoLists(CLOSING))[0]?.status)
    .toBe("cancelled");
});

test("sending isn't taken back once someone started the list", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, MANAGER);
  await page.goto("/lists/send");
  await page.getByRole("radio", { name: new RegExp(literal(CLOSING)) }).check();
  await page
    .getByRole("button", {
      name: fill(l.send.submit.department, { name: KITCHEN }),
    })
    .click();
  await expect(page).toHaveURL(/\/lists\?sent=/);
  const undo = page
    .getByRole("status")
    .filter({ hasText: KITCHEN })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeVisible();

  // Noa ticks one of its items while the undo is still on the manager's screen.
  const noa = await secondPage(browser, testInfo);
  try {
    await signIn(noa, NOA);
    await noa.goto("/lists");
    await listLink(noa, CLOSING).click();
    await noa.getByRole("checkbox").first().click();
    await expect.poll(async () => (await demoLists(CLOSING))[0]?.done).toBe(1);
  } finally {
    await noa.context().close();
  }

  await undo.click();
  await expect(page.getByText(l.send.started)).toBeVisible();
  await expect
    .poll(async () => (await demoLists(CLOSING))[0]?.status)
    .toBe("open");
});

test("the team viewing as a manager reads the lists and changes nothing", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", {
      name: he.admin.setup.viewAs.as.manager,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/home$/);

  await page.goto("/lists");
  // Nobody's own lists: the business's, with no way to send.
  await expect(listLink(page, OPENING)).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: l.send.action }),
  ).toHaveCount(0);
  await listLink(page, OPENING).click();
  await expect(page.getByText(l.list.readOnly.viewOnly).first()).toBeVisible();
  await expect(finishButton(page)).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expectCleanPage(page);

  // The business's lists (L3), only read: nothing to make, and an editor
  // whose fields are closed and which removes nothing.
  await page.goto("/lists/templates");
  await expect(page.getByText(l.templates.viewOnly).first()).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: l.templates.create, exact: true }),
  ).toHaveCount(0);
  await expectCleanPage(page);
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(OPENING)}`) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/templates\/[0-9a-f-]{36}$/);
  await expect(
    page.getByText(l.templates.editor.viewOnly).first(),
  ).toBeVisible();
  await expect(
    page.getByLabel(l.templates.editor.name, { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: l.templates.editor.archive }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: l.items.add, exact: true }),
  ).toHaveCount(0);
  await expectCleanPage(page);
});
