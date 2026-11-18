import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  closeDemoList,
  demoListItem,
  endViewSessions,
  resetDemoLists,
  setDemoListItem,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";

// Each item's history (lists L6a), on the demo restaurant's lists as their
// reset leaves them (lists.spec.ts): the kitchen's opening list sent to Noa
// by Shiran, who runs the lists, with two of its checks done by Noa. A second
// person's change (Shiran's, saved through the database as her own screen
// would save it) names her under the item with one more change, and the
// item's story lists both; a comment doesn't change who did the item; a tick
// someone else takes back and gives again at once is theirs, and the story
// keeps who ticked first; the team viewing the business reads the same story.
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };
const OWNER = { local: "050-000-0001", e164: "+972500000001" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };

const OPENING = "פתיחת מטבח";
const FRIDGE = "מקרר ראשי";
const DATES = "בדיקת תאריכים ותוויות";
const NOA_NAME = "נועה כהן";
const SHIRAN_NAME = "שירן הדגמה";
const URI_NAME = "אורי הדגמה";
const NOTE = "הדלת נשארה פתוחה";

const l = he.app.lists;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );
const more = (count: number) => heT("app.lists.list.history.more", { count });

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
 * What opens an item's story: the line under it, and on a computer also the
 * readings table's "who"; the first is the line.
 */
const storyOf = (page: Page, label: string) =>
  page
    .getByRole("main")
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label }))}:\\s`,
      ),
    })
    .filter({ visible: true });
const storySheet = (page: Page) =>
  page.getByRole("dialog", { name: l.list.history.title });

/** The kitchen's opening list, from Lists. */
async function openOpening(page: Page) {
  await page.goto("/lists");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(literal(OPENING)) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: OPENING }),
  ).toBeVisible();
}

test.beforeEach(async () => {
  await resetDemoLists();
});

test.afterEach(async () => {
  await resetDemoLists();
  await endViewSessions(ADMIN.e164);
});

test("a second person's reading names them under the item, and its story lists both", async ({
  page,
}) => {
  await signIn(page, NOA);
  await openOpening(page);

  // Noa writes 4°C: done once, its line says only who and when.
  const fridge = page.getByLabel(fill(l.list.readingOf, { label: FRIDGE }));
  await fridge.fill("4");
  await fridge.press("Enter");
  await expect
    .poll(async () => (await demoListItem(OPENING, FRIDGE))?.reading)
    .toBe(4);
  await expect(storyOf(page, FRIDGE)).toHaveCount(0);

  // Shiran, who runs the lists, changes it to 6°C.
  await setDemoListItem(MANAGER.e164, OPENING, FRIDGE, { reading: 6 });
  expect((await demoListItem(OPENING, FRIDGE))?.doneBy).toBe(MANAGER.e164);
  await page.reload();
  await expect(fridge).toHaveValue("6");
  const story = storyOf(page, FRIDGE).first();
  await expect(story).toContainText(SHIRAN_NAME);
  await expect(story).toContainText(more(1));

  // Its story lists both, with their names.
  await story.click();
  const sheet = storySheet(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(NOA_NAME);
  await expect(sheet).toContainText(SHIRAN_NAME);
  await expect(sheet).toContainText(
    l.list.history.readingChanged.split("<")[0] ?? "",
  );
  await expectCleanPage(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Noa adds a comment: it joins the story at once, and the item stays
  // Shiran's, here and in the database.
  await page
    .getByRole("button", { name: `${l.list.comment.add}: ${FRIDGE}` })
    .filter({ visible: true })
    .first()
    .click();
  const comment = page.getByRole("dialog", { name: l.list.comment.title });
  await expect(comment.getByText(l.list.comment.kept)).toBeVisible();
  await comment.getByLabel(l.list.comment.label, { exact: true }).fill(NOTE);
  await comment.getByRole("button", { name: l.list.comment.save }).click();
  await expect(comment).toBeHidden();
  await expect(storyOf(page, FRIDGE).first()).toContainText(SHIRAN_NAME);
  await expect(storyOf(page, FRIDGE).first()).toContainText(more(2));
  await expect
    .poll(async () => (await demoListItem(OPENING, FRIDGE))?.comment)
    .toBe(NOTE);
  expect(await demoListItem(OPENING, FRIDGE)).toMatchObject({
    doneBy: MANAGER.e164,
    changes: 3,
  });

  // Read again, the same story.
  await page.reload();
  await expect(storyOf(page, FRIDGE).first()).toContainText(SHIRAN_NAME);
  await expect(storyOf(page, FRIDGE).first()).toContainText(more(2));
  await storyOf(page, FRIDGE).first().click();
  await expect(sheet).toContainText(NOA_NAME);
  await expect(sheet).toContainText(NOTE);
});

test("a tick someone else takes back and gives again is theirs, and its story keeps who ticked first", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  // Noa ticked it at the reset; Shiran takes it back and ticks it again.
  await setDemoListItem(MANAGER.e164, OPENING, DATES, null);
  await setDemoListItem(MANAGER.e164, OPENING, DATES, { checked: true });
  expect(await demoListItem(OPENING, DATES)).toMatchObject({
    doneBy: MANAGER.e164,
    changes: 3,
  });

  await signIn(page, NOA);
  await openOpening(page);
  const story = storyOf(page, DATES).first();
  await expect(story).toContainText(SHIRAN_NAME);
  await expect(story).toContainText(more(1));
  await story.click();
  const sheet = storySheet(page);
  await expect(sheet).toContainText(NOA_NAME);
  await expect(sheet).toContainText(SHIRAN_NAME);
  await expect(sheet).toContainText(l.list.history.checked);
});

test("the team viewing as a manager reads an item's story", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  await setDemoListItem(NOA.e164, OPENING, FRIDGE, { reading: 4 });
  await setDemoListItem(MANAGER.e164, OPENING, FRIDGE, { reading: 6 });

  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", {
      name: he.admin.setup.viewAs.as.manager,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/home$/);

  await openOpening(page);
  await expect(page.getByText(l.list.readOnly.viewOnly).first()).toBeVisible();
  // The line under the item, and the readings table's "who".
  await expect(storyOf(page, FRIDGE)).toHaveCount(2);
  const story = storyOf(page, FRIDGE).first();
  await expect(story).toContainText(SHIRAN_NAME);
  await expect(story).toContainText(more(1));
  await story.click();
  const sheet = storySheet(page);
  await expect(sheet).toContainText(NOA_NAME);
  await expect(sheet).toContainText(SHIRAN_NAME);
  await expectCleanPage(page);
});

test("a list's timeline keeps the close a reopen undid, and leaves out an undo", async ({
  page,
}) => {
  // Shiran cancels the opening list and Uri brings it back; then Shiran
  // cancels it again and takes it back herself within the undo's minutes.
  const start = Date.now();
  const at = (minutes: number) => new Date(start + minutes * 60_000);
  await closeDemoList(MANAGER.e164, OPENING, "cancel", at(1));
  await closeDemoList(OWNER.e164, OPENING, "reopen", at(2));
  await closeDemoList(MANAGER.e164, OPENING, "cancel", at(3));
  await closeDemoList(MANAGER.e164, OPENING, "reopen", at(4));

  await signIn(page, NOA);
  await openOpening(page);
  // On a phone the timeline is folded at the end.
  const fold = page
    .locator("summary")
    .filter({ hasText: l.list.timeline.title })
    .filter({ visible: true });
  if ((await fold.count()) > 0) await fold.click();

  // Each line up to its time.
  const line = (text: string, name: string) =>
    page
      .getByText(fill(text.split(", ב-")[0] ?? text, { name }))
      .filter({ visible: true });
  await expect(line(l.list.timeline.cancelled, SHIRAN_NAME)).toHaveCount(1);
  await expect(line(l.list.timeline.restored, URI_NAME)).toHaveCount(1);
  // The undo says neither its cancel nor its bringing back.
  await expect(line(l.list.timeline.restored, SHIRAN_NAME)).toHaveCount(0);
  await expectCleanPage(page);
});
