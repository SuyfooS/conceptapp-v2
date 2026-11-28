import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { pastDrawing } from "./announcer";
import {
  countLoads,
  markBeforeRelease,
  noteBeforeLoad,
  pressAsBeforeRelease,
  statusWordsSeen,
  stillBeforeRelease,
  timesTold,
  watchStatusWords,
  wordsSaid,
} from "./release";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The other screens left open across a release (closing the pilot, PR 1b),
// on their design twins, as e2e/clock-release.spec.ts holds the clock: the
// press goes out with an action id the server doesn't have (e2e/release.ts),
// the page loads again once, its frame says the app was updated, once,
// through the page's announcer, and shows it once, nothing is sent again by
// itself, and a second such press within the minute says the screen's own
// failure rather than loading again. Sending a week's availability, a day
// changed first, which the page loaded puts back on the form, unsent, Send
// focused; ticking a list's item, the frame's note gone at the next press; a
// note typed on a list, which comes back to its field, unsaved and focused;
// and giving a shift away. Then the frame alone, its note left before the
// page loads: a screen that never says it put back what was typed leaves
// the press's own words, after a wait, and a press during that wait leaves
// nothing said over it.

const AVAILABILITY = "/design/shell/schedule/availability";
const LIST = "/design/shell/lists/list-kitchen-opening";
const SHIFTS = "/design/shell/schedule/shifts";
const HOME = "/design/shell";
/** The design twins' frame: Shiran, in the demo business (`pressedBy`). */
const SHIRAN = "shiran:demo";
/** How long the frame waits for a screen to say it put back (app/stale-build.ts). */
const PUT_BACK_WAIT_MS = 5_000;
const ta = he.app.availability;
const u = he.app.updated;
// A day on the availability screen: a row on phones, a card from tablet up.
const dayButton = (page: Page, weekday: keyof typeof ta.weekdays) =>
  page.getByRole("button", {
    name: ta.dayName.replace("{day}", ta.weekdays[weekday]),
  });
/** The frame's toast while it shows `words`. */
const frameNote = (page: Page, words: string) =>
  page.getByRole("status").filter({ hasText: words });

/** The page as the frame loaded it again, with axe (accessibility, parts 1–9). */
async function expectCleanPage(page: Page) {
  // Metadata streams in after the body.
  await expect(page).toHaveTitle(/ConceptApp$/);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
}

/** Opens `path` as a page from the release before, watching what it says. */
async function openBeforeRelease(page: Page, path: string) {
  await watchStatusWords(page);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const loads = countLoads(page);
  const presses = await pressAsBeforeRelease(page, path);
  await markBeforeRelease(page);
  return { loads, presses };
}

/**
 * The frame's note on the page loaded: said once, through the announcer,
 * and shown once, in its toast, once the page has drawn and settled.
 */
async function expectToldOnce(page: Page, words: string) {
  await expect.poll(() => wordsSaid(page)).toContain(words);
  await pastDrawing(page);
  expect(await timesTold(page, words)).toEqual({ seen: 1, said: 1 });
}

/** The frame took its note, left before the page loaded: its wait starts. */
const noteTaken = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("stale-build-updated")),
    )
    .toBeNull();

test("availability sent from a page of the release before loads it again once, keeps the week as marked, and sends nothing again", async ({
  page,
}) => {
  const { loads, presses } = await openBeforeRelease(page, AVAILABILITY);
  // One Send at each width: floating until a desktop, on the hero there.
  const send = page.getByRole("button", { name: ta.submit });
  const failed = page.getByRole("alert").filter({ hasText: ta.errors.failed });
  const monday = dayButton(page, "mon");
  try {
    // Monday marked first: the week sent before had no hours on it.
    await expect(monday).toContainText(ta.noHours);
    await monday.click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: ta.sheet.done }).click();
    await expect(sheet).toHaveCount(0);
    await expect(monday).not.toContainText(ta.noHours);
    const marked = await monday.textContent();

    const loaded = page.waitForEvent("load");
    await send.click();
    await loaded;

    // A whole new page, at the same address, that says so once in the
    // availability's words: nothing was sent, Monday is back on the form as
    // marked, Send, to press again, has the focus, and the form says no
    // failure of its own.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${AVAILABILITY}$`));
    await expectToldOnce(page, u.availability);
    await expect(monday).toHaveText(marked ?? "");
    await expect(failed).toHaveCount(0);
    await expect(send).toBeEnabled();
    await expect(send).toBeFocused();
    // Nothing sent by itself: every send from this tab is counted here.
    expect(presses.sent).toHaveLength(1);
    await expectCleanPage(page);

    // Sent again within the minute, the page still from the release before:
    // the form's own failure, its days still on it, and no second reload.
    await send.click();
    await expect(failed).toBeVisible();
    await expect(send).toBeEnabled();
    await expect(monday).toHaveText(marked ?? "");
    expect(presses.sent).toHaveLength(2);
    expect(loads.count).toBe(1);
  } finally {
    await presses.stop();
  }
});

test("a list's item ticked on a page of the release before loads it again once, says the app was updated, and ticks nothing by itself", async ({
  page,
}) => {
  const { loads, presses } = await openBeforeRelease(page, LIST);
  const preps = page
    .getByRole("main")
    .getByRole("checkbox", { name: "הכנות לפי רשימת ההכנות" });
  await expect(preps).not.toBeChecked();
  try {
    const loaded = page.waitForEvent("load");
    await preps.click();
    await loaded;

    // The page loaded shows the item as the list has it: not ticked, for the
    // person to tick again. Said once, by the frame, and shown once.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${LIST}$`));
    await expectToldOnce(page, u.toast);
    await expect(preps).not.toBeChecked();
    // Once the page loaded has drawn and settled: nothing was sent by itself,
    // so no change of its own failed either.
    expect(presses.sent).toHaveLength(1);
    expect(await statusWordsSeen(page)).not.toContain(
      he.app.lists.list.failed.failed,
    );

    // Ticked again within the minute, while the frame's note still shows
    // (for 4 seconds): it goes at the press, well before its time, as the
    // list says its own words for a change that didn't save, put back, with
    // no second reload.
    await expect(frameNote(page, u.toast)).toBeVisible();
    await preps.click();
    await expect(frameNote(page, u.toast)).toHaveCount(0, { timeout: 1_500 });
    await expect
      .poll(() => statusWordsSeen(page))
      .toContain(he.app.lists.list.failed.failed);
    await expect(preps).not.toBeChecked();
    expect(presses.sent).toHaveLength(2);
    expect(loads.count).toBe(1);
    await expectCleanPage(page);
  } finally {
    await presses.stop();
  }
});

test("a note typed on a list on a page of the release before comes back to its field after the page loads again, unsaved", async ({
  page,
}) => {
  const words = "שמן זית וקמח";
  const { loads, presses } = await openBeforeRelease(page, LIST);
  const missing = page
    .getByRole("main")
    .getByRole("textbox", { name: "מה חסר במטבח" });
  try {
    await missing.fill(words);
    // Left, it saves: the save meets the release before.
    const loaded = page.waitForEvent("load");
    await missing.blur();
    await loaded;

    // The page loaded has the note back in its field, with the focus, saved
    // by nobody, and says what was typed wasn't saved, once.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${LIST}$`));
    await expectToldOnce(page, u.typed);
    await expect(missing).toHaveValue(words);
    await expect(missing).toBeFocused();
    // Nothing sent by itself, the page loaded drawn and settled: a note
    // saves as it is left, and it wasn't.
    expect(presses.sent).toHaveLength(1);
    expect(loads.count).toBe(1);
    expect(await statusWordsSeen(page)).not.toContain(u.toast);
    await expectCleanPage(page);

    // Left again within the minute, the page still from the release before:
    // the list's own words for a change that didn't save, and no second
    // reload.
    await missing.focus();
    await missing.blur();
    await expect
      .poll(() => statusWordsSeen(page))
      .toContain(he.app.lists.list.failed.failed);
    expect(presses.sent).toHaveLength(2);
    expect(loads.count).toBe(1);
  } finally {
    await presses.stop();
  }
});

test("a shift given away from a page of the release before loads it again once, says the app was updated, and gives nothing away by itself", async ({
  page,
}) => {
  const sw = he.app.shifts.swap;
  const evening = heT("app.shifts.shift", {
    name: "ערב",
    day: he.app.availability.weekdays.tue,
    date: "3.11",
  });
  const { loads, presses } = await openBeforeRelease(page, SHIFTS);
  const hero = page.getByRole("region", { name: evening, exact: true });
  const give = hero.getByRole("button", {
    name: `${sw.buttons.give}, ${evening}`,
  });
  const sheet = page.getByRole("dialog");
  const send = sheet.getByRole("button", {
    name: `${sw.buttons.give}, ${evening}`,
  });
  const failed = sheet
    .getByRole("alert")
    .filter({ hasText: sw.failures.failed });
  try {
    await give.click();
    const loaded = page.waitForEvent("load");
    await send.click();
    await loaded;

    // A whole new page, its sheet closed and the shift still the person's:
    // nothing was asked, and nothing says it was.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${SHIFTS}$`));
    await expectToldOnce(page, u.toast);
    await expect(sheet).toHaveCount(0);
    await expect(give).toBeVisible();
    expect(await statusWordsSeen(page)).not.toContain(sw.open);
    expect(presses.sent).toHaveLength(1);
    await expectCleanPage(page);

    // Given away again within the minute: the step's own failure, under its
    // button in the sheet, and no second reload.
    await give.click();
    await send.click();
    await expect(failed).toBeVisible();
    await expect(sheet).toBeVisible();
    expect(presses.sent).toHaveLength(2);
    expect(loads.count).toBe(1);
  } finally {
    await presses.stop();
  }
});

// The frame alone, its note left before the page loads as a press would: in
// a screen's words ("typed") on a page with no screen that takes anything
// back, so none says it put it back. The frame waits for one a while
// (PUT_BACK_WAIT_MS), then says the press's own words, once.
test("the frame says the press's own words when no screen says it put back what was typed", async ({
  page,
}) => {
  await watchStatusWords(page);
  await noteBeforeLoad(page, HOME, SHIRAN, "typed");
  await page.goto(HOME);
  await noteTaken(page);
  // Waiting for the screen: nothing said yet, in either words.
  await page.waitForTimeout(PUT_BACK_WAIT_MS - 1_500);
  expect(await timesTold(page, u.toast)).toEqual({ seen: 0, said: 0 });
  expect(await timesTold(page, u.typed)).toEqual({ seen: 0, said: 0 });
  // Its wait over: the press's own words, once; never the screen's.
  await expect
    .poll(() => wordsSaid(page), { timeout: 5_000 })
    .toContain(u.toast);
  await pastDrawing(page);
  expect(await timesTold(page, u.toast)).toEqual({ seen: 1, said: 1 });
  expect(await timesTold(page, u.typed)).toEqual({ seen: 0, said: 0 });
  await expectCleanPage(page);
});

// The same, with a press during the wait: the person is making the press
// again, and that press's screen says what came of it, so the frame says
// nothing over it, then or after its wait.
test("the frame says nothing once the person pressed during its wait", async ({
  page,
}) => {
  await watchStatusWords(page);
  await noteBeforeLoad(page, HOME, SHIRAN, "typed");
  await page.goto(HOME);
  await noteTaken(page);
  await page.getByRole("heading", { level: 1 }).first().click();
  await page.waitForTimeout(PUT_BACK_WAIT_MS);
  await pastDrawing(page);
  expect(await timesTold(page, u.toast)).toEqual({ seen: 0, said: 0 });
  expect(await timesTold(page, u.typed)).toEqual({ seen: 0, said: 0 });
});
