import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import {
  countLoads,
  markBeforeRelease,
  pressAsBeforeRelease,
  statusWordsSeen,
  stillBeforeRelease,
  watchStatusWords,
} from "./release";
import { heT } from "./t";
import { expect, type Page, test } from "./test";

// The other screens left open across a release (closing the pilot, PR 1b),
// on their design twins, as e2e/clock-release.spec.ts holds the clock: the
// press goes out with an action id the server doesn't have (e2e/release.ts),
// the page loads again once, its frame says the app was updated, nothing is
// sent again by itself, and a second such press within the minute says the
// screen's own failure rather than loading again. Sending a week's
// availability, ticking a list's item, and giving a shift away.

const AVAILABILITY = "/design/shell/schedule/availability";
const LIST = "/design/shell/lists/list-kitchen-opening";
const SHIFTS = "/design/shell/schedule/shifts";
const ta = he.app.availability;

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

test("availability sent from a page of the release before loads it again once, says the app was updated, and sends nothing again", async ({
  page,
}) => {
  const { loads, presses } = await openBeforeRelease(page, AVAILABILITY);
  // One Send at each width: floating until a desktop, on the hero there.
  const send = page.getByRole("button", { name: ta.submit });
  const failed = page.getByRole("alert").filter({ hasText: ta.errors.failed });
  try {
    const loaded = page.waitForEvent("load");
    await send.click();
    await loaded;

    // A whole new page, at the same address, that says so once: nothing was
    // sent, and the form says no failure of its own.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${AVAILABILITY}$`));
    await expect
      .poll(() => statusWordsSeen(page))
      .toContain(he.app.updated.toast);
    await expect(failed).toHaveCount(0);
    await expect(send).toBeEnabled();
    expect(presses.sent).toHaveLength(1);
    await expectCleanPage(page);

    // Sent again within the minute, the page still from the release before:
    // the form's own failure, its days still on it, and no second reload.
    await send.click();
    await expect(failed).toBeVisible();
    await expect(send).toBeEnabled();
    expect(presses.sent).toHaveLength(2);
    expect(loads.count).toBe(1);
    expect(await statusWordsSeen(page)).not.toContain(ta.saved);
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
    // person to tick again. Said once, by the frame.
    expect(await stillBeforeRelease(page)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`${LIST}$`));
    await expect
      .poll(() => statusWordsSeen(page))
      .toContain(he.app.updated.toast);
    await expect(preps).not.toBeChecked();
    expect(presses.sent).toHaveLength(1);
    expect(await statusWordsSeen(page)).not.toContain(
      he.app.lists.list.failed.failed,
    );
    await expectCleanPage(page);

    // Ticked again within the minute: put back, with the list's own words
    // for a change that didn't save, and no second reload.
    await preps.click();
    await expect
      .poll(() => statusWordsSeen(page))
      .toContain(he.app.lists.list.failed.failed);
    await expect(preps).not.toBeChecked();
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
    await expect
      .poll(() => statusWordsSeen(page))
      .toContain(he.app.updated.toast);
    await expect(sheet).toHaveCount(0);
    await expect(give).toBeVisible();
    expect(await statusWordsSeen(page)).not.toContain(sw.open);
    expect(presses.sent).toHaveLength(1);

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
