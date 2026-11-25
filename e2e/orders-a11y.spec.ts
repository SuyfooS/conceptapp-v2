import { createTranslator } from "next-intl";
import { SEARCH_SAID_AFTER_MS } from "../app/(app)/orders/search-said";
import { restaurantWording } from "../app/design/order-taking/data";
import he from "../messages/he.json" with { type: "json" };
import { type MessageTree, mergeWording } from "../packages/domain/wording";
import {
  announcer,
  heardSoFar,
  noteIfSaid,
  pastDrawing,
  saidSince,
  wasSaid,
} from "./announcer";
import type { heT } from "./t";
import { expect, type Page, test } from "./test";

// Accessibility, part 9, on waiter mode's twins (/design/order-taking): the
// places and the categories moved with their arrows, a draft line's allergy
// saved without words, and the menu's search. No data, no sign-in, nothing
// stored: the twin's store lives in the page. The real categories' move and
// the real allergy are in orders-menu.spec.ts and orders.spec.ts.

/** The twin's restaurant's words: the app's, with its template's sentences. */
const rt = createTranslator({
  locale: "he",
  messages: mergeWording(he as MessageTree, restaurantWording) as typeof he,
}) as typeof heT;

const asIs = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A row's arrow, by its whole name ("הזזה למטה: 1", never "...: 12"). */
const arrow = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

/** The names of the rows of a list whose fields are named `prefix` + the name, in order. */
const rowNames = (page: Page, prefix: string) =>
  page
    .getByRole("textbox", { name: new RegExp(`^${asIs(prefix)}`) })
    .evaluateAll((fields) =>
      fields.map((field) => (field as HTMLInputElement).value),
    );

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// A table moved down is put back in the page after the one it passed, which
// took the focus from its arrow: the same arrow has it again once the move
// is drawn, and where it went is said after it. Moved up to the top, its
// "הזזה למעלה" can't be pressed again, so "הזזה למטה" has the focus. A
// mouse's press is the same. Table 1 moved down short of the end is the
// case CI's first run caught, never said: React gives the arrow it moved
// its focus back itself, in the middle of drawing the move, which read as a
// focus put elsewhere, so the move was forgotten, and only a move still
// known was said. It is said from the save's answer now, known or not, so
// this test holds with the arrows' refs new on each drawing too; that the
// move stays known through React's focus (`arrowRefs`) is the tab bar's
// test below, on a phone.
test("the places twin keeps the focus on a moved table's arrow and says where it went", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  const p = "app.orders.places" as const;
  const nameOf = rt(`${p}.nameOf`, { name: "" }).trim();
  await open(page, "/design/order-taking/menu/places");
  const down1 = arrow(page, rt(`${p}.downFor`, { name: "1" }));
  const up1 = arrow(page, rt(`${p}.upFor`, { name: "1" }));

  await down1.focus();
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => rowNames(page, nameOf))
    .toEqual(["2", "1", ...Array.from({ length: 10 }, (_, i) => `${i + 3}`)]);
  await expect(down1).toBeFocused();
  await expect(
    saidSince(polite, rt(`${p}.movedTo`, { name: "1", place: 2, count: 12 })),
  ).toHaveCount(1);

  await up1.focus();
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await rowNames(page, nameOf))[0]).toBe("1");
  await expect(up1).toBeDisabled();
  await expect(down1).toBeFocused();
  await expect(
    saidSince(polite, rt(`${p}.movedTo`, { name: "1", place: 1, count: 12 })),
  ).toHaveCount(1);

  // With a mouse: table 3 down, the focus kept on its arrow.
  const down3 = arrow(page, rt(`${p}.downFor`, { name: "3" }));
  await heardSoFar(polite);
  await down3.click();
  await expect.poll(async () => (await rowNames(page, nameOf))[3]).toBe("3");
  await expect(down3).toBeFocused();
  await expect(
    saidSince(polite, rt(`${p}.movedTo`, { name: "3", place: 4, count: 12 })),
  ).toHaveCount(1);
});

// Enter held down on a table's "הזזה למטה" as it reaches the end: the first
// press moves it, its "הזזה למעלה" takes the focus, and the key repeating
// presses nothing there, so the table stays at the end instead of running
// back up.
test("the places twin moves a table once for Enter held down on its arrow at the end", async ({
  page,
}) => {
  const p = "app.orders.places" as const;
  const nameOf = rt(`${p}.nameOf`, { name: "" }).trim();
  await open(page, "/design/order-taking/menu/places");
  const down11 = arrow(page, rt(`${p}.downFor`, { name: "11" }));
  const up11 = arrow(page, rt(`${p}.upFor`, { name: "11" }));
  const atEnd = [
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}`),
    "12",
    "11",
  ];

  await down11.focus();
  await page.keyboard.down("Enter");
  await expect.poll(() => rowNames(page, nameOf)).toEqual(atEnd);
  await expect(down11).toBeDisabled();
  await expect(up11).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await page.waitForTimeout(500);
  expect(await rowNames(page, nameOf)).toEqual(atEnd);
  await expect(up11).toBeFocused();
});

// On a phone the tab bar floats over the page's bottom. A table moved down
// from just above it would take its arrow, focused again, under the bar,
// in the viewport, so the focus alone wouldn't move the page: the arrow is
// brought up clear of the bar (its scroll margin, the bar's band). A table
// that stays short of the end is the one to move: its "הזזה למטה" keeps
// the focus because React gives it back itself as it draws the move, and
// puts the page back where it was, so nothing the screen does with the
// focus brings it up; only the press's own drawing does, and only while
// the move is still known as React gives the focus back: with the arrows'
// refs new on each drawing that focus read as one put elsewhere, and the
// arrow stayed under the bar (`arrowRefs`). Of the browser tests, this is
// the one that fails without them. (Table 11, moved to the end, has its
// "הזזה למעלה" focused by the screen, which always brought it into view.)
test("the places twin keeps a table's arrow clear of the tab bar as it moves down", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "a phone's page is long enough to put a row just above the bar",
  );
  const p = "app.orders.places" as const;
  await open(page, "/design/order-taking/menu/places");
  const downOf = (name: string) => arrow(page, rt(`${p}.downFor`, { name }));
  const band = await downOf("1").evaluate((button) =>
    Number.parseFloat(getComputedStyle(button).scrollMarginBottom),
  );
  expect(band).toBeGreaterThan(0);
  // A table's arrow just above the band, the page scrolled to put it there,
  // none that would reach the end.
  let moving: string | null = null;
  for (const name of ["10", "9", "8", "7", "6", "5"]) {
    const placed = await downOf(name).evaluate((button, band) => {
      const target = window.innerHeight - band - 4;
      const y = window.scrollY + button.getBoundingClientRect().bottom - target;
      const most = document.documentElement.scrollHeight - window.innerHeight;
      if (y < 0 || y > most) return false;
      window.scrollTo(0, y);
      return Math.abs(button.getBoundingClientRect().bottom - target) < 1;
    }, band);
    if (placed) {
      moving = name;
      break;
    }
  }
  expect(moving).not.toBeNull();
  const down = downOf(moving ?? "");
  await down.focus();
  await page.keyboard.press("Enter");
  // Its "הזזה למטה", one row down, clear of the bar.
  await expect(down).toBeFocused();
  await expect
    .poll(() =>
      down.evaluate(
        (button, band) =>
          window.innerHeight - button.getBoundingClientRect().bottom >=
          band - 1,
        band,
      ),
    )
    .toBe(true);
});

// The last place removed: the list goes, and the quick start takes its
// place, with the removal's "ביטול" above it, which has the focus the
// removed place's button had. Pressed, the place is back.
test("the places twin's last place removed keeps its undo above the quick start, focused", async ({
  page,
}) => {
  const p = "app.orders.places" as const;
  const nameOf = rt(`${p}.nameOf`, { name: "" }).trim();
  await open(page, "/design/order-taking/menu/places?state=noPlaces");
  await page.getByLabel(rt(`${p}.quick.count`)).fill("1");
  await page
    .getByRole("button", { name: rt(`${p}.quick.action`, { count: 1 }) })
    .click();
  await expect.poll(() => rowNames(page, nameOf)).toEqual(["1"]);

  await page
    .getByRole("button", {
      name: rt(`${p}.remove`, { name: "1" }),
      exact: true,
    })
    .click();
  const undo = page
    .getByRole("status")
    .filter({ hasText: rt(`${p}.removed`, { name: "1" }) })
    .getByRole("button", { name: he.ui.undoRow.undo });
  await expect(
    page.getByRole("heading", { name: rt(`${p}.quick.title`) }),
  ).toBeVisible();
  await expect(undo).toBeFocused();
  await undo.click();
  await expect.poll(() => rowNames(page, nameOf)).toEqual(["1"]);
});

// Left by the browser's Back, which presses nothing on the screen, and
// opened again from the menu: Next shows the same screen again, kept for
// Back, and its effects run again, while the link pressed on the menu is
// hidden. The table moved before is no move of this visit: no arrow of it
// takes the focus.
test("the places twin, left by Back and opened again, puts the focus on no moved table's arrow", async ({
  page,
}) => {
  const p = "app.orders.places" as const;
  const nameOf = rt(`${p}.nameOf`, { name: "" }).trim();
  const placesLink = page
    .getByRole("main")
    .getByRole("link", {
      name: new RegExp(`^${asIs(rt("app.orders.menu.placesRow"))}`),
    })
    .filter({ visible: true })
    .first();
  const down3 = arrow(page, rt(`${p}.downFor`, { name: "3" }));
  const up3 = arrow(page, rt(`${p}.upFor`, { name: "3" }));
  await open(page, "/design/order-taking/menu");
  await placesLink.click();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu\/places$/);
  await down3.click();
  await expect.poll(async () => (await rowNames(page, nameOf))[3]).toBe("3");
  await expect(down3).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu$/);
  await placesLink.click();
  await expect(page).toHaveURL(/\/design\/order-taking\/menu\/places$/);
  await expect(down3).toBeVisible();
  await pastDrawing(page);
  await expect(down3).not.toBeFocused();
  await expect(up3).not.toBeFocused();
});

// The same for the menu's categories: down to the end, "הזזה למעלה" has the
// focus; down from the top by a mouse's press, its own arrow keeps it. The
// mouse's move, short of the end, is the one CI's first run caught, as
// table 1's above: its arrow keeps the focus because React gives it back,
// and that once made the move forgotten and never said. It is said from
// the save's answer now, as table 1's is.
test("the categories twin keeps the focus on a moved category's arrow and says where it went", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  const c = "app.orders.categories" as const;
  const nameOf = rt(`${c}.nameOf`, { name: "" }).trim();
  await open(page, "/design/order-taking/menu/categories");
  await expect
    .poll(() => rowNames(page, nameOf))
    .toEqual(["ראשונות", "עיקריות", "קינוחים", "שתייה"]);

  await arrow(page, rt(`${c}.downFor`, { name: "קינוחים" })).focus();
  await heardSoFar(polite);
  await page.keyboard.press("Enter");
  await expect
    .poll(() => rowNames(page, nameOf))
    .toEqual(["ראשונות", "עיקריות", "שתייה", "קינוחים"]);
  await expect(
    arrow(page, rt(`${c}.downFor`, { name: "קינוחים" })),
  ).toBeDisabled();
  await expect(
    arrow(page, rt(`${c}.upFor`, { name: "קינוחים" })),
  ).toBeFocused();
  await expect(
    saidSince(
      polite,
      rt(`${c}.movedTo`, { name: "קינוחים", place: 4, count: 4 }),
    ),
  ).toHaveCount(1);

  const firstDown = arrow(page, rt(`${c}.downFor`, { name: "ראשונות" }));
  await heardSoFar(polite);
  await firstDown.click();
  await expect
    .poll(() => rowNames(page, nameOf))
    .toEqual(["עיקריות", "ראשונות", "שתייה", "קינוחים"]);
  await expect(firstDown).toBeFocused();
  await expect(
    saidSince(
      polite,
      rt(`${c}.movedTo`, { name: "ראשונות", place: 2, count: 4 }),
    ),
  ).toHaveCount(1);
});

// An allergy saved without its words: from "שמירת ההערה", the field takes
// the focus, marked, and why is said after its own read, out of its
// description while it keeps the focus and back in it once the focus
// leaves; from the field itself (a screen reader's press that left the
// focus there), why is said at once. Each said once.
test("the order twin's allergy without words is said once, the field focused and marked", async ({
  page,
}, testInfo) => {
  const polite = announcer(page, "polite");
  const assertive = announcer(page, "assertive");
  const n = "app.orders.note" as const;
  const why = rt(`${n}.allergyMissing`);
  await open(
    page,
    "/design/order-taking/floor/order?place=table-6&state=draft",
  );
  if (testInfo.project.name === "phone") {
    await page
      .getByRole("button", {
        name: new RegExp(`^${asIs(rt("app.orders.order.view.order"))}`),
      })
      .filter({ visible: true })
      .first()
      .click();
  }
  await page
    .getByRole("button", {
      name: new RegExp(`^${asIs(rt("app.orders.draft.allergy"))}.*לימונדה`),
    })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", {
    name: rt(`${n}.title`, { name: "לימונדה" }),
  });
  await expect(sheet).toBeVisible();
  const field = sheet.getByLabel(rt(`${n}.allergyLabel`));
  const save = sheet.getByRole("button", { name: rt(`${n}.save`) });

  await heardSoFar(polite);
  await heardSoFar(assertive);
  await save.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.getByText(why)).toBeVisible();
  await expect(saidSince(polite, why)).toHaveCount(1);
  await expect(saidSince(assertive, why)).toHaveCount(0);
  await expect(field).not.toHaveAttribute("aria-describedby");
  await expect(sheet.getByRole("alert")).toHaveCount(0);
  // Away from the field, why is its description again.
  await page.keyboard.press("Tab");
  await expect(field).not.toBeFocused();
  await expect(field).toHaveAccessibleDescription(why);

  // The press that leaves the focus on the field: why is said at once.
  await field.focus();
  await heardSoFar(polite);
  await heardSoFar(assertive);
  await save.dispatchEvent("click");
  await expect(saidSince(assertive, why)).toHaveCount(1);
  await expect(field).toBeFocused();
  await expect(field).not.toHaveAttribute("aria-describedby");
  await expect(saidSince(polite, why)).toHaveCount(0);

  // Enter held down on "שמירת ההערה": the field takes the focus from its
  // first press, and the key repeating types no line into it, so the field,
  // still empty, stays marked.
  await save.focus();
  await page.keyboard.down("Enter");
  await expect(field).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await page.waitForTimeout(500);
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(sheet.getByText(why)).toBeVisible();

  // Its words, and it saves.
  await field.fill("בוטנים");
  await expect(field).not.toHaveAttribute("aria-invalid");
  await save.click();
  await expect(sheet).toHaveCount(0);
});

// The search says what it found once what is typed settles: how many, or
// that nothing starts so; nothing as the screen opens or as it is emptied,
// and a word typed letter by letter is said once, for what it found in the
// end. The nothing-found line is no live region of its own.
test("the order twin's menu search says how many it found once the typing settles", async ({
  page,
}, testInfo) => {
  const polite = announcer(page, "polite");
  const pk = "app.orders.picker" as const;
  const settled = () => page.waitForTimeout(SEARCH_SAID_AFTER_MS + 400);
  const anyResult = new RegExp(
    `${asIs(rt(`${pk}.foundCount`, { count: 2 })).replace("2", "\\d+")}|${asIs(
      rt(`${pk}.foundCount`, { count: 1 }),
    )}|${asIs(rt(`${pk}.nothingFound`, { query: "" }))}`,
  );
  await open(page, "/design/order-taking/floor/order?place=table-6");
  if (testInfo.project.name === "phone") {
    // The phone's items, whatever the order shows first.
    await page
      .getByRole("button", {
        name: new RegExp(`^${asIs(rt("app.orders.order.view.add"))}`),
      })
      .filter({ visible: true })
      .first()
      .click();
  }
  const search = page.getByLabel(rt(`${pk}.search`));
  await expect(search).toBeVisible();
  await settled();
  await expect(polite.getByText(anyResult)).toHaveCount(0);

  // "ש" alone finds two (שניצל, עוגת שוקולד), "שנ" one: only the one said.
  const two = rt(`${pk}.foundCount`, { count: 2 });
  await noteIfSaid(page, two);
  await heardSoFar(polite);
  await search.pressSequentially("שנ", { delay: 80 });
  const one = rt(`${pk}.foundCount`, { count: 1 });
  await expect(saidSince(polite, one)).toHaveCount(1);
  expect(await wasSaid(page, two)).toBe(false);

  // Nothing starts so: said, and shown in a line that is no live region.
  const nothing = rt(`${pk}.nothingFound`, { query: "שנזז" });
  await heardSoFar(polite);
  await search.fill("שנזז");
  await expect(saidSince(polite, nothing)).toHaveCount(1);
  await expect(page.getByRole("main").getByText(nothing)).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: nothing }),
  ).toHaveCount(0);

  // Emptied: nothing said. The same search again: said again.
  await heardSoFar(polite);
  await search.fill("");
  await settled();
  await expect(
    polite.locator("p:not([data-heard])").filter({ hasText: anyResult }),
  ).toHaveCount(0);
  await search.fill("שנ");
  await expect(saidSince(polite, one)).toHaveCount(1);
});
