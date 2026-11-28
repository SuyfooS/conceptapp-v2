import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { CAPTCHA_FRAME, captchaSettled } from "./captcha";
import {
  closeFirstDayBusiness,
  FIRST_DAY,
  firstDayEntries,
  firstDayRole,
  openFirstDayBusiness,
  publishFirstDayWeek,
} from "./db";
import { latestCode } from "./sms";
import { expect, type Page, type TestInfo, test } from "./test";

// A worker's first day (closing the pilot, PR 27), in a browser engine other
// than Chromium and as narrow as a phone with a big font draws it: only the
// projects `webkit-390` (WebKit as an iPhone 14 draws it) and `chromium-320`
// (Android with its largest font, about 320px wide) run this file, and the
// three sizes never do (playwright.config.ts). Each opens a real business of
// its own (e2e/db.ts, `FIRST_DAY`) and walks what a new worker meets, in
// order: the link the owner sent, the code by SMS (the local stack's dev
// hook), Today, the shifts they were given, the clock in and out, and their
// profile. Every screen is checked as the person meets it: axe, no sideways
// scroll, no words drawn past the screen's sides or cut short, and PR 26's
// "too old" notice hidden (e2e/old-browser.spec.ts checks that in Chromium
// alone, and this is the one run that draws pages in WebKit). The checks
// are soft, so one run lists every screen's findings, and each screen is
// photographed before them (test-results/, uploaded by CI). Linux WebKit is
// not a real iPhone: no iOS keyboard, home-screen app or push.

const j = he.auth.join;
const h = he.app.home;
const c = he.app.clock;
const ts = he.app.shifts;
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A sentence up to its first argument or tag. */
const before = (message: string) => message.split(/[<{]/)[0] ?? message;

const main = (page: Page) => page.getByRole("main");
/** The phone's floating tab bar (the desktop's sidebar is not drawn here). */
const tabBar = (page: Page) =>
  page.getByRole("navigation", { name: he.ui.appShell.mainNav });
/** The clock's title, as it says what the person is doing. */
const clockTitle = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });
/** The circle, by the last words of its name: the time may come before them. */
const circle = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`(^|\\s)${label}$`) });

/**
 * Words drawn past the screen's sides or cut short: each run of words on the
 * page (a text node, measured where it is drawn) that is shown, and reaches
 * past the left or right edge of the screen, or of the nearest box that clips
 * it (its own included, as `truncate` does). A row that scrolls sideways
 * (Today's tiles) holds words past its sides on purpose, so what is in one is
 * left out; so is what a screen reader alone reads (`sr-only`: a clipping box
 * 1px wide), and what a fixed box lifts out of the boxes around it. Each
 * finding says the element, its first words and where they end, so the log
 * alone says what to fix.
 */
async function cutOff(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const screen = document.documentElement.clientWidth;
    const found: string[] = [];
    const clips = (style: CSSStyleDeclaration) =>
      style.overflowX === "hidden" || style.overflowX === "clip";
    const scrolls = (at: Element, style: CSSStyleDeclaration) =>
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      at.scrollWidth > at.clientWidth + 1;
    const hidden = (element: Element) => {
      for (let at: Element | null = element; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        const box = at.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          Number(style.opacity) === 0 ||
          (clips(style) && (box.width <= 1 || box.height <= 1))
        ) {
          return true;
        }
      }
      return false;
    };
    const edges = (box: { left: number; right: number }) =>
      `${Math.round(box.left)} to ${Math.round(box.right)}`;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const words = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      const element = node.parentElement;
      if (!words || !element) continue;
      if (
        element.closest(
          "script, style, noscript, template, svg, select, option, textarea",
        ) ||
        hidden(element)
      ) {
        continue;
      }
      // The nearest box that clips the words, unless a row that scrolls
      // sideways or a fixed box comes first.
      let clipper: Element | null = null;
      let inRow = false;
      for (
        let at: Element | null = element;
        at && at !== document.documentElement;
        at = at.parentElement
      ) {
        const style = getComputedStyle(at);
        if (scrolls(at, style)) {
          inRow = true;
          break;
        }
        if (clips(style)) {
          clipper = at;
          break;
        }
        if (style.position === "fixed") break;
      }
      if (inRow) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()].filter(
        (line) => line.width > 0 && line.height > 0,
      );
      if (lines.length === 0) continue;
      const drawn = {
        left: Math.min(...lines.map((line) => line.left)),
        right: Math.max(...lines.map((line) => line.right)),
      };
      const name = `<${element.tagName.toLowerCase()}> "${words.slice(0, 40)}"`;
      if (drawn.left < -1 || drawn.right > screen + 1) {
        found.push(
          `${name} reaches past the screen: ${edges(drawn)} of ${screen}px`,
        );
        continue;
      }
      const box = clipper?.getBoundingClientRect();
      if (box && (drawn.left < box.left - 1 || drawn.right > box.right + 1)) {
        const what =
          clipper === element
            ? "its own box"
            : `<${clipper?.tagName.toLowerCase()}>`;
        found.push(
          `${name} is cut by ${what}: ${edges(drawn)}, the box ${edges(box)}`,
        );
      }
    }
    return found;
  });
}

/**
 * The screen as the person meets it, photographed first so the photo is
 * there whatever the checks find (`<step>.png` in test-results/): its title,
 * no axe violation (each failing element and axe's reason), no sideways
 * scroll, nothing drawn past the sides or cut short, and the notice for a
 * phone too old for the app hidden, as old-browser.spec.ts finds it. Soft,
 * so the test goes on to the next screen and one run lists them all.
 */
async function expectCleanPage(page: Page, testInfo: TestInfo, step: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${step}.png`),
    fullPage: true,
  });
  // Metadata streams in after the body (see new-business.spec.ts).
  await expect.soft(page, `${step}: the title`).toHaveTitle(/ConceptApp$/);
  // Cloudflare's "אני לא רובוט" box isn't the app's to fix.
  const { violations } = await new AxeBuilder({ page })
    .exclude(CAPTCHA_FRAME)
    .analyze();
  expect
    .soft(
      violations.flatMap((v) =>
        v.nodes.map(
          (n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`,
        ),
      ),
      `${step}: axe`,
    )
    .toEqual([]);
  const sideways = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect
    .soft(sideways, `${step}: the page scrolls sideways by this many px`)
    .toBeLessThanOrEqual(0);
  expect
    .soft(await cutOff(page), `${step}: words past the sides or cut short`)
    .toEqual([]);
  // Both engines here are current, with relative colours, so the rule that
  // shows the notice (app/globals.css) never applies: a current iPhone never
  // reads it.
  await expect
    .soft(
      page.locator("body > [data-old-browser]"),
      `${step}: the old-browser notice`,
    )
    .toBeHidden();
}

test("a new worker joins from the owner's link and gets through the first day", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const business = FIRST_DAY[testInfo.project.name as keyof typeof FIRST_DAY];
  if (!business) {
    throw new Error(
      `e2e/first-day.spec.ts runs in webkit-390 and chromium-320 only, not ${testInfo.project.name}`,
    );
  }
  const worker = business.worker;
  const firstName = worker.name.split(" ")[0] ?? worker.name;
  const token = await openFirstDayBusiness(business);
  try {
    await test.step("the link the owner sent", async () => {
      await page.goto(`/join/${token}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: j.title.replace("{business}", business.name),
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          j.welcomeNamed
            .replace("{name}", worker.name)
            .replace("{role}", j.roles.worker),
        ),
      ).toBeVisible();
      await expect(
        page.getByText(worker.e164.slice(-4), { exact: true }),
      ).toBeVisible();
      await captchaSettled(page);
      await expectCleanPage(page, testInfo, "1-join");
    });

    await test.step("the code by SMS", async () => {
      const since = new Date(Date.now() - 1000);
      await page.getByRole("button", { name: j.send }).click();
      const code = page.getByLabel(j.codeLabel);
      await expect(code).toBeVisible();
      await expectCleanPage(page, testInfo, "2-code");
      // The form sends itself once the last digit is in. Joining, the first
      // sign-in and Today's first drawing, on a runner's WebKit: more than
      // the 5 seconds a step usually gets.
      await code.fill(await latestCode(worker.e164, since));
      await expect(page).toHaveURL(/\/home$/, { timeout: 15_000 });
      expect(await firstDayRole(business)).toBe("worker");
    });

    const hero = page.getByRole("region", { name: h.hero.next });
    await test.step("Today, before the week is published", async () => {
      // The greeting follows the hour; the name does not.
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: new RegExp(`, ${literal(firstName)}$`),
        }),
      ).toBeVisible();
      await expect(hero).toContainText(h.hero.notPublished.title);
      await expectCleanPage(page, testInfo, "3-today");
    });

    // The owner publishes next week with them on its first morning.
    const week = await publishFirstDayWeek(business);
    await test.step("Today, with their first shift", async () => {
      await page.reload();
      await expect(hero).toContainText("בוקר");
      await expect(hero).toContainText("09:00");
      await expect(hero).toContainText("16:00");
      await expectCleanPage(page, testInfo, "4-today-shift");
    });

    await test.step("their shifts", async () => {
      await hero.getByRole("link", { name: h.hero.myShifts }).click();
      await expect(page).toHaveURL(/\/schedule\/shifts$/);
      const day = he.app.availability.weekdays[WEEKDAYS[week.weekday] ?? "sun"];
      const shift = page.getByRole("region", {
        name: new RegExp(
          `^${literal(before(ts.shift.replace("{name}", "בוקר").replace("{day}", day)))}`,
        ),
      });
      await expect(shift).toContainText(ts.hero.next);
      await expect(shift).toContainText("09:00");
      await expectCleanPage(page, testInfo, "5-my-shifts");
    });

    await test.step("the clock, from the tab bar", async () => {
      await page.goto("/home");
      await expect(hero).toContainText("בוקר");
      // The bar at its full size, as it is at the top of a page.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator("nav[data-tab-compact]")).toHaveCount(0);
      await tabBar(page).locator('a[href="/clock"]').click();
      await expect(page).toHaveURL(/\/clock$/);
      await expect(clockTitle(page, c.title.off)).toBeVisible();
      await expectCleanPage(page, testInfo, "6-clock");
    });

    await test.step("clocking in", async () => {
      await circle(page, c.circle.in).click();
      await expect(clockTitle(page, c.title.working)).toBeVisible();
      await expect
        .poll(() => firstDayEntries(business))
        .toEqual({
          open: 1,
          ended: 0,
        });
      await expectCleanPage(page, testInfo, "7-clock-working");
    });

    await test.step("clocking out", async () => {
      await circle(page, c.circle.out).click();
      await expect(clockTitle(page, c.title.off)).toBeVisible();
      // Leaving can be taken back for a while: the card says so.
      await expect(page.getByRole("button", { name: c.undo })).toBeVisible();
      await expect
        .poll(() => firstDayEntries(business))
        .toEqual({
          open: 0,
          ended: 1,
        });
      await expectCleanPage(page, testInfo, "8-clock-out");
    });

    await test.step("their profile, from Today", async () => {
      await page.goto("/home");
      await main(page)
        .getByRole("link", { name: he.app.me.open, exact: true })
        .click();
      await expect(page).toHaveURL(/\/me$/);
      // The name from the invite, as their own.
      await expect(
        page.getByRole("heading", { level: 1, name: worker.name }),
      ).toBeVisible();
      await expectCleanPage(page, testInfo, "9-me");
    });
  } finally {
    await closeFirstDayBusiness(business);
  }
});
