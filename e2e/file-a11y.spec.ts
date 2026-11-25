import AxeBuilder from "@axe-core/playwright";
import { FILE_TABS_TWIN_CHANNEL } from "../app/(app)/team/[person]/file/file-tabs";
import he from "../messages/he.json" with { type: "json" };
import {
  announcer,
  focusWhenSaid,
  heardSoFar,
  noteFocusWhenSaid,
  pastDrawing,
  saidSince,
} from "./announcer";
import { CAPTCHA_FRAME } from "./captcha";
import { hearFileCheck } from "./file-watch";
import { expect, type Page, test } from "./test";

// Accessibility, part 9, on the hiring file's twin (/design/shell/team/noa
// /file): a minute before the file locks for want of activity, the person
// is told, with "להשאיר פתוח"; a focus the person moves (by the keyboard,
// or a desktop screen reader that moves the system focus) is activity, one
// the page puts back from nowhere is not. A phone's screen reader moves no
// focus, so there the warning is what keeps a reader's file open. As the
// warning goes with the focus, the focus lands on a title, which an Enter
// meant for "להשאיר פתוח" can't press. The twin's code is 123456, it keeps
// nothing, and its server answers open; that the file still locks with
// nobody there is the watch's unit tests' (open-watch.test.ts), on a server
// of their own.

const hf = he.app.team.file;

/** Nothing has the focus: the page's body has it. */
const focusNowhere = (page: Page) =>
  page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });

test("the file twin warns a minute before it locks, and 'להשאיר פתוח' or a focus the person moves keeps it open", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const polite = announcer(page, "polite");
  await page.clock.install();
  await page.goto("/design/shell/team/noa/file");
  await page.waitForLoadState("networkidle");
  // The file's own check as it opens, answered before the clock moves on.
  const checked = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await page.getByRole("button", { name: hf.duties.confirm }).click();
  const boxes = page.getByLabel(hf.code.label);
  await expect(boxes).toBeVisible();
  await boxes.fill("123456");
  await expect(page).toHaveURL(/\/design\/shell\/team\/noa\/file\?state=open$/);
  await checked();

  const warning = page.getByRole("alert").filter({ hasText: hf.idle.warning });
  const keep = page.getByRole("button", {
    name: hf.idle.keepOpen,
    exact: true,
  });
  const identity = page.getByRole("region", { name: hf.sections.identity });
  const show = page
    .getByRole("region", { name: hf.sections.bank })
    .getByRole("button", { name: he.app.file.masked.show });
  await expect(warning).toHaveCount(0);

  // A minute before its quarter of an hour ends: an alert, said at once,
  // with the way to keep it open, the file still there. The alert names the
  // button and where it is, and describes it.
  await focusNowhere(page);
  await page.clock.fastForward("14:01");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(hf.idle.keepOpen);
  await expect(keep).toBeVisible();
  await expect(keep).toHaveAccessibleDescription(hf.idle.warning);
  await expect(identity).toBeVisible();
  // Clean with the warning up (Cloudflare's box, if any, isn't the app's).
  const { violations } = await new AxeBuilder({ page })
    .exclude(CAPTCHA_FRAME)
    .analyze();
  expect(
    violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // Pressed as a screen reader presses it: a click, with no finger and no
  // key, which the file's own activity never hears.
  const kept = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await heardSoFar(polite);
  await keep.dispatchEvent("click");
  await kept();
  await expect(warning).toHaveCount(0);
  await expect(keep).toHaveCount(0);
  await expect(saidSince(polite, hf.idle.kept)).toHaveCount(1);
  await expect(identity).toBeVisible();

  // A focus put on the page from nowhere moved nothing of the person's: the
  // warning stays, and the server isn't asked.
  let asked = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined
    ) {
      asked += 1;
    }
  });
  await focusNowhere(page);
  await show.focus();
  await page.clock.fastForward("14:01");
  await expect(warning).toBeVisible();
  await focusNowhere(page);
  await show.focus();
  await pastDrawing(page);
  await expect(warning).toBeVisible();
  expect(asked).toBe(0);

  // The focus moved from "הצגה" to "להשאיר פתוח" with no key the page hears
  // (a desktop screen reader moving the system focus): the person moved it,
  // so the file stays open. As the warning goes, the focus lands on the
  // title of the part it came from, never on "הצגה", which an Enter meant
  // for "להשאיר פתוח" would press; then it is said, after the focus landed
  // (a focus that moves after a polite line cuts it off).
  const main = page.getByRole("main");
  const bankTitle = main.getByRole("heading", {
    name: hf.sections.bank,
    exact: true,
  });
  const moved = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await heardSoFar(polite);
  await noteFocusWhenSaid(page, hf.idle.kept, "h2", hf.sections.bank);
  await keep.focus();
  await moved();
  await expect(warning).toHaveCount(0);
  await expect(bankTitle).toBeFocused();
  await expect(saidSince(polite, hf.idle.kept)).toHaveCount(1);
  await expect.poll(() => focusWhenSaid(page)).toBe(true);
  expect(asked).toBeGreaterThan(0);

  // From "נעילת התיק", the file's last control, by Tab: the key is
  // activity, so the warning goes as its answer comes, the focus on
  // "להשאיר פתוח". The focus lands on the title above "נעילת התיק", and the
  // Enter meant for "להשאיר פתוח" presses nothing there: the file stays
  // open, and the step-up stays.
  const lock = main.getByRole("button", { name: hf.lock.action, exact: true });
  const historyTitle = main.getByRole("heading", {
    name: hf.history.title,
    exact: true,
  });
  await focusNowhere(page);
  await lock.focus();
  await page.clock.fastForward("14:01");
  await expect(warning).toBeVisible();
  const tabbed = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await heardSoFar(polite);
  await noteFocusWhenSaid(page, hf.idle.kept, "h2", hf.history.title);
  await page.keyboard.press("Tab");
  await tabbed();
  await expect(warning).toHaveCount(0);
  await expect(historyTitle).toBeFocused();
  await expect(saidSince(polite, hf.idle.kept)).toHaveCount(1);
  await expect.poll(() => focusWhenSaid(page)).toBe(true);
  await page.keyboard.press("Enter");
  await pastDrawing(page);
  await expect(page).toHaveURL(/\/design\/shell\/team\/noa\/file\?state=open$/);
  await expect(main.getByText(hf.locked.title)).toHaveCount(0);
  await expect(identity).toBeVisible();
  await expect(historyTitle).toBeFocused();
});

// A focus put on "להשאיר פתוח" from nowhere (a desktop screen reader's
// first move, the page's body before it) is no activity: the quarter of an
// hour ends with the focus on it. The file is held while the server is
// asked, and the warning goes with it; the focus waits for the answer
// instead of landing on the page's title. The twin answers open: the file
// shows again with the focus on its first heading (it came from nowhere),
// and it is said that it stays open. (Answered closed, the locked card's
// title takes it: employee-file-holders.spec.ts.)
test("the file twin, its quarter of an hour ending with the focus on 'להשאיר פתוח', gives the focus back to the file as it shows again", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const polite = announcer(page, "polite");
  await page.clock.install();
  await page.goto("/design/shell/team/noa/file");
  await page.waitForLoadState("networkidle");
  const checked = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await page.getByRole("button", { name: hf.duties.confirm }).click();
  const boxes = page.getByLabel(hf.code.label);
  await expect(boxes).toBeVisible();
  await boxes.fill("123456");
  await expect(page).toHaveURL(/\/design\/shell\/team\/noa\/file\?state=open$/);
  await checked();

  const warning = page.getByRole("alert").filter({ hasText: hf.idle.warning });
  const keep = page.getByRole("button", {
    name: hf.idle.keepOpen,
    exact: true,
  });
  const first = page
    .getByRole("main")
    .getByRole("heading", { name: hf.sections.identity });
  await focusNowhere(page);
  await page.clock.fastForward("14:01");
  await expect(warning).toBeVisible();
  await keep.focus();
  await pastDrawing(page);
  await expect(warning).toBeVisible();

  await heardSoFar(polite);
  await noteFocusWhenSaid(page, hf.idle.kept, "h2", hf.sections.identity);
  await page.clock.fastForward("01:00");
  await expect(warning).toHaveCount(0);
  await expect(first).toBeVisible();
  await expect(first).toBeFocused();
  await expect(saidSince(polite, hf.idle.kept)).toHaveCount(1);
  await expect.poll(() => focusWhenSaid(page)).toBe(true);
});
