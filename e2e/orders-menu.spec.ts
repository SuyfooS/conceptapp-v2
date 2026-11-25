import AxeBuilder from "@axe-core/playwright";
import { createTranslator } from "next-intl";
import he from "../messages/he.json" with { type: "json" };
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import {
  announcer,
  heardSoFar,
  noteIfSaid,
  pastDrawing,
  pastSameWords,
  saidSince,
  wasSaid,
} from "./announcer";
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
import { expect, type Page, type Request, test } from "./test";

// Taking orders' menu on screen (waiter mode P2, issue #191), on the demo
// restaurant, where the local seed has the module on: the team copies a
// menu in from the console; a manager changes a price, marks sold out and
// edits the categories and the places; the kitchen marks sold out what it
// prepares and nothing else; a save someone else overtook shows the item as
// it is now; a department that prepares items says so before and after it
// goes; departments open for taking orders alone; the module's switch and
// the roles' switch open and close it all. The restaurant reads its
// template's words ("מנה", "שולחן", "מצב מלצרות"), read here from the
// database as it does; the console reads the app's own. P6: a manager
// gives an item a group of choices, and taking an order asks for it. Each
// test puts the menu back as the seed has it.
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
  // The add's answer on screen, which gives the row its id, before it moves:
  // the database has the row a moment before.
  await expect(toast(page, c.saved)).toBeVisible();
  await expect.poll(demoMenuCategories).toContainEqual({
    name: "בדיקות",
    department: "kitchen",
  });
  // Moved up, its arrow keeps the focus and where it went is said. (Moved
  // up, the row stays in the page and its arrow never lost the focus: the
  // move down below is the one that takes it back.)
  const up = page.getByRole("button", {
    name: heT("app.orders.categories.upFor", { name: "בדיקות" }),
  });
  const down = page.getByRole("button", {
    name: heT("app.orders.categories.downFor", { name: "בדיקות" }),
  });
  const polite = announcer(page, "polite");
  await heardSoFar(polite);
  await up.click();
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .toEqual(["ראשונות", "עיקריות", "קינוחים", "בדיקות", "שתייה"]);
  await expect(up).toBeFocused();
  await expect(
    saidSince(
      polite,
      heT("app.orders.categories.movedTo", {
        name: "בדיקות",
        place: 4,
        count: 5,
      }),
    ),
  ).toHaveCount(1);
  // Back down to the end: put back in the page after the row it passed, it
  // lost the focus, and its "הזזה למטה" can't be pressed again, so "הזזה
  // למעלה" has it, through the save's answer and the page drawn again.
  await heardSoFar(polite);
  await down.click();
  await expect
    .poll(async () => (await demoMenuCategories()).map((row) => row.name))
    .toEqual(["ראשונות", "עיקריות", "קינוחים", "שתייה", "בדיקות"]);
  await expect(down).toBeDisabled();
  await expect(up).toBeFocused();
  await expect(
    saidSince(
      polite,
      heT("app.orders.categories.movedTo", {
        name: "בדיקות",
        place: 5,
        count: 5,
      }),
    ),
  ).toHaveCount(1);
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

type SeenLine = { seenLine?: Element };

// A table's "הזזה למטה" pressed again before its saves answer: the actions
// go to the server one at a time, and each answer draws the server's list.
// The first answer, with the second save still on its way, leaves the
// screen as it is, and the press after it counts from there: three
// presses, three rows, and where the table ended is said once, after the
// last answer. Offline, a move is refused: the table goes back, and where
// it is back is said after the line saying why; refused again, the line is
// drawn anew, so it is said again.
test("a table moved faster than its saves keeps every press, and a refused move says where it is back", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const p = "app.orders.places" as const;
  const placesPath = "/orders/menu/places";
  const nameOf = rt(`${p}.nameOf`, { name: "" }).trim();
  const rowNames = () =>
    page
      .getByRole("textbox", { name: new RegExp(`^${literal(nameOf)}`) })
      .evaluateAll((fields) =>
        fields.map((field) => (field as HTMLInputElement).value),
      );
  /** The twelve tables, table 4 at `row`. */
  const fourAt = (row: number) => {
    const others = Array.from({ length: 12 }, (_, i) => `${i + 1}`).filter(
      (name) => name !== "4",
    );
    others.splice(row - 1, 0, "4");
    return others;
  };
  const isSave = (request: Request) =>
    request.method() === "POST" &&
    request.headers()["next-action"] !== undefined;
  const down4 = page.getByRole("button", {
    name: rt(`${p}.downFor`, { name: "4" }),
    exact: true,
  });
  const polite = announcer(page, "polite");
  const movedTo = (place: number) =>
    rt(`${p}.movedTo`, { name: "4", place, count: 12 });

  await signIn(page, MANAGER);
  await page.goto(placesPath);
  await expect(title(page, rt(`${p}.title`))).toBeVisible();
  await expect.poll(rowNames).toEqual(fourAt(4));
  // Each save held back a moment and a half, or refused (offline).
  let saves: "held" | "refused" = "held";
  await page.route(
    (url) => url.pathname === placesPath,
    async (route) => {
      if (!isSave(route.request())) {
        await route.fallback();
        return;
      }
      if (saves === "refused") {
        await route.abort();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    },
  );

  await noteIfSaid(page, movedTo(5));
  await noteIfSaid(page, movedTo(6));
  await down4.focus();
  await heardSoFar(polite);
  const firstAnswer = page.waitForResponse((response) =>
    isSave(response.request()),
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect.poll(rowNames).toEqual(fourAt(6));
  await expect(down4).toBeFocused();
  // The first save answered, the second still held: both moves stay.
  await firstAnswer;
  await pastDrawing(page);
  expect(await rowNames()).toEqual(fourAt(6));
  await page.keyboard.press("Enter");
  await expect.poll(rowNames).toEqual(fourAt(7));
  await expect.poll(demoOrderPlaces, { timeout: 15_000 }).toEqual(fourAt(7));
  await expect(saidSince(polite, movedTo(7))).toHaveCount(1);
  expect(await wasSaid(page, movedTo(5))).toBe(false);
  expect(await wasSaid(page, movedTo(6))).toBe(false);
  expect(await rowNames()).toEqual(fourAt(7));
  await expect(down4).toBeFocused();

  // Refused: back in row 7, said after why, and never that it went to 8.
  saves = "refused";
  const failed = page
    .getByRole("alert")
    .filter({ hasText: rt("app.orders.menu.failed.failed") });
  const back = rt(`${p}.movedBack`, { name: "4", place: 7, count: 12 });
  await noteIfSaid(page, movedTo(8));
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect(failed).toBeVisible();
  await expect.poll(rowNames).toEqual(fourAt(7));
  await expect(down4).toBeFocused();
  await expect(saidSince(polite, back)).toHaveCount(1);
  expect(await wasSaid(page, movedTo(8))).toBe(false);

  // Refused again: a line of its own, so the same words are said again.
  await failed.evaluate((line) => {
    (window as unknown as SeenLine).seenLine = line;
  });
  await pastSameWords(page);
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect
    .poll(() =>
      failed.evaluate(
        (line) => line !== (window as unknown as SeenLine).seenLine,
      ),
    )
    .toBe(true);
  await expect(saidSince(polite, back)).toHaveCount(1);
  await expect.poll(rowNames).toEqual(fourAt(7));
  await expect(down4).toBeFocused();
  expect(await demoOrderPlaces()).toEqual(fourAt(7));
});

// Two changes inside one round trip, only one of them refused. The actions
// go to the server one at a time, the latest change's answer says what the
// list is, and what each change says comes from the saves that have it.
// Table 4 moved down, which saves, and table 7 renamed before its answer,
// which is refused: the server's list, shown again, has the move, so where
// table 4 is now is said, never that it is back. Table 11 removed, refused,
// and table 12 removed before that answer, which saves a list without both:
// 12's undo stays, with the focus. "בר 1" added, refused, and table 1 moved
// before that answer, which saves a list with it: the name stays out of the
// field.
test("a change refused while a later one was on its way leaves the screen to the later one", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const p = "app.orders.places" as const;
  const placesPath = "/orders/menu/places";
  const nameOf = rt(`${p}.nameOf`, { name: "" }).trim();
  const rowNames = () =>
    page
      .getByRole("textbox", { name: new RegExp(`^${literal(nameOf)}`) })
      .evaluateAll((fields) =>
        fields.map((field) => (field as HTMLInputElement).value),
      );
  const isSave = (request: Request) =>
    request.method() === "POST" &&
    request.headers()["next-action"] !== undefined;
  const polite = announcer(page, "polite");

  await signIn(page, MANAGER);
  await page.goto(placesPath);
  await expect(title(page, rt(`${p}.title`))).toBeVisible();
  await expect
    .poll(rowNames)
    .toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}`));
  // What the next saves do, in turn: each held back a moment and a half or
  // not, then let through or refused (offline); past them, let through.
  const plan: { held: boolean; refused: boolean }[] = [];
  let refusals = 0;
  await page.route(
    (url) => url.pathname === placesPath,
    async (route) => {
      if (!isSave(route.request())) {
        await route.fallback();
        return;
      }
      const step = plan.shift();
      if (step?.held) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (step?.refused) {
        await route.abort();
        refusals += 1;
        return;
      }
      await route.fallback();
    },
  );

  // The move saves, the rename sent before its answer is refused.
  const moved = ["1", "2", "3", "5", "4", "6", "7", "8", "9", "10", "11", "12"];
  const now = rt(`${p}.movedTo`, { name: "4", place: 5, count: 12 });
  const back = rt(`${p}.movedBack`, { name: "4", place: 5, count: 12 });
  plan.push({ held: true, refused: false }, { held: false, refused: true });
  await noteIfSaid(page, back);
  await page
    .getByRole("button", {
      name: rt(`${p}.downFor`, { name: "4" }),
      exact: true,
    })
    .focus();
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect.poll(rowNames).toEqual(moved);
  const seven = page.getByLabel(rt(`${p}.nameOf`, { name: "7" }), {
    exact: true,
  });
  await seven.fill("מרפסת");
  await seven.press("Enter");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: rt("app.orders.menu.failed.failed") }),
  ).toBeVisible();
  // Where the move put it: Next draws the move's answer only once the
  // rename's has come too, so the refusal shows the list the move saved,
  // not the one drawn before both (CI's third run: "4 עכשיו בשורה 4").
  await expect(saidSince(polite, now)).toHaveCount(1);
  expect(await wasSaid(page, back)).toBe(false);
  await expect.poll(rowNames).toEqual(moved);
  expect(await demoOrderPlaces()).toEqual(moved);

  // The first removal refused, the second, sent before its answer, saved.
  const ten = moved.slice(0, 10);
  plan.push({ held: true, refused: true });
  const removalsRefused = refusals;
  await page
    .getByRole("button", {
      name: rt(`${p}.remove`, { name: "11" }),
      exact: true,
    })
    .click();
  await page
    .getByRole("button", {
      name: rt(`${p}.remove`, { name: "12" }),
      exact: true,
    })
    .click();
  await expect.poll(() => refusals).toBe(removalsRefused + 1);
  await expect.poll(demoOrderPlaces).toEqual(ten);
  await pastDrawing(page);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: rt(`${p}.removed`, { name: "12" }) })
      .getByRole("button", { name: he.ui.undoRow.undo }),
  ).toBeFocused();
  await expect.poll(rowNames).toEqual(ten);

  // The add refused, the move sent before its answer saved, with it.
  const withBar = ["2", "1", ...ten.slice(2), "בר 1"];
  plan.push({ held: true, refused: true });
  const addRefused = refusals;
  const newName = page.getByLabel(rt(`${p}.newName`));
  await newName.fill("בר 1");
  await page.getByRole("button", { name: rt(`${p}.add`) }).click();
  await expect(newName).toHaveValue("");
  await page
    .getByRole("button", {
      name: rt(`${p}.downFor`, { name: "1" }),
      exact: true,
    })
    .click();
  await expect.poll(() => refusals).toBe(addRefused + 1);
  await expect.poll(demoOrderPlaces).toEqual(withBar);
  await pastDrawing(page);
  await expect(newName).toHaveValue("");
  await expect.poll(rowNames).toEqual(withBar);
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

test("a manager gives an item a group of choices, and taking an order asks for it", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  const project = testInfo.project.name;
  const since = new Date(Date.now() - 1000);
  await signIn(page, MANAGER);
  await page.goto("/orders/menu");
  await showCategory(page, "עיקריות", project);
  await button(page, "פסטה").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const before = await demoMenuItem("פסטה");

  // A group with no name: said under it, and nothing is saved.
  await sheet.getByRole("button", { name: o.menu.groups.add }).click();
  await expect(
    sheet.getByLabel(o.menu.group.name, { exact: true }),
  ).toBeFocused();
  await sheet.getByRole("button", { name: o.menu.sheet.save }).click();
  await expect(sheet.getByText(o.menu.group.nameMissing)).toBeVisible();
  await expect(
    sheet.getByLabel(o.menu.group.name, { exact: true }),
  ).toBeFocused();
  expect((await demoMenuItem("פסטה"))?.version).toBe(before?.version);

  // "רוטב", one of two, the cream adding 4.00.
  await sheet.getByLabel(o.menu.group.name, { exact: true }).fill("רוטב");
  await sheet
    .getByLabel(rt("app.orders.menu.group.option", { n: 1 }), { exact: true })
    .fill("עגבניות");
  await sheet.getByRole("button", { name: o.menu.group.addOption }).click();
  await sheet
    .getByLabel(rt("app.orders.menu.group.option", { n: 2 }), { exact: true })
    .fill("שמנת");
  await sheet.getByLabel(o.menu.group.price, { exact: true }).nth(1).fill("4");
  await expect(
    sheet.getByRole("switch", { name: o.menu.group.required }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByText(o.menu.sheet.rule.one)).toBeVisible();
  await expectCleanPage(page);

  // A save the network drops is said at the form's top, above the choices
  // the save at the sheet's end was pressed under: its line takes the focus.
  let dropped = 0;
  await page.route(
    (url) => url.pathname === "/orders/menu",
    async (route) => {
      if (route.request().method() !== "POST" || dropped > 0) {
        await route.fallback();
        return;
      }
      dropped += 1;
      await route.abort();
    },
  );
  await sheet.getByRole("button", { name: o.menu.sheet.save }).click();
  const refused = sheet.getByRole("alert");
  await expect(refused).toHaveText(rt("app.orders.menu.failed.failed"));
  await expect(refused).toBeFocused();
  await expect(refused).toBeInViewport();
  expect(dropped).toBe(1);
  expect((await demoMenuItem("פסטה"))?.version).toBe(before?.version);

  await sheet.getByRole("button", { name: o.menu.sheet.save }).click();
  await expect(
    toast(page, rt("app.orders.menu.toast.saved", { name: "פסטה" })),
  ).toBeVisible();
  await expect
    .poll(async () => (await demoMenuItem("פסטה"))?.groups)
    .toEqual([
      {
        id: expect.stringMatching(/^g[0-9a-f]{8}$/),
        name: "רוטב",
        min: 1,
        max: 1,
        options: [
          {
            id: expect.stringMatching(/^o[0-9a-f]{8}$/),
            name: "עגבניות",
            priceAgorot: 0,
          },
          {
            id: expect.stringMatching(/^o[0-9a-f]{8}$/),
            name: "שמנת",
            priceAgorot: 400,
          },
        ],
      },
    ]);
  const logged = await demoMenuLog(since);
  expect(logged.map((row) => row.action)).toContain("menu.item.save");

  // The activity log names what changed: the choices.
  await page.goto("/manage/activity");
  await expect(
    shown(
      page,
      rt("app.manage.activity.actions.menu.itemSave", { name: "פסטה" }),
    ),
  ).toBeVisible();
  await expect(
    shown(page, rt("app.manage.activity.actions.menu.fields.options")),
  ).toBeVisible();

  // Taking an order, the pasta opens its choices now, and the cream adds
  // 4.00 to it.
  await page.goto("/orders");
  await main(page)
    .getByRole("link", {
      name: new RegExp(`^${literal(rt("app.orders.place.kind"))}\\s*6(\\D|$)`),
    })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/orders\/place\//);
  if (project === "phone") {
    await button(page, rt("app.orders.order.view.add")).click();
  }
  // A tablet and a desktop show one category at a time: the search finds it.
  await page
    .getByLabel(rt("app.orders.picker.search"))
    .filter({ visible: true })
    .first()
    .fill("פסטה");
  await button(page, "פסטה").click();
  const choices = page.getByRole("dialog", { name: "פסטה" });
  await expect(choices).toBeVisible();
  await expect(choices.getByText("רוטב", { exact: true })).toBeVisible();
  await expect(
    choices.getByText(rt("app.orders.choice.rule.one")),
  ).toBeVisible();
  await choices.getByRole("radio", { name: /^שמנת/ }).check();
  await expect(choices).toContainText("62.00");
  await choices
    .getByRole("button", {
      name: rt("app.orders.choice.add", { count: 1 }),
      exact: true,
    })
    .click();
  await expect(choices).toHaveCount(0);
  if (project === "phone") {
    await button(page, rt("app.orders.order.view.order")).click();
  }
  await expect(shown(page, "שמנת")).toBeVisible();
  await expect(shown(page, "62.00")).toBeVisible();
});
