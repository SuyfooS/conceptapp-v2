import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import {
  archiveDemoDepartment,
  clearDemoMenuRules,
  demoDepartmentNames,
  demoMenuCategories,
  demoMenuItem,
  demoMenuItemCount,
  demoMenuLog,
  demoMenuRule,
  demoModuleEnabled,
  demoOrderPlaces,
  resetDemoMenu,
  templateWording,
  userIdOf,
} from "./db";
import { secondPage, signIn } from "./session";
import { setDemoModule } from "./sms";
import { heT } from "./t";

// Taking orders' menu on screen (waiter mode P2, issue #191), on the demo
// restaurant, where the local seed has the module on: the team copies a
// menu in from the console; a manager changes a price, marks sold out and
// edits the categories and the places; the kitchen marks sold out what it
// prepares and nothing else; a save someone else overtook shows the item as
// it is now; a department that prepares items says so before and after it
// goes; departments open for taking orders alone; the module's switch and
// the roles' switch open and close it all. The restaurant reads its
// template's words ("מנה", "שולחן", "מצב מלצרות"), read here from the
// database as it does; the console reads the app's own. Each test puts the
// menu back as the seed has it.
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const PREPARING = "מחלקת הכנה";

const o = he.app.orders;
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

test.afterEach(async () => {
  await resetDemoMenu();
  await setDemoModule("order_taking", true);
  await setDemoModule("lists", true);
  await clearDemoMenuRules();
  await archiveDemoDepartment(PREPARING);
});

const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name }).filter({ visible: true });
const notFound = (page: Page) => title(page, he.app.notFound.title);
const shown = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first();
const main = (page: Page) => page.getByRole("main");
const toast = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });
/** A button or link whose name starts with `text`, as the screen shows it. */
const button = (page: Page, text: string) =>
  main(page)
    .getByRole("button", { name: new RegExp(`^${literal(text)}`) })
    .filter({ visible: true })
    .first();
const link = (page: Page, text: string) =>
  main(page)
    .getByRole("link", { name: new RegExp(`^${literal(text)}`) })
    .filter({ visible: true })
    .first();
const soldOut = (page: Page, name: string) =>
  main(page)
    .getByRole("switch", { name: rt("app.orders.menu.soldOutFor", { name }) })
    .filter({ visible: true });

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

/** A category's items, as each screen size shows them: a tablet shows one at a time. */
async function showCategory(page: Page, category: string, project: string) {
  if (project === "tablet") await button(page, category).click();
}

/** Picks `option` in the menu a ChoiceMenu labelled `label` opens. */
async function choose(page: Page, label: string, option: string) {
  await page
    .getByRole("button", { name: new RegExp(`^${literal(label)}`) })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole("menuitemradio", { name: new RegExp(`^${literal(option)}`) })
    .click();
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

test("the team pastes a café's menu in the console, fixes what the preview says, and adds it", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const since = new Date(Date.now() - 1000);
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant/settings");
  await expect(
    page.getByRole("heading", { level: 2, name: he.admin.settings.menu.title }),
  ).toBeVisible();
  await link(page, he.admin.settings.menu.import).click();
  await expect(page).toHaveURL(/\/admin\/businesses\/demo-restaurant\/menu$/);
  await expect(title(page, o.import.title)).toBeVisible();

  const paste = page.getByLabel(o.import.paste);
  await paste.fill(
    [
      "שתייה חמה",
      "קפה הפוך 14/17",
      "+ שוט נוסף 3",
      "12 םח הת",
      "מאפה היום, שואלים את המלצר על הטעמים של היום",
      "עיקריות",
      "שניצל 62",
      "פרגית 72",
    ].join("\n"),
  );
  await expect(shown(page, o.import.problem.reversed)).toBeVisible();
  await expect(shown(page, o.import.problem.noPrice)).toBeVisible();
  await expect(
    shown(page, heT("app.orders.import.blocked", { count: 2 })),
  ).toBeVisible();
  // Nothing is added while a line has a problem.
  await expect(
    page.getByRole("button", {
      name: heT("app.orders.import.action", { count: 2 }),
    }),
  ).toHaveCount(0);
  await expectCleanPage(page);

  // The line a PDF turned around, turned back; the one with no price deleted.
  await page.getByRole("button", { name: o.import.unreverse }).click();
  await expect(paste).toHaveValue(/תה חם 12/);
  const text = await paste.inputValue();
  await paste.fill(
    text
      .split("\n")
      .filter((line) => !line.startsWith("מאפה היום"))
      .join("\n"),
  );
  // The schnitzel is on the menu already; the mains keep their kitchen.
  await expect(shown(page, o.import.line.known)).toBeVisible();
  await expect(
    shown(
      page,
      heT("app.orders.import.line.categoryKnown", { department: "מטבח" }),
    ),
  ).toBeVisible();
  await choose(
    page,
    heT("app.orders.import.department", { category: "שתייה חמה" }),
    "בר",
  );
  await page.screenshot({
    path: testInfo.outputPath("menu-import.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: heT("app.orders.import.action", { count: 3 }),
    })
    .click();
  await expect(
    shown(page, heT("app.orders.import.done", { items: 3, categories: 1 })),
  ).toBeVisible();

  const coffee = await demoMenuItem("קפה הפוך");
  expect(coffee).toMatchObject({ priceAgorot: 1400, category: "שתייה חמה" });
  expect(coffee?.groups).toMatchObject([
    {
      id: "size",
      min: 1,
      max: 1,
      options: [
        { name: "רגיל", priceAgorot: 0 },
        { name: "גדול", priceAgorot: 300 },
      ],
    },
    { id: "extras", min: 0, options: [{ name: "שוט נוסף", priceAgorot: 300 }] },
  ]);
  expect(await demoMenuItem("תה חם")).toMatchObject({ priceAgorot: 1200 });
  expect(await demoMenuItemCount("שניצל")).toBe(1);
  expect(await demoMenuCategories()).toContainEqual({
    name: "שתייה חמה",
    department: "bar",
  });
  const team = await userIdOf(ADMIN.e164);
  expect(
    (await demoMenuLog(since)).filter((row) => row.action === "menu.import"),
  ).toEqual([
    {
      action: "menu.import",
      actor: team,
      details: { categories: 1, items: 3 },
    },
  ]);
});

test("a manager reaches the menu from the management page and changes a price", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  await signIn(page, MANAGER);
  await page.goto("/manage");
  await link(page, o.menu.title).click();
  await expect(page).toHaveURL(/\/orders\/menu$/);
  await expect(title(page, o.menu.title)).toBeVisible();
  // The restaurant's own name for the module, over the title.
  await expect(shown(page, "מצב מלצרות")).toBeVisible();
  await expect(
    shown(page, rt("app.orders.menu.status.items", { count: 13 })),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("menu.png"),
    fullPage: true,
  });

  await showCategory(page, "עיקריות", project);
  if (project === "desktop") {
    // In place, on the table, with its undo.
    const price = main(page).getByLabel(
      rt("app.orders.menu.priceFor", { name: "שניצל" }),
    );
    await price.fill("64");
    await price.press("Enter");
    const saved = toast(
      page,
      rt("app.orders.menu.toast.price", { name: "שניצל" }),
    );
    await expect(saved).toBeVisible();
    await expect
      .poll(async () => (await demoMenuItem("שניצל"))?.priceAgorot)
      .toBe(6400);
    await saved.getByRole("button", { name: o.menu.toast.undo }).click();
    await expect
      .poll(async () => (await demoMenuItem("שניצל"))?.priceAgorot)
      .toBe(6200);
    // The undo's answer, with the item's new version, can still be on its
    // way once the database has it: a fresh page reads that version, so the
    // next price saves on it.
    await page.reload();
    await expect(price).toHaveValue("62");
    await price.fill("64");
    await price.press("Enter");
    await expect(saved).toBeVisible();
  } else {
    await button(page, "שניצל").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByLabel(o.menu.sheet.price, { exact: true }).fill("64");
    await expectCleanPage(page);
    await sheet.getByRole("button", { name: o.menu.sheet.save }).click();
    await expect(
      toast(page, rt("app.orders.menu.toast.saved", { name: "שניצל" })),
    ).toBeVisible();
  }
  await expect
    .poll(async () => (await demoMenuItem("שניצל"))?.priceAgorot)
    .toBe(6400);

  // The activity log says it, the price before and after.
  await page.goto("/manage/activity");
  await expect(
    shown(
      page,
      rt("app.manage.activity.actions.menu.itemSave", { name: "שניצל" }),
    ),
  ).toBeVisible();
  await expect(shown(page, "64.00 ₪")).toBeVisible();
});

test("the menu's manager and the kitchen mark sold out, each what is theirs", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const noa = await secondPage(browser, testInfo);
  try {
    await signIn(page, MANAGER);
    await page.goto("/orders/menu");
    await showCategory(page, "עיקריות", project);
    await soldOut(page, "פסטה").click();
    await expect(soldOut(page, "פסטה")).toHaveAttribute("aria-checked", "true");
    const marked = toast(
      page,
      rt("app.orders.menu.toast.soldOut", { name: "פסטה" }),
    );
    await marked.getByRole("button", { name: o.menu.toast.undo }).click();
    await expect
      .poll(async () => (await demoMenuItem("פסטה"))?.available)
      .toBe(true);
    await soldOut(page, "פסטה").click();
    await expect
      .poll(async () => (await demoMenuItem("פסטה"))?.available)
      .toBe(false);

    // In the item's sheet its own switch is the way back: the toast under the
    // sheet, which pressing would close the sheet, offers no undo, and what
    // was typed in the sheet stays.
    await button(page, "שניצל").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const typed = sheet.getByLabel(o.menu.sheet.price, { exact: true });
    await typed.fill("64");
    const inSheet = sheet.getByRole("switch", {
      name: o.menu.soldOut,
      exact: true,
    });
    await inSheet.click();
    // Under the sheet, so out of the accessibility tree while it is open.
    const said = page.getByRole("status", { includeHidden: true }).filter({
      hasText: rt("app.orders.menu.toast.soldOut", { name: "שניצל" }),
    });
    await expect(said).toBeVisible();
    await expect(
      said.getByRole("button", {
        name: o.menu.toast.undo,
        includeHidden: true,
      }),
    ).toHaveCount(0);
    await expect
      .poll(async () => (await demoMenuItem("שניצל"))?.available)
      .toBe(false);
    await inSheet.click();
    await expect
      .poll(async () => (await demoMenuItem("שניצל"))?.available)
      .toBe(true);
    await expect(sheet).toBeVisible();
    await expect(typed).toHaveValue("64");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    expect((await demoMenuItem("שניצל"))?.priceAgorot).toBe(6200);

    // Noa, in the kitchen: the kitchen's items are hers to mark, nothing else is.
    await signIn(noa, NOA);
    await noa.goto("/orders/menu");
    await expect(title(noa, o.menu.title)).toBeVisible();
    await expect(
      shown(noa, rt("app.orders.menu.readOnly.department")),
    ).toBeVisible();
    await expect(
      noa.getByRole("button", { name: rt("app.orders.menu.add") }),
    ).toHaveCount(0);
    await showCategory(noa, "עיקריות", project);
    await expect(soldOut(noa, "פסטה")).toHaveAttribute("aria-checked", "true");
    await soldOut(noa, "פסטה").click();
    await expect
      .poll(async () => (await demoMenuItem("פסטה"))?.available)
      .toBe(true);
    await showCategory(noa, "שתייה", project);
    await expect(soldOut(noa, "לימונדה")).toHaveCount(0);
    await expectCleanPage(noa);
  } finally {
    await noa.context().close();
  }

  // The accountant is off the staff: no menu for her.
  const galit = await secondPage(browser, testInfo);
  try {
    await enterAs(galit, "accountant");
    await galit.goto("/orders/menu");
    await expect(notFound(galit)).toBeVisible();
  } finally {
    await galit.context().close();
  }
});

test("a save someone else's overtook shows the item as it is now", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const ori = await secondPage(browser, testInfo);
  try {
    await signIn(page, MANAGER);
    await page.goto("/orders/menu");
    await showCategory(page, "עיקריות", project);
    await button(page, "שניצל").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    await signIn(ori, OWNER);
    await ori.goto("/orders/menu");
    await showCategory(ori, "עיקריות", project);
    await button(ori, "שניצל").click();
    await ori
      .getByRole("dialog")
      .getByLabel(o.menu.sheet.price, { exact: true })
      .fill("66");
    await ori
      .getByRole("dialog")
      .getByRole("button", { name: o.menu.sheet.save })
      .click();
    await expect
      .poll(async () => (await demoMenuItem("שניצל"))?.priceAgorot)
      .toBe(6600);

    await sheet.getByLabel(o.menu.sheet.price, { exact: true }).fill("70");
    await sheet.getByRole("button", { name: o.menu.sheet.save }).click();
    await expect(sheet.getByRole("alert")).toHaveText(
      rt("app.orders.menu.failed.changed"),
    );
    await expect(
      sheet.getByLabel(o.menu.sheet.price, { exact: true }),
    ).toHaveValue("66");
    expect((await demoMenuItem("שניצל"))?.priceAgorot).toBe(6600);
    await sheet.getByLabel(o.menu.sheet.price, { exact: true }).fill("70");
    await sheet.getByRole("button", { name: o.menu.sheet.save }).click();
    await expect
      .poll(async () => (await demoMenuItem("שניצל"))?.priceAgorot)
      .toBe(7000);
  } finally {
    await ori.context().close();
  }
});

test("a manager edits the categories and the places, each removal with its undo", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const since = new Date(Date.now() - 1000);
  const c = o.categories;
  await signIn(page, MANAGER);
  await page.goto("/orders/menu");
  await link(page, o.menu.categoriesRow).click();
  await expect(page).toHaveURL(/\/orders\/menu\/categories$/);
  await expect(title(page, c.title)).toBeVisible();
  await expectCleanPage(page);

  await page.getByLabel(c.newName).fill("בדיקות");
  await page.getByRole("button", { name: c.add }).click();
  await expect.poll(demoMenuCategories).toContainEqual({
    name: "בדיקות",
    department: "kitchen",
  });
  await page
    .getByRole("button", {
      name: heT("app.orders.categories.upFor", { name: "בדיקות" }),
    })
    .click();
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .toEqual(["ראשונות", "עיקריות", "קינוחים", "בדיקות", "שתייה"]);
  const field = page.getByLabel(
    heT("app.orders.categories.nameOf", { name: "בדיקות" }),
  );
  await field.fill("בדיקות שבוע");
  await field.press("Enter");
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .toContain("בדיקות שבוע");
  await page
    .getByRole("button", {
      name: heT("app.orders.categories.remove", { name: "בדיקות שבוע" }),
    })
    .click();
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .not.toContain("בדיקות שבוע");
  const undo = page
    .getByRole("status")
    .filter({
      hasText: rt("app.orders.categories.removed", {
        name: "בדיקות שבוע",
        count: 0,
      }),
    })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await undo.click();
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .toContain("בדיקות שבוע");

  // An item goes in it from the menu's sheet.
  await page.goto("/orders/menu");
  await page
    .getByRole("button", { name: rt("app.orders.menu.add") })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(rt("app.orders.menu.sheet.name")).fill("מנת בדיקה");
  await sheet.getByLabel(o.menu.sheet.price, { exact: true }).fill("10");
  await choose(page, o.menu.sheet.category, "בדיקות שבוע");
  await sheet.getByRole("button", { name: o.menu.sheet.add }).click();
  await expect(
    toast(page, rt("app.orders.menu.toast.added", { name: "מנת בדיקה" })),
  ).toBeVisible();
  await expect
    .poll(() => demoMenuItem("מנת בדיקה"))
    .toMatchObject({
      category: "בדיקות שבוע",
      priceAgorot: 1000,
    });

  // The tables: one renamed, one added and removed with its undo.
  await page.goto("/orders/menu/places");
  await expect(title(page, rt("app.orders.places.title"))).toBeVisible();
  const twelve = page.getByLabel(
    rt("app.orders.places.nameOf", { name: "12" }),
  );
  await twelve.fill("מרפסת 1");
  await twelve.press("Enter");
  await expect.poll(demoOrderPlaces).toContain("מרפסת 1");
  await page.getByLabel(rt("app.orders.places.newName")).fill("בר 1");
  await page.getByRole("button", { name: rt("app.orders.places.add") }).click();
  await expect.poll(demoOrderPlaces).toContain("בר 1");
  await page
    .getByRole("button", {
      name: heT("app.orders.places.remove", { name: "בר 1" }),
    })
    .click();
  await expect.poll(demoOrderPlaces).not.toContain("בר 1");
  await page
    .getByRole("status")
    .filter({ hasText: rt("app.orders.places.removed", { name: "בר 1" }) })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect.poll(demoOrderPlaces).toContain("בר 1");
  await expectCleanPage(page);

  const logged = (await demoMenuLog(since)).map((row) => row.action);
  expect(logged).toContain("menu.categories");
  expect(logged).toContain("menu.places");
  expect(logged).toContain("menu.item.save");
});

test("a department that prepares items says so before it goes, and its undo brings them back", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const d = he.app.manage.departments;
  await signIn(page, MANAGER);
  await page.goto("/manage/departments");
  await page.getByLabel(d.newName).fill(PREPARING);
  await page.getByRole("button", { name: d.add }).click();
  await expect(
    page.getByLabel(heT("app.manage.departments.nameOf", { name: PREPARING })),
  ).toHaveValue(PREPARING);
  // The field shows before the save lands: the categories' page reads the
  // departments from the database.
  await expect.poll(demoDepartmentNames).toContain(PREPARING);

  // A category of its own, with one item, which names it as its own too.
  await page.goto("/orders/menu/categories");
  await page.getByLabel(o.categories.newName).fill("קטגוריית הכנה");
  await choose(page, o.categories.newDepartment, PREPARING);
  await page.getByRole("button", { name: o.categories.add }).click();
  await expect
    .poll(demoMenuCategories)
    .toContainEqual(expect.objectContaining({ name: "קטגוריית הכנה" }));
  await page.goto("/orders/menu");
  await page
    .getByRole("button", { name: rt("app.orders.menu.add") })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(rt("app.orders.menu.sheet.name")).fill("מנת הכנה");
  await sheet.getByLabel(o.menu.sheet.price, { exact: true }).fill("20");
  await choose(page, o.menu.sheet.category, "קטגוריית הכנה");
  await choose(page, o.menu.sheet.department, PREPARING);
  await sheet.getByRole("button", { name: o.menu.sheet.add }).click();
  await expect
    .poll(async () => (await demoMenuItem("מנת הכנה"))?.department)
    .toBeTruthy();

  await page.goto("/manage/departments");
  await expect(
    shown(page, rt("app.manage.departments.menuItems", { count: 1 })),
  ).toBeVisible();
  await expect(shown(page, d.hintMenu)).toBeVisible();
  const removeIt = page.getByRole("button", {
    name: heT("app.manage.departments.remove", { name: PREPARING }),
  });
  await removeIt.click();
  const undo = page
    .getByRole("status")
    .filter({
      hasText: rt("app.manage.departments.removedMenu", {
        name: PREPARING,
        count: 1,
      }),
    })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  // Each save in turn: the removal lands before the undo is pressed, so the
  // poll after the undo can only pass on the undo's own save.
  await expect.poll(demoDepartmentNames).not.toContain(PREPARING);
  await undo.click();
  await expect(
    shown(page, rt("app.manage.departments.menuItems", { count: 1 })),
  ).toBeVisible();
  await expect.poll(demoDepartmentNames).toContain(PREPARING);
  await expectCleanPage(page);

  // Gone for good: its item reaches no one, and the category still saves.
  await removeIt.click();
  await expect(
    page.getByRole("status").filter({
      hasText: rt("app.manage.departments.removedMenu", {
        name: PREPARING,
        count: 1,
      }),
    }),
  ).toBeVisible();
  // The undo line shows before the save lands: the menu reads where its
  // items go from the database.
  await expect.poll(demoDepartmentNames).not.toContain(PREPARING);
  await page.goto("/orders/menu");
  await expect(
    shown(
      page,
      new RegExp(literal(rt("app.orders.menu.status.noRoute", { count: 1 }))),
    ),
  ).toBeVisible();
  await page.goto("/orders/menu/categories");
  const field = page.getByLabel(
    heT("app.orders.categories.nameOf", { name: "קטגוריית הכנה" }),
  );
  await field.fill("קטגוריית הכנה ישנה");
  await field.press("Enter");
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .toContain("קטגוריית הכנה ישנה");

  // And its item, sent whole with the department it still names, takes a
  // new price, though nobody chose a department there.
  await page.goto("/orders/menu");
  await showCategory(page, "קטגוריית הכנה ישנה", project);
  if (project === "desktop") {
    const price = main(page).getByLabel(
      rt("app.orders.menu.priceFor", { name: "מנת הכנה" }),
    );
    await price.fill("21");
    await price.press("Enter");
  } else {
    await button(page, "מנת הכנה").click();
    const again = page.getByRole("dialog");
    await again.getByLabel(o.menu.sheet.price, { exact: true }).fill("21");
    await again.getByRole("button", { name: o.menu.sheet.save }).click();
  }
  await expect
    .poll(async () => (await demoMenuItem("מנת הכנה"))?.priceAgorot)
    .toBe(2100);
});

test("departments open for taking orders alone, and close with it", async ({
  page,
}) => {
  const d = he.app.manage.departments;
  await setDemoModule("lists", false);
  await signIn(page, MANAGER);
  await page.goto("/manage");
  await expect(link(page, d.title)).toBeVisible();
  await page.goto("/manage/departments");
  await expect(title(page, d.title)).toBeVisible();
  await expect(shown(page, d.subtitleMenu)).toBeVisible();
  await expect(shown(page, d.hintMenu)).toBeVisible();
  await setDemoModule("order_taking", false);
  await page.goto("/manage/departments");
  await expect(notFound(page)).toBeVisible();
});

test("the team's switch opens and closes the menu for the business", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const shiran = await secondPage(browser, testInfo);
  const on = heT("admin.settings.on", { module: he.modules.order_taking.name });
  try {
    await signIn(page, ADMIN, /\/admin$/);
    await page.goto("/admin/businesses/demo-restaurant/settings");
    const toggle = page.getByRole("switch", { name: on });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    // The switch moves at once; the save follows.
    await expect.poll(() => demoModuleEnabled("order_taking")).toBe(false);

    await signIn(shiran, MANAGER);
    await shiran.goto("/manage");
    await expect(title(shiran, he.app.manage.title)).toBeVisible();
    await expect(
      main(shiran).getByRole("link", {
        name: new RegExp(`^${literal(o.menu.title)}`),
      }),
    ).toHaveCount(0);
    await shiran.goto("/orders/menu");
    await expect(notFound(shiran)).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: he.admin.settings.menu.title,
      }),
    ).toHaveCount(0);
    await page.getByRole("switch", { name: on }).click();
    await expect(page.getByRole("switch", { name: on })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Saved before the reload, which would otherwise race it.
    await expect.poll(() => demoModuleEnabled("order_taking")).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: he.admin.settings.menu.title,
      }),
    ).toBeVisible();
    await shiran.goto("/manage");
    await expect(link(shiran, o.menu.title)).toBeVisible();
    await shiran.goto("/orders/menu");
    await expect(title(shiran, o.menu.title)).toBeVisible();
  } finally {
    await shiran.context().close();
  }
});

test("the owner takes the menu from managers on the roles screen, and gives it back", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const manager = he.app.team.roles.manager;
  const edit = (on: Page) =>
    main(on)
      .getByRole("switch", {
        name: rt("app.manage.roles.editLabel", {
          area: "מצב מלצרות",
          role: manager,
        }),
      })
      .filter({ visible: true });
  const shiran = await secondPage(browser, testInfo);
  try {
    await signIn(page, OWNER);
    await page.goto("/manage/roles");
    await expect(title(page, he.app.manage.roles.title)).toBeVisible();
    if (project !== "desktop") {
      await button(page, manager).click();
      if (project === "phone") await expect(title(page, manager)).toBeVisible();
    }
    await expect(edit(page)).toHaveAttribute("aria-checked", "true");
    await edit(page).click();
    await expect(edit(page)).toHaveAttribute("aria-checked", "false");
    // The switch moves at once; Shiran's screens read the saved rule.
    await expect.poll(() => demoMenuRule("manager")).toBe(false);

    await signIn(shiran, MANAGER);
    await shiran.goto("/orders/menu");
    await expect(
      shown(shiran, rt("app.orders.menu.readOnly.department")),
    ).toBeVisible();
    await expect(
      shiran.getByRole("button", { name: rt("app.orders.menu.add") }),
    ).toHaveCount(0);
    await shiran.goto("/orders/menu/categories");
    await expect(notFound(shiran)).toBeVisible();

    await edit(page).click();
    await expect(edit(page)).toHaveAttribute("aria-checked", "true");
    // Back on the managers' default: no rule of the business's own.
    await expect.poll(() => demoMenuRule("manager")).toBeNull();
    await shiran.goto("/orders/menu");
    await expect(
      shiran
        .getByRole("button", { name: rt("app.orders.menu.add") })
        .filter({ visible: true }),
    ).toBeVisible();
  } finally {
    await shiran.context().close();
  }
});
