import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  archiveDemoDepartment,
  demoDepartmentNames,
  demoDepartmentPhones,
  renameDemoDepartment,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The business's departments on /manage/departments (L2), while lists are on:
// add, rename, put people in and take them out, remove with undo, and the
// activity log's line. The test works on a department of its own, so the
// demo restaurant's kitchen, floor, bar and storeroom stay as they are.
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const NOA = { name: "נועה כהן", e164: "+972500000003" };
const ADDED = "מחלקת בדיקה";
const RENAMED = "שטיפת כלים";

const d = he.app.manage.departments;
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, value),
    text,
  );
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

test.afterEach(async () => {
  await archiveDemoDepartment(ADDED);
  await archiveDemoDepartment(RENAMED);
});

test("a manager adds a department, names it, puts people in it and removes it with undo", async ({
  page,
}, testInfo) => {
  await signIn(page, MANAGER);
  await page.goto("/manage");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(`^${literal(d.title)}`) })
    .click();
  await expect(page).toHaveURL(/\/manage\/departments$/);
  await expect(
    page.getByRole("heading", { level: 1, name: d.title }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("departments.png"),
    fullPage: true,
  });

  // Added from the row at the end.
  await page.getByLabel(d.newName).fill(ADDED);
  await page.getByRole("button", { name: d.add }).click();
  await expect(page.getByLabel(fill(d.nameOf, { name: ADDED }))).toHaveValue(
    ADDED,
  );
  await expect.poll(demoDepartmentNames).toContain(ADDED);

  // Named again in place.
  const field = page.getByLabel(fill(d.nameOf, { name: ADDED }));
  await field.fill(RENAMED);
  await field.press("Enter");
  await expect.poll(demoDepartmentNames).toContain(RENAMED);
  await expect(page.getByLabel(fill(d.nameOf, { name: RENAMED }))).toHaveValue(
    RENAMED,
  );

  // Noa in and out, each saved at once. The people button is named by what
  // it shows, then the department ("אין אנשים בשטיפת כלים").
  const nobody = heT("app.manage.departments.people", { count: 0 });
  const inRenamed = fill(d.peopleWhere, { name: RENAMED });
  await page
    .getByRole("button", {
      name: new RegExp(`^${literal(nobody)}\\s+${literal(inRenamed)}$`),
    })
    .click();
  const noa = page
    .getByRole("switch", {
      name: fill(d.inDepartment, { name: NOA.name, department: RENAMED }),
    })
    .filter({ visible: true });
  await noa.click();
  await expect(noa).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => demoDepartmentPhones(RENAMED)).toEqual([NOA.e164]);
  await expectCleanPage(page);
  await noa.click();
  await expect(noa).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => demoDepartmentPhones(RENAMED)).toEqual([]);
  // On a phone the people are in a sheet.
  await page.keyboard.press("Escape");

  // Removed, with the way back.
  await page
    .getByRole("button", { name: fill(d.remove, { name: RENAMED }) })
    .click();
  await expect.poll(demoDepartmentNames).not.toContain(RENAMED);
  await page
    .getByRole("status")
    .filter({ hasText: fill(d.removed, { name: RENAMED }) })
    .getByRole("button", { name: he.app.manage.undo })
    .click();
  await expect.poll(demoDepartmentNames).toContain(RENAMED);
  await page
    .getByRole("button", { name: fill(d.remove, { name: RENAMED }) })
    .click();
  await expect.poll(demoDepartmentNames).not.toContain(RENAMED);

  // The activity log says what changed.
  await page.goto("/manage/activity");
  await expect(
    page
      .getByText(he.app.manage.activity.actions.departments.change)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        fill(he.app.manage.activity.actions.departments.members, {
          department: RENAMED,
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

// Accessibility, part 6, on the twin (/design/shell/manage/departments),
// which saves nothing: from a tablet up, whose people are shown beside the
// list is said on its button (aria-current), not only tinted, and a choice
// puts the focus on their title, which comes after the whole list; the
// moves are unavailable at the ends rather than disabled under the focus,
// which stays on them, and the department moved keeps its people shown,
// chosen or shown first by default. A phone opens them in a sheet, and
// marks none current.
test("the departments twin marks whose people are shown, takes the focus to them, and stops its moves at the ends", async ({
  page,
}, testInfo) => {
  const peopleIn = (name: string) =>
    page.getByRole("button", {
      name: new RegExp(`\\s${literal(fill(d.peopleWhere, { name }))}$`),
    });
  const names = page.getByRole("textbox", {
    name: new RegExp(`^${literal(fill(d.nameOf, { name: "" }))}`),
  });
  await page.goto("/design/shell/manage/departments");
  await page.waitForLoadState("networkidle");
  const kitchen = peopleIn("מטבח");
  const bar = peopleIn("בר");
  if (testInfo.project.name === "phone") {
    await expect(kitchen).not.toHaveAttribute("aria-current");
    await bar.click();
    await expect(
      page.getByRole("dialog", { name: fill(d.peopleOf, { name: "בר" }) }),
    ).toBeVisible();
    return;
  }

  // The first one's people at first; chosen, though shown already, the
  // focus is on their title.
  await expect(kitchen).toHaveAttribute("aria-current", "true");
  await expect(bar).not.toHaveAttribute("aria-current");
  const up = page.getByRole("button", { name: d.up, exact: true });
  const down = page.getByRole("button", { name: d.down, exact: true });
  const kitchenTitle = page.getByRole("heading", {
    level: 2,
    name: fill(d.peopleOf, { name: "מטבח" }),
  });
  await kitchen.click();
  await expect(kitchenTitle).toBeFocused();

  // Moved down with none chosen, it keeps its people shown, not those of
  // the one that is first now.
  await expect(kitchenTitle).toBeVisible();
  await down.focus();
  await page.keyboard.press("Enter");
  await expect(names.nth(1)).toHaveValue("מטבח");
  await expect(kitchenTitle).toBeVisible();
  await expect(kitchen).toHaveAttribute("aria-current", "true");
  await expect(down).toBeFocused();

  // Then the one chosen.
  await bar.click();
  await expect(bar).toHaveAttribute("aria-current", "true");
  await expect(kitchen).not.toHaveAttribute("aria-current");
  const title = page.getByRole("heading", {
    level: 2,
    name: fill(d.peopleOf, { name: "בר" }),
  });
  await expect(title).toBeFocused();

  // Down to the end: "הזזה למטה" stays where it is, unavailable, with the
  // focus, and a press there moves nothing.
  await expect(up).not.toHaveAttribute("aria-disabled");
  await expect(down).not.toHaveAttribute("aria-disabled");
  await down.focus();
  await page.keyboard.press("Enter");
  await expect(names.last()).toHaveValue("בר");
  await expect(down).toHaveAttribute("aria-disabled", "true");
  await expect(down).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(names.last()).toHaveValue("בר");
  await expect(down).toBeFocused();
  await expect(title).toBeVisible();

  // Up to the top, the same; its people stay shown all the way.
  await up.focus();
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press("Enter");
  }
  await expect(names.first()).toHaveValue("בר");
  await expect(up).toHaveAttribute("aria-disabled", "true");
  await expect(up).toBeFocused();
  await expect(down).not.toHaveAttribute("aria-disabled");
  await expect(title).toBeVisible();
  await expect(bar).toHaveAttribute("aria-current", "true");

  // The one shown, chosen again: the focus is on its people's title again.
  await names.first().focus();
  await bar.click();
  await expect(title).toBeFocused();
});

/** Where the test keeps the failure's line it saw before, on the page's window. */
type SeenLine = { seenLine?: Element };

// The twin again, which saves nothing: a save the network drops is said by
// an alert drawn anew each time, the same words again too, and gone once a
// save goes through. Enter saves a name with the focus still in its field,
// and one that couldn't be saved is back to the stored name there; an add
// keeps the focus on "+", unavailable with no name left; "ביטול" gives the
// focus to the name it brought back.
test("the departments twin says each failed save anew, and keeps the focus where each change was made", async ({
  page,
}) => {
  const names = page.getByRole("textbox", {
    name: new RegExp(`^${literal(fill(d.nameOf, { name: "" }))}`),
  });
  const kitchen = names.first();
  const failed = page
    .getByRole("alert")
    .filter({ hasText: he.app.manage.failed.failed });
  const departments = "/design/shell/manage/departments";
  const saves = (url: URL) => url.pathname === departments;
  await page.goto(departments);
  await page.waitForLoadState("networkidle");

  let dropping = true;
  await page.route(saves, async (route) => {
    if (route.request().method() !== "POST" || !dropping) {
      await route.fallback();
      return;
    }
    await route.abort();
  });
  await kitchen.fill("מטבח ראשי");
  await kitchen.press("Enter");
  await expect(failed).toBeVisible();
  await expect(kitchen).toHaveValue("מטבח");
  await expect(kitchen).toBeFocused();
  await failed.evaluate((line) => {
    (window as unknown as SeenLine).seenLine = line;
  });
  await kitchen.fill("מטבח ראשי");
  await kitchen.press("Enter");
  await expect
    .poll(() =>
      failed.evaluate(
        (line) => line !== (window as unknown as SeenLine).seenLine,
      ),
    )
    .toBe(true);
  await expect(kitchen).toHaveValue("מטבח");

  dropping = false;
  await kitchen.fill("מטבח ראשי");
  await kitchen.press("Enter");
  await expect(failed).toHaveCount(0);
  await expect(kitchen).toHaveValue("מטבח ראשי");
  await expect(kitchen).toHaveAccessibleName(
    fill(d.nameOf, { name: "מטבח ראשי" }),
  );
  await expect(kitchen).toBeFocused();
  await page.unroute(saves);

  // Added with "+" from the keyboard: the focus stays there.
  const add = page.getByRole("button", { name: d.add });
  await page.getByLabel(d.newName, { exact: true }).fill("קופה");
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(names.last()).toHaveValue("קופה");
  await expect(add).toBeFocused();
  await expect(add).toHaveAttribute("aria-disabled", "true");

  // Removed and brought back: the focus is on its "הסרת …" again, never on
  // its name's text field.
  const removeCashier = page.getByRole("button", {
    name: fill(d.remove, { name: "קופה" }),
  });
  await removeCashier.focus();
  await page.keyboard.press("Enter");
  const undo = page
    .getByRole("status")
    .filter({ hasText: fill(d.removed, { name: "קופה" }) })
    .getByRole("button", { name: he.app.manage.undo });
  await expect(undo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(undo).toHaveCount(0);
  await expect(removeCashier).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: fill(d.nameOf, { name: "קופה" }) }),
  ).not.toBeFocused();
});

// A name already there is said by a line drawn anew each time, the same
// name again too, from a department's own field (Enter, which keeps the
// focus there and puts its stored name back) and from the add row.
test("the departments twin says a name already there anew each time", async ({
  page,
}) => {
  const names = page.getByRole("textbox", {
    name: new RegExp(`^${literal(fill(d.nameOf, { name: "" }))}`),
  });
  const kitchen = names.first();
  const taken = page
    .getByRole("alert")
    .filter({ hasText: fill(d.taken, { name: "בר" }) });
  const noteLine = (line: Element) => {
    (window as unknown as SeenLine).seenLine = line;
  };
  const anotherLine = (line: Element) =>
    line !== (window as unknown as SeenLine).seenLine;
  await page.goto("/design/shell/manage/departments");
  await page.waitForLoadState("networkidle");

  await kitchen.fill("בר");
  await kitchen.press("Enter");
  await expect(taken).toBeVisible();
  await expect(kitchen).toHaveValue("מטבח");
  await expect(kitchen).toBeFocused();
  await taken.evaluate(noteLine);
  await kitchen.fill("בר");
  await kitchen.press("Enter");
  await expect.poll(() => taken.evaluate(anotherLine)).toBe(true);
  await expect(kitchen).toHaveValue("מטבח");

  // Typing in the add row clears the line; Enter there says it again, and
  // again.
  const newName = page.getByLabel(d.newName, { exact: true });
  await newName.fill("בר");
  await expect(taken).toHaveCount(0);
  await newName.press("Enter");
  await expect(taken).toBeVisible();
  await taken.evaluate(noteLine);
  await newName.press("Enter");
  await expect.poll(() => taken.evaluate(anotherLine)).toBe(true);
  await expect(names).toHaveCount(4);
});

// A long list: "ביטול", under it all, has the page scrolled down to it, so
// the first department it brings back is far above. Its "הסרת …" takes the
// focus brought into view, by the keyboard and, on a phone, by a tap too,
// which focuses no text field: a phone would open its keyboard over the
// screen.
test("the departments twin's undone removal far up a long list gives the focus to its remove button, in view", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const names = page.getByRole("textbox", {
    name: new RegExp(`^${literal(fill(d.nameOf, { name: "" }))}`),
  });
  const removeKitchen = page.getByRole("button", {
    name: fill(d.remove, { name: "מטבח" }),
  });
  const undo = page
    .getByRole("status")
    .filter({ hasText: fill(d.removed, { name: "מטבח" }) })
    .getByRole("button", { name: he.app.manage.undo });
  // The one first once the kitchen went.
  const floor = page.getByRole("textbox", {
    name: fill(d.nameOf, { name: "אולם" }),
  });
  await page.goto("/design/shell/manage/departments");
  await page.waitForLoadState("networkidle");
  const newName = page.getByLabel(d.newName, { exact: true });
  for (let added = 1; added <= 20; added += 1) {
    await newName.fill(`מחלקה ${added}`);
    await newName.press("Enter");
    await expect(names).toHaveCount(4 + added);
  }

  await removeKitchen.focus();
  await page.keyboard.press("Enter");
  await expect(undo).toBeFocused();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(floor).not.toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(undo).toHaveCount(0);
  await expect(removeKitchen).toBeFocused();
  await expect(removeKitchen).toBeInViewport();
  await expect(names.first()).toHaveValue("מטבח");

  if (testInfo.project.name !== "phone") return;
  await removeKitchen.tap();
  await expect(undo).toBeFocused();
  await expect(floor).not.toBeInViewport();
  await undo.tap();
  await expect(undo).toHaveCount(0);
  await expect(removeKitchen).toBeFocused();
  await expect(removeKitchen).toBeInViewport();
  await expect(names.first()).not.toBeFocused();
});

// Someone else renames a department while this screen is open: once the
// screen is read again (a change of people saves and reads it), its field
// shows the new name, though it was gone through before, and leaving it
// as it is, by Tab or Enter, saves nothing: never the old name back.
test("a department renamed elsewhere shows its new name, and a field left as it was saves nothing", async ({
  page,
}) => {
  await signIn(page, MANAGER);
  await page.goto("/manage/departments");
  await page.getByLabel(d.newName).fill(ADDED);
  await page.getByRole("button", { name: d.add }).click();
  await expect.poll(demoDepartmentNames).toContain(ADDED);
  // Read afresh: nothing saved from this screen since.
  await page.reload();
  const added = page.getByRole("textbox", {
    name: fill(d.nameOf, { name: ADDED }),
  });
  await expect(added).toHaveValue(ADDED);
  // Gone through, as a Tab passes it.
  await added.focus();
  await added.blur();

  await renameDemoDepartment(ADDED, RENAMED);
  const nobody = heT("app.manage.departments.people", { count: 0 });
  await page
    .getByRole("button", {
      name: new RegExp(
        `^${literal(nobody)}\\s+${literal(fill(d.peopleWhere, { name: ADDED }))}$`,
      ),
    })
    .click();
  await page
    .getByRole("switch", {
      name: fill(d.inDepartment, { name: NOA.name, department: ADDED }),
    })
    .filter({ visible: true })
    .click();
  await expect.poll(() => demoDepartmentPhones(RENAMED)).toEqual([NOA.e164]);
  // On a phone the people are in a sheet.
  await page.keyboard.press("Escape");

  const renamed = page.getByRole("textbox", {
    name: fill(d.nameOf, { name: RENAMED }),
  });
  await expect(renamed).toHaveValue(RENAMED);
  await renamed.focus();
  await renamed.blur();
  await renamed.focus();
  await renamed.press("Enter");
  await renamed.blur();
  await page.waitForTimeout(1_500);
  const stored = await demoDepartmentNames();
  expect(stored).toContain(RENAMED);
  expect(stored).not.toContain(ADDED);
  await expect(renamed).toHaveValue(RENAMED);
});
