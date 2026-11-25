import AxeBuilder from "@axe-core/playwright";
import { FILE_TABS_TWIN_CHANNEL } from "../app/(app)/team/[person]/file/file-tabs";
import he from "../messages/he.json" with { type: "json" };
import { announcer, heardSoFar, pastDrawing, saidSince } from "./announcer";
import { CAPTCHA_FRAME } from "./captcha";
import { hearFileCheck } from "./file-watch";
import { expect, type Page, test } from "./test";

// Accessibility, part 9, on the hiring file's twin (/design/shell/team/noa
// /file): a minute before the file locks for want of activity, the person
// is told, with "להשאיר פתוח"; a focus the person moves (a screen reader's
// swipe, which presses nothing) is activity, one the page puts back from
// nowhere is not. The twin's code is 123456, it keeps nothing, and its
// server answers open; that the file still locks with nobody there is the
// watch's unit tests' (open-watch.test.ts), on a server of their own.

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
  // with the way to keep it open, the file still there.
  await focusNowhere(page);
  await page.clock.fastForward("14:01");
  await expect(warning).toBeVisible();
  await expect(keep).toBeVisible();
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

  // A screen reader's swipe from "הצגה" to "להשאיר פתוח": the person moved
  // the focus, so the file stays open; the focus goes back where it came
  // from as the warning goes, and then it is said.
  const moved = await hearFileCheck(page, FILE_TABS_TWIN_CHANNEL);
  await heardSoFar(polite);
  await keep.focus();
  await moved();
  await expect(warning).toHaveCount(0);
  await expect(show).toBeFocused();
  await expect(saidSince(polite, hf.idle.kept)).toHaveCount(1);
  expect(asked).toBeGreaterThan(0);
});
