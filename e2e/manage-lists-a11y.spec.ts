import { ACCESS_UNDO_MS } from "../app/(app)/manage/access/access-undo";
import he from "../messages/he.json" with { type: "json" };
import {
  announcer,
  focusWhenSaid,
  heardSoFar,
  noteFocusWhenSaid,
  pastDrawing,
  saidSince,
} from "./announcer";
import { heT, undoNamed } from "./t";
import { expect, type Page, test } from "./test";

// Accessibility, part 8, on the twins of management's editors and the lists
// (/design/shell/manage/access, /design/shell/manage/scheduling, a
// template's editor and the lists' screens): no data, no sign-in, nothing
// stored, so a removal can run out its time and be removed again as often
// as the test likes. The real screens' own checks are in lists.spec.ts
// (finishing a list), list-templates.spec.ts (a template removed) and
// design.spec.ts (the twins' sending and photo flows).

const a = he.app.manage.access;
const m = he.app.manage;
const l = he.app.lists;
const UNDO = he.ui.undoRow.undo;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The twin's people (app/design/shell/manage/access/data.ts): Yoav was
// given access himself, and his role doesn't give it.
const YOAV = "יואב לוי";

/** The "ביטול" of a removal whose words are `words`. */
const undoOf = (page: Page, words: string) =>
  page
    .getByRole("status")
    .filter({ hasText: words })
    .getByRole("button", { name: UNDO });

// Who sees pay: "הסרה" goes with the person's row, so "ביטול" takes the
// focus. With the keyboard on it, it waits past its six seconds, and so
// does the removal it holds; undone, the focus is back on the person's
// "הסרה". After a mouse's press nothing waits, and once it goes the title
// of the personal section has the focus. A role's switch keeps its focus:
// its "ביטול", reached by Tab, waits too, and undone gives the focus back
// to the switch.
test("who sees pay gives a removal's 'ביטול' the focus, waits while it is reached, and gives the focus on", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const remove = page.getByRole("button", {
    name: heT("app.manage.access.personal.removeLabel", {
      remove: a.personal.remove,
      name: YOAV,
    }),
  });
  const removed = heT("app.manage.access.done.removed", { name: YOAV });
  const undo = undoOf(page, removed);
  const personal = page.getByRole("heading", {
    level: 2,
    name: a.groups.personal,
    exact: true,
  });

  await page.goto("/design/shell/manage/access");
  await page.waitForLoadState("networkidle");
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(undo).toBeFocused();
  await expect(undo).toHaveAccessibleName(undoNamed(removed));
  await expect(remove).toHaveCount(0);
  // Past its time, with the keyboard on it: still there.
  await page.waitForTimeout(ACCESS_UNDO_MS + 1_000);
  await expect(undo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(remove).toBeFocused();
  await expect(undo).toHaveCount(0);

  // The twin keeps nothing: afresh, and with a mouse. It goes after its
  // time, and the section's title has the focus.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await remove.click();
  await expect(undo).toBeFocused();
  await expect(undo).toHaveCount(0, { timeout: ACCESS_UNDO_MS + 5_000 });
  await expect(personal).toBeFocused();
  await expect(remove).toHaveCount(0);

  // A role's switch: the focus stays on it, and its "ביטול" is next.
  const workers = page.getByRole("switch", { name: a.roles.worker });
  const roleWords = heT("app.manage.access.done.roleOn", { role: "worker" });
  const roleUndo = undoOf(page, roleWords);
  await workers.focus();
  await page.keyboard.press("Space");
  await expect(workers).toHaveAttribute("aria-checked", "true");
  await expect(roleUndo).toBeVisible();
  await expect(workers).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(roleUndo).toBeFocused();
  await page.waitForTimeout(ACCESS_UNDO_MS + 1_000);
  await expect(roleUndo).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(workers).toHaveAttribute("aria-checked", "false");
  await expect(workers).toBeFocused();
  await expect(roleUndo).toHaveCount(0);
});

// The positions: the trash button goes with its row, so "ביטול" takes the
// focus; undone, the position's own trash button has it again. The shifts:
// removing one from its sheet closes the sheet onto "ביטול", which says
// what went as the focus reaches it, and the announcer doesn't say it
// meanwhile; undone, the shift's row has the focus. A sheet closed any
// other way gives the focus back to the row that opened it, and so does a
// removal refused.
test("the scheduling settings give each removal's 'ביטול' the focus, and the focus back to what it brings back", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await page.goto("/design/shell/manage/scheduling");
  await page.waitForLoadState("networkidle");

  const BARTENDER = "ברמן/ית";
  const trash = page.getByRole("button", {
    name: heT("app.manage.positions.remove", { name: BARTENDER }),
  });
  const positionRemoved = heT("app.manage.positions.removed", {
    name: BARTENDER,
  });
  await trash.click();
  await expect(undoOf(page, positionRemoved)).toBeFocused();
  await expect(trash).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(trash).toBeFocused();
  await expect(undoOf(page, positionRemoved)).toHaveCount(0);

  const EVENING = "ערב";
  const row = page.getByRole("button", { name: new RegExp(`^${EVENING}`) });
  const sheet = page.getByRole("dialog", { name: EVENING });
  await row.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(row).toBeFocused();

  const shiftRemoved = heT("app.manage.shifts.removed", { name: EVENING });
  const shiftUndo = undoOf(page, shiftRemoved);
  await row.click();
  await heardSoFar(polite);
  await sheet.getByRole("button", { name: m.shifts.remove }).click();
  await expect(sheet).toBeHidden();
  await expect(shiftUndo).toBeFocused();
  await expect(shiftUndo).toHaveAccessibleName(undoNamed(shiftRemoved));
  await pastDrawing(page);
  await expect(saidSince(polite, shiftRemoved)).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(row).toBeFocused();
  await expect(shiftUndo).toHaveCount(0);

  // A removal refused (its save dropped at once, while the sheet still
  // slides away), with an earlier removal's way back still there: the shift
  // is back, and the sheet closes onto its row, never onto the earlier
  // removal's "ביטול", which would say that shift went; only then is the
  // refusal said.
  const SATURDAY = "מוצ״ש";
  const saturday = page.getByRole("button", {
    name: new RegExp(`^${SATURDAY}`),
  });
  const saturdayUndo = undoOf(
    page,
    heT("app.manage.shifts.removed", { name: SATURDAY }),
  );
  await saturday.click();
  await page
    .getByRole("dialog", { name: SATURDAY })
    .getByRole("button", { name: m.shifts.remove })
    .click();
  await expect(saturdayUndo).toBeFocused();
  await page.waitForLoadState("networkidle");
  const saves = (url: URL) =>
    url.pathname === "/design/shell/manage/scheduling";
  await page.route(saves, async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.fallback();
  });
  await row.click();
  await expect(sheet).toBeVisible();
  await noteFocusWhenSaid(page, m.failed.failed, "button", EVENING);
  await sheet.getByRole("button", { name: m.shifts.remove }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("alert").filter({ hasText: m.failed.failed }),
  ).toBeVisible();
  await expect(row).toBeFocused();
  expect(await focusWhenSaid(page)).toBe(true);
  await expect(saturdayUndo).toBeVisible();
  await expect(saturdayUndo).not.toBeFocused();
  await page.unroute(saves);
});

/** The scheduling twin's saves, each held until `release` and then dropped. */
async function holdSaves(page: Page, path: string) {
  const saves = (url: URL) => url.pathname === path;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  await page.route(saves, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await held;
    await route.abort();
  });
  const sent = () =>
    page.waitForRequest(
      (request) => request.method() === "POST" && saves(new URL(request.url())),
    );
  return { sent, release: () => release(), stop: () => page.unroute(saves) };
}

// A shift's removal refused once its sheet has gone (its save held, then
// dropped): its "ביטול", which has the focus, goes, the shift's row is back
// and has the focus, and only then is the refusal said, so the move doesn't
// cut it off.
test("the scheduling settings say a shift's removal refused after its sheet has gone once its row has the focus", async ({
  page,
}) => {
  const scheduling = "/design/shell/manage/scheduling";
  await page.goto(scheduling);
  await page.waitForLoadState("networkidle");
  const saves = await holdSaves(page, scheduling);

  const EVENING = "ערב";
  const row = page.getByRole("button", { name: new RegExp(`^${EVENING}`) });
  const sheet = page.getByRole("dialog", { name: EVENING });
  const undo = undoOf(
    page,
    heT("app.manage.shifts.removed", { name: EVENING }),
  );
  const why = page.getByRole("alert").filter({ hasText: m.failed.failed });
  await row.click();
  await expect(sheet).toBeVisible();
  const removal = saves.sent();
  await sheet.getByRole("button", { name: m.shifts.remove }).click();
  await removal;
  await expect(sheet).toBeHidden();
  await expect(undo).toBeFocused();
  await noteFocusWhenSaid(page, m.failed.failed, "button", EVENING);
  saves.release();
  await expect(why).toBeVisible();
  await expect(row).toBeFocused();
  await expect(undo).toHaveCount(0);
  expect(await focusWhenSaid(page)).toBe(true);
  await saves.stop();
});

// Another shift's sheet opened while a removal waits, and the removal
// refused meanwhile: that sheet still closes onto its own row, not onto the
// row the refusal put back.
test("the scheduling settings close another shift's sheet onto its own row while an earlier removal is refused", async ({
  page,
}) => {
  const scheduling = "/design/shell/manage/scheduling";
  await page.goto(scheduling);
  await page.waitForLoadState("networkidle");
  const saves = await holdSaves(page, scheduling);

  const EVENING = "ערב";
  const SATURDAY = "מוצ״ש";
  const evening = page.getByRole("button", {
    name: new RegExp(`^${EVENING}`),
  });
  const saturday = page.getByRole("button", {
    name: new RegExp(`^${SATURDAY}`),
  });
  const eveningSheet = page.getByRole("dialog", { name: EVENING });
  const saturdaySheet = page.getByRole("dialog", { name: SATURDAY });
  await evening.click();
  await expect(eveningSheet).toBeVisible();
  const removal = saves.sent();
  await eveningSheet.getByRole("button", { name: m.shifts.remove }).click();
  await removal;
  await expect(eveningSheet).toBeHidden();
  await expect(
    undoOf(page, heT("app.manage.shifts.removed", { name: EVENING })),
  ).toBeFocused();

  await saturday.click();
  await expect(saturdaySheet).toBeVisible();
  saves.release();
  // Refused while Saturday's sheet is open: said at once (the page under
  // the sheet is hidden from the accessibility tree meanwhile, its words
  // are not).
  await expect(page.getByText(m.failed.failed)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(saturdaySheet).toBeHidden();
  await expect(saturday).toBeFocused();
  await expect(evening).toBeVisible();
  await expect(evening).not.toBeFocused();
  await saves.stop();
});

// A position's undo refused (its save didn't get there) once the person
// went on, naming a new position: its way back is there again, and its
// "ביטול" leaves the focus where the person is. (It takes it only from the
// position's trash button, about to go again, or a focus lost.)
test("the scheduling settings' refused undo leaves the focus where the person went on", async ({
  page,
}) => {
  const scheduling = "/design/shell/manage/scheduling";
  const saves = (url: URL) => url.pathname === scheduling;
  await page.goto(scheduling);
  await page.waitForLoadState("networkidle");

  // A save held while `held` waits, then dropped; the rest go through.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  let holding = false;
  await page.route(saves, async (route) => {
    if (route.request().method() !== "POST" || !holding) {
      await route.fallback();
      return;
    }
    await held;
    await route.abort();
  });

  const BARTENDER = "ברמן/ית";
  const trash = page.getByRole("button", {
    name: heT("app.manage.positions.remove", { name: BARTENDER }),
  });
  const undo = undoOf(
    page,
    heT("app.manage.positions.removed", { name: BARTENDER }),
  );
  const newName = page.getByRole("textbox", {
    name: m.positions.newName,
    exact: true,
  });
  const removal = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && saves(new URL(response.url())),
  );
  await trash.click();
  await expect(undo).toBeFocused();
  await removal;

  // Undone: the trash button has the focus, and the save waits. The person
  // goes on to name a new position before it is refused.
  holding = true;
  await page.keyboard.press("Enter");
  await expect(trash).toBeFocused();
  await expect(undo).toHaveCount(0);
  await newName.fill("מארח/ת");
  release();
  await expect(undo).toBeVisible();
  await expect(newName).toBeFocused();
  await expect(newName).toHaveValue("מארח/ת");
  await page.unroute(saves);
});

// A position's removal refused (its save dropped) while an earlier
// removal's way back is up: that way back is there again, and nothing says
// it again as it appears, words about another position long after the
// fact; the focus is back on the refused position's trash button.
test("the scheduling settings bring an earlier removal's way back again without saying it when a later removal is refused", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  const scheduling = "/design/shell/manage/scheduling";
  const saves = (url: URL) => url.pathname === scheduling;
  await page.goto(scheduling);
  await page.waitForLoadState("networkidle");

  const BARTENDER = "ברמן/ית";
  const COOK = "טבח/ית";
  const trashOf = (name: string) =>
    page.getByRole("button", {
      name: heT("app.manage.positions.remove", { name }),
    });
  const bartenderRemoved = heT("app.manage.positions.removed", {
    name: BARTENDER,
  });
  const bartenderUndo = undoOf(page, bartenderRemoved);
  const removal = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && saves(new URL(response.url())),
  );
  await trashOf(BARTENDER).click();
  await expect(bartenderUndo).toBeFocused();
  await removal;

  await page.route(saves, async (route) => {
    if (route.request().method() === "POST") await route.abort();
    else await route.fallback();
  });
  await heardSoFar(polite);
  await trashOf(COOK).click();
  await expect(bartenderUndo).toBeVisible();
  await expect(trashOf(COOK)).toBeFocused();
  await pastDrawing(page);
  await expect(saidSince(polite, bartenderRemoved)).toHaveCount(0);
  await page.unroute(saves);
});

// A template's editor: an item and a time removed from their sheets close
// them onto "ביטול", which says what went, in its name, and the announcer
// doesn't, too; undone, the row is back and has the focus.
test("the template editor closes a removal's sheet onto its 'ביטול', and gives the focus back to the row it brings back", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await page.goto("/design/shell/lists/templates/t-kitchen-opening");
  await page.waitForLoadState("networkidle");

  const SURFACES = "ניקוי משטחי עבודה";
  const item = page.getByRole("button", { name: new RegExp(`^${SURFACES}`) });
  const itemRemoved = heT("app.lists.items.removed", { label: SURFACES });
  const itemUndo = undoOf(page, itemRemoved);
  await item.click();
  const itemSheet = page.getByRole("dialog", { name: SURFACES });
  await expect(itemSheet).toBeVisible();
  await heardSoFar(polite);
  await itemSheet.getByRole("button", { name: l.items.remove }).click();
  await expect(itemSheet).toBeHidden();
  await expect(itemUndo).toBeFocused();
  await expect(itemUndo).toHaveAccessibleName(undoNamed(itemRemoved));
  await pastDrawing(page);
  await expect(saidSince(polite, itemRemoved)).toHaveCount(0);
  await expect(item).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(item).toBeFocused();
  await expect(itemUndo).toHaveCount(0);

  // Its one time, the first row of its section, before "הוספת זמן".
  const times = page.locator("section").filter({
    has: page.getByRole("heading", {
      level: 2,
      name: l.schedules.title,
      exact: true,
    }),
  });
  const rows = times.getByRole("button");
  const add = times.getByRole("button", { name: l.schedules.add });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).not.toContainText(l.schedules.add);
  const timeUndo = undoOf(page, l.schedules.removed);
  await rows.first().click();
  const timeSheet = page.getByRole("dialog", { name: l.schedules.sheet.title });
  await expect(timeSheet).toBeVisible();
  await heardSoFar(polite);
  await timeSheet
    .getByRole("button", { name: l.schedules.sheet.remove })
    .click();
  await expect(timeSheet).toBeHidden();
  await expect(timeUndo).toBeFocused();
  await expect(timeUndo).toHaveAccessibleName(undoNamed(l.schedules.removed));
  // Its focus says it: the announcer doesn't, too (its row `quiet`).
  await pastDrawing(page);
  await expect(saidSince(polite, l.schedules.removed)).toHaveCount(0);
  // The time's row went: "הוספת זמן" and "ביטול" are left.
  await expect(rows.first()).toContainText(l.schedules.add);
  await page.keyboard.press("Enter");
  await expect(timeUndo).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).not.toContainText(l.schedules.add);
  await expect(rows.first()).toBeFocused();
  await expect(add).not.toBeFocused();

  // A list taller than the screen (a short screen here): the first item,
  // removed from its sheet, closes it onto a "ביטול" under the whole list,
  // out of view where the page still is, and brought into view as it takes
  // the focus.
  const FRIDGE = "מקרר ראשי";
  const fridge = page.getByRole("button", { name: new RegExp(`^${FRIDGE}`) });
  const fridgeUndo = undoOf(
    page,
    heT("app.lists.items.removed", { label: FRIDGE }),
  );
  await page.setViewportSize({
    width: page.viewportSize()?.width ?? 390,
    height: 480,
  });
  await fridge.evaluate((row) => row.scrollIntoView({ block: "center" }));
  await expect(fridge).toBeInViewport();
  await expect(
    page.getByRole("button", { name: l.items.add }),
  ).not.toBeInViewport();
  await fridge.click();
  const fridgeSheet = page.getByRole("dialog", { name: FRIDGE });
  await expect(fridgeSheet).toBeVisible();
  await fridgeSheet.getByRole("button", { name: l.items.remove }).click();
  await expect(fridgeSheet).toBeHidden();
  await expect(fridgeUndo).toBeFocused();
  await expect(fridgeUndo).toBeInViewport();
});

// On a phone, what closed today on Lists and what happened on a list are
// folded under a summary; each is a heading too, as the wider screens'
// sections are, so a screen reader moving by headings finds it. One
// heading at every width: the phone's is gone where the sections show.
test("the lists' folded sections are headings at every width", async ({
  page,
}, testInfo) => {
  await page.goto("/design/shell/lists/list-kitchen-opening");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: l.list.timeline.title,
      exact: true,
    }),
  ).toHaveCount(1);

  await page.goto("/design/shell/lists");
  // What closed today, in each form of its plural, any number in the last.
  const forms = [0, 1].map((count) =>
    literal(heT("app.lists.closedToday", { count })),
  );
  const many = literal(heT("app.lists.closedToday", { count: 2 })).replace(
    /^2/,
    "\\d+",
  );
  const closed = new RegExp(`^(${[...forms, many].join("|")})$`);
  await expect(
    page.getByRole("main").getByRole("heading", { level: 2, name: closed }),
  ).toHaveCount(1);
  if (testInfo.project.name === "phone") {
    // The summary still opens what it folds, by its words.
    const summary = page.getByRole("main").locator("summary");
    await expect(summary).toHaveText(closed);
  }
});

// Lists and the templates reached by their address, not right after the
// press that sent a list or removed a template (a reload, the address
// opened again): the way back is there, its "ביטול" leaves the focus where
// it is, and the announcer says the row. (Right after the press it takes
// the focus: design.spec.ts and list-templates.spec.ts.) The templates'
// undo refused (the request dropped, and the twin stores nothing): its
// "ביטול", disabled while it waited, has the focus back, and only then
// does the line under it say why; a folded row's own refused restore has
// the focus back on its "החזרה" the same way, and leaves the top "ביטול"
// alone.
test("a way back reached by its address leaves the focus, and the templates' refused undo has it back", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  const sent = l.send.sent.replace("{to}", "לאולם");
  const takeBack = undoOf(page, sent);
  await page.goto("/design/shell/lists?sent=list-floor-opening");
  await page.waitForLoadState("networkidle");
  await expect(takeBack).toBeVisible();
  await expect(takeBack).not.toBeFocused();
  await expect(saidSince(polite, sent)).toHaveCount(1);

  const STOCK = "ספירת מלאי חודשית";
  const removed = heT("app.lists.templates.removed", { name: STOCK });
  const undo = undoOf(page, removed);
  const templates = "/design/shell/lists/templates";
  await page.goto(`${templates}?removed=t-stock-count`);
  await page.waitForLoadState("networkidle");
  await expect(undo).toBeVisible();
  await expect(undo).not.toBeFocused();
  await expect(saidSince(polite, removed)).toHaveCount(1);

  // Each bringing back dropped: at once, or once `release` lets go while
  // `holding`.
  const restores = (url: URL) => url.pathname === templates;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  let holding = false;
  await page.route(restores, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    if (holding) await held;
    await route.abort();
  });
  const failed = l.templates.failed.failed;
  const why = page.getByRole("alert").filter({ hasText: failed });
  await noteFocusWhenSaid(page, failed, "button", UNDO);
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(why).toBeVisible();
  await expect(undo).toBeFocused();
  await expect(undo).toBeEnabled();
  expect(await focusWhenSaid(page)).toBe(true);

  // The same template brought back from its folded row, refused (held,
  // then dropped): its "החזרה", disabled while it waited, has the focus
  // back, then the line says why, and the top "ביטול" stays unfocused.
  await page
    .getByRole("main")
    .locator("summary")
    .filter({ hasText: heT("app.lists.templates.removedTitle", { count: 1 }) })
    .click();
  const restore = page.getByRole("button", {
    name: heT("app.lists.templates.restoreOf", { name: STOCK }),
  });
  const refused = page.waitForRequest(
    (request) =>
      request.method() === "POST" && restores(new URL(request.url())),
  );
  holding = true;
  await restore.click();
  await refused;
  // The earlier line went with the press.
  await expect(why).toHaveCount(0);
  await noteFocusWhenSaid(page, failed, "button", l.templates.restore);
  release();
  await expect(why).toBeVisible();
  await expect(restore).toBeEnabled();
  await expect(restore).toBeFocused();
  await expect(undo).not.toBeFocused();
  expect(await focusWhenSaid(page)).toBe(true);
  await page.unroute(restores);
});
