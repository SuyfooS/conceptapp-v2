import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  backdateDemoListFinish,
  backdateDemoListOpening,
  demoListClose,
  demoListItem,
  demoLists,
  finishDemoList,
  fixDemoListItem,
  reopenDemoList,
  resetDemoLists,
  setDemoListItem,
  setDemoWorkersFix,
} from "./db";
import { signIn } from "./session";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// Fixing a closed list in place (lists L6b-1), on the demo restaurant's lists
// as their reset leaves them (lists.spec.ts): the kitchen's opening list sent
// to Noa by Shiran, who runs the lists. Noa fills it and closes it, through
// the database as her own screen would, with a typo on the fridge (30°C for
// 3°C), and her finish is moved back past her five minutes. Shiran fixes the
// reading where it is: the list stays Noa's close and tells nobody, the item
// and its story say it was fixed and by whom, Lists' day says it, and the
// activity log has the line. Noa sees the marks and has no way to fix.
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const MANAGER = { local: "050-000-0002", e164: "+972500000002" };

const OPENING = "פתיחת מטבח";
const FRIDGE = "מקרר ראשי";
const FREEZER = "מקפיא";
const SURFACES = "ניקוי משטחי עבודה";
const NOA_NAME = "נועה כהן";
const SHIRAN_NAME = "שירן הדגמה";

const l = he.app.lists;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    text,
  );
/** A sentence's words before its first tag or value, as the screen starts it. */
const opening = (text: string) => text.split(/[<{]/)[0] ?? text;

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

/** What opens an item's story: the line under it (first), or the table's "who". */
const storyOf = (page: Page, label: string) =>
  page
    .getByRole("main")
    .getByRole("button", {
      name: new RegExp(
        `^${literal(heT("app.lists.list.history.open", { label }))}:\\s`,
      ),
    })
    .filter({ visible: true });
/** A button by its whole name, whichever of the header and the dock shows. */
const visible = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });

/** Noa fills the kitchen's opening and closes it, ten minutes back. */
async function closedByNoa() {
  await setDemoListItem(NOA.e164, OPENING, FRIDGE, { reading: 30 });
  await setDemoListItem(NOA.e164, OPENING, FREEZER, { reading: -19 });
  await setDemoListItem(NOA.e164, OPENING, SURFACES, { checked: true });
  await finishDemoList(NOA.e164, OPENING);
  await backdateDemoListFinish(OPENING, 10);
  const [list] = await demoLists(OPENING);
  if (!list) throw new Error("The kitchen's opening list is not there");
  expect(list.status).toBe("finished");
  return list.id;
}

test.beforeEach(async () => {
  await resetDemoLists();
});

test.afterEach(async () => {
  await resetDemoLists();
});

test("whoever runs the lists fixes a closed list in place, and nobody is told", async ({
  page,
}) => {
  const id = await closedByNoa();
  const before = await demoListClose(OPENING);
  expect(before).toMatchObject({
    status: "finished",
    finishedBy: NOA.e164,
    fixed: false,
    fixes: 0,
    logged: 0,
  });

  await signIn(page, MANAGER);
  await page.goto(`/lists/${id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: OPENING }),
  ).toBeVisible();
  const main = page.getByRole("main");
  const hero = main.getByRole("region", { name: l.list.progressLabel });
  await expect(hero).toContainText(NOA_NAME);
  // Past Noa's five minutes: the fix, where opening it again was.
  await expect(visible(page, l.list.reopen)).toHaveCount(0);
  await visible(page, l.list.fix.action).click();

  // The list stays closed, as Noa closed it; opening it again is inside.
  const card = main.getByRole("region", { name: l.list.fix.title });
  await expect(card).toContainText(NOA_NAME);
  await expect(
    card.getByRole("button", { name: l.list.fix.reopenAll }),
  ).toBeVisible();
  await expect(card.getByText(l.list.fix.reopenHint)).toBeVisible();
  await expect(visible(page, l.list.finish)).toHaveCount(0);
  await expectCleanPage(page);

  // A required reading is changed, never emptied.
  const fridge = page.getByLabel(fill(l.list.readingOf, { label: FRIDGE }));
  await fridge.fill("");
  await fridge.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: l.list.failed.keepRequired }),
  ).toBeVisible();
  await expect(fridge).toHaveValue("30");
  expect((await demoListItem(OPENING, FRIDGE))?.reading).toBe(30);
  // A required tick taken back stays ticked, and nothing is sent.
  const surfaces = page.getByRole("checkbox", { name: SURFACES });
  await expect(surfaces).toBeChecked();
  const surfacesBefore = await demoListItem(OPENING, SURFACES);
  await surfaces.click();
  await expect(surfaces).toBeChecked();
  expect(await demoListItem(OPENING, SURFACES)).toEqual(surfacesBefore);

  // The typo fixed: saved at once, Shiran's fix, Noa's reading.
  await fridge.fill("3");
  await fridge.press("Enter");
  await expect
    .poll(async () => (await demoListItem(OPENING, FRIDGE))?.reading)
    .toBe(3);
  expect((await demoListItem(OPENING, FRIDGE))?.doneBy).toBe(NOA.e164);
  await expect(storyOf(page, FRIDGE).first()).toContainText(l.list.fix.item);
  await expect(storyOf(page, FRIDGE).first()).toContainText(SHIRAN_NAME);

  await visible(page, l.list.fix.done).click();
  await expect(
    page.getByRole("status").filter({ hasText: l.list.fix.saved }),
  ).toBeVisible();
  await expect(card).toHaveCount(0);
  // Read again: still Noa's close, now fixed, and the fix can start again,
  // the keyboard back on it.
  await expect(hero).toContainText(NOA_NAME);
  await expect(hero).toContainText(opening(l.card.fixed));
  await expect(visible(page, l.list.fix.action)).toBeVisible();
  await expect(visible(page, l.list.fix.action)).toBeFocused();
  await expect(storyOf(page, FRIDGE).first()).toContainText(l.list.fix.item);

  // Its story marks the fix, after Noa's reading.
  await storyOf(page, FRIDGE).first().click();
  const sheet = page.getByRole("dialog", { name: l.list.history.title });
  await expect(sheet).toContainText(l.list.fix.badge);
  await expect(sheet).toContainText(NOA_NAME);
  await expect(sheet).toContainText(SHIRAN_NAME);
  await expectCleanPage(page);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // The database: the same close, one fix in the history and in the log,
  // and no line to anyone.
  expect(await demoListClose(OPENING)).toMatchObject({
    status: "finished",
    finishedBy: NOA.e164,
    fixed: true,
    fixes: 1,
    logged: 1,
    lines: before?.lines,
  });

  // The manager's day: the list fixed, and its reading.
  await page.goto("/lists/today");
  await expect(
    main.getByText(opening(l.card.fixed)).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    main
      .getByText(new RegExp(`·\\s${literal(l.list.readings.fixed)}$`))
      .filter({ visible: true })
      .first(),
  ).toBeVisible();

  // The activity log: who fixed what, from and to.
  await page.goto("/manage/activity");
  await expect(
    main
      .getByText(
        fill(he.app.manage.activity.actions.lists.fix, {
          name: OPENING,
          label: FRIDGE,
        }),
      )
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("a worker reads the fix's marks and has no way to fix", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "one run is enough");
  const id = await closedByNoa();
  await fixDemoListItem(MANAGER.e164, OPENING, FRIDGE, { reading: 3 });

  await signIn(page, NOA);
  await page.goto(`/lists/${id}`);
  const main = page.getByRole("main");
  const hero = main.getByRole("region", { name: l.list.progressLabel });
  await expect(hero).toContainText(opening(l.card.fixed));
  await expect(visible(page, l.list.fix.action)).toHaveCount(0);
  await expect(visible(page, l.list.reopen)).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: l.list.finished }),
  ).toHaveCount(0);
  const story = storyOf(page, FRIDGE).first();
  await expect(story).toContainText(l.list.fix.item);
  await expect(story).toContainText(SHIRAN_NAME);
  await story.click();
  await expect(
    page.getByRole("dialog", { name: l.list.history.title }),
  ).toContainText(l.list.fix.badge);
  await expectCleanPage(page);
});

test("a list opened again while it was being fixed is filled from there", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one run is enough");
  const id = await closedByNoa();

  await signIn(page, MANAGER);
  await page.goto(`/lists/${id}`);
  await visible(page, l.list.fix.action).click();
  await expect(
    page.getByRole("main").getByRole("region", { name: l.list.fix.title }),
  ).toBeVisible();

  // Someone opens it again from another screen meanwhile.
  await reopenDemoList(MANAGER.e164, OPENING);
  const fridge = page.getByLabel(fill(l.list.readingOf, { label: FRIDGE }));
  await fridge.fill("3");
  await fridge.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: l.list.failed.reopened }),
  ).toBeVisible();
  // Filled now: the finish is back, and nothing was fixed.
  await expect(visible(page, l.list.finish)).toBeVisible();
  expect(await demoListClose(OPENING)).toMatchObject({
    status: "open",
    fixes: 0,
    logged: 0,
  });
  expect((await demoListItem(OPENING, FRIDGE))?.reading).toBe(30);
});

// The switch "תיקון רשימות שנסגרו" (L6b-2), on the same list: the demo
// restaurant's workers given it (as an owner would on /manage/roles; the
// roles spec drives that screen), Noa fixes the opening she closed, which
// reaches her, until the business's day after the close (fixHours, 24 by
// default), and never opens it again for everyone. Off again after each.
test.describe("fixing closed lists at view", () => {
  test.afterEach(async () => {
    await setDemoWorkersFix(false);
  });

  test("a worker given it fixes yesterday's list from 'עוד אפשר לתקן', and asks to have a required item done again", async ({
    page,
  }) => {
    await setDemoWorkersFix(true);
    const id = await closedByNoa();
    // It opened yesterday and closed ten minutes ago: no longer today's.
    await backdateDemoListOpening(OPENING, 24);

    await signIn(page, NOA);
    await page.goto("/lists");
    const main = page.getByRole("main");
    await expect(
      main
        .getByRole("heading", {
          level: 2,
          name: heT("app.lists.fixable.title", { count: 1 }),
        })
        .filter({ visible: true }),
    ).toHaveCount(1);
    // Its card, or its row, says until when.
    await expect(
      main.getByText(opening(l.list.fix.until)).filter({ visible: true }),
    ).toHaveCount(1);
    await expectCleanPage(page);
    await main
      .locator(`a[href="/lists/${id}"]`)
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: OPENING }),
    ).toBeVisible();

    // Until when, a day after the close; no way to open it for everyone.
    const hero = main.getByRole("region", { name: l.list.progressLabel });
    await expect(hero).toContainText(NOA_NAME);
    await expect(hero).toContainText(opening(l.list.fix.until));
    await expect(visible(page, l.list.reopen)).toHaveCount(0);
    await visible(page, l.list.fix.action).click();
    const card = main.getByRole("region", { name: l.list.fix.title });
    await expect(card).toContainText(NOA_NAME);
    await expect(
      card.getByRole("button", { name: l.list.fix.reopenAll }),
    ).toHaveCount(0);
    await expectCleanPage(page);

    // A required reading emptied: ask whoever runs the lists.
    const fridge = page.getByLabel(fill(l.list.readingOf, { label: FRIDGE }));
    await fridge.fill("");
    await fridge.press("Enter");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: l.list.failed.keepRequiredAsk }),
    ).toBeVisible();
    await expect(fridge).toHaveValue("30");

    await fridge.fill("3");
    await fridge.press("Enter");
    await expect
      .poll(async () => (await demoListItem(OPENING, FRIDGE))?.reading)
      .toBe(3);
    await visible(page, l.list.fix.done).click();
    await expect(
      page.getByRole("status").filter({ hasText: l.list.fix.saved }),
    ).toBeVisible();
    await expect(storyOf(page, FRIDGE).first()).toContainText(l.list.fix.item);
    await expect(storyOf(page, FRIDGE).first()).toContainText(NOA_NAME);
    expect(await demoListClose(OPENING)).toMatchObject({
      status: "finished",
      finishedBy: NOA.e164,
      fixed: true,
      fixes: 1,
      logged: 1,
    });
  });

  test("past the window there is no way to fix, and the list leaves 'עוד אפשר לתקן'", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "one run is enough");
    await setDemoWorkersFix(true);
    const id = await closedByNoa();
    // Opened yesterday and closed 25 hours ago: past the day.
    await backdateDemoListOpening(OPENING, 26);
    await backdateDemoListFinish(OPENING, 25 * 60);

    await signIn(page, NOA);
    await page.goto(`/lists/${id}`);
    const main = page.getByRole("main");
    const hero = main.getByRole("region", { name: l.list.progressLabel });
    await expect(hero).toContainText(NOA_NAME);
    await expect(hero).not.toContainText(opening(l.list.fix.until));
    // It says when the time ended, and who still fixes it.
    await expect(hero).toContainText(opening(l.list.fix.over));
    await expect(visible(page, l.list.fix.action)).toHaveCount(0);
    await page.goto("/lists");
    await expect(
      page.getByRole("heading", { level: 1, name: l.title }),
    ).toBeVisible();
    await expect(
      main.getByText(heT("app.lists.fixable.title", { count: 1 })),
    ).toHaveCount(0);
    // The database says why: the time is over.
    await expect(
      fixDemoListItem(NOA.e164, OPENING, FRIDGE, { reading: 3 }),
    ).rejects.toThrow(/time to fix the list is over/);
    expect((await demoListItem(OPENING, FRIDGE))?.reading).toBe(30);
  });
});
