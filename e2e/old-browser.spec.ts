import AxeBuilder from "@axe-core/playwright";
import en from "../messages/en.json" with { type: "json" };
import he from "../messages/he.json" with { type: "json" };
import { expect, type Page, test } from "./test";

// A browser older than the app needs says so (closing the pilot, PR 26): the
// root layout draws the notice on every page, first after the announcer, and
// only a rule in app/globals.css shows it, where relative colours are missing
// (Chrome 119, Safari 16.4, Firefox 128; its comment says why that is the
// floor), with no script. The Chromium these tests run is newer, so here it
// stays hidden on every page, signed out and in, and the CSS served has no
// :dir(), which the floor counts on; the rule is then taken from
// the stylesheet as served and applied as such a browser applies it, to see
// the notice at the top, with nothing drawn over it, readable, the page still
// there under it and its bars still taking the press, a short phone's tab bar
// over it too. The gallery shows it by its prop. Unit and tooling
// tests: packages/ui/old-browser-notice.test.ts, tooling/old-browser.test.ts.

const w = he.app.oldBrowser;
const e = he.auth.enter;

/** The pages with no sign-in, from every route group that has one. */
const SIGNED_OUT = [
  "/enter",
  "/sign-in",
  // An invite that leads nowhere: the join screen with no data.
  `/join/${"x".repeat(43)}`,
  // The clock station, on a device that isn't one.
  "/station",
  "/design",
  // The app's frame, on its demo.
  "/design/shell",
];

/** The notice the root layout draws, right in the body. */
const pageNotice = (page: Page) => page.locator("body > [data-old-browser]");

/** The page's own title, once its streamed part is in. */
const pageTitle = (page: Page) =>
  page.getByRole("heading", { level: 1 }).filter({ visible: true }).first();

/**
 * The first link of the main navigation in sight: the desktop's sidebar, or
 * the tab bar below that width.
 */
const firstTab = (page: Page) =>
  page
    .getByRole("navigation", { name: he.ui.appShell.mainNav, exact: true })
    .filter({ visible: true })
    .getByRole("link")
    .first();

/**
 * The rule that shows the notice, as the build served it, applied with no
 * condition, as a browser without relative colours applies it: its body goes
 * on the page in a style of its own, outside any layer as the rule is.
 * Returns the rule's condition, or null when no rule shows the notice.
 */
async function showAsAnOldBrowser(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSSupportsRule)) continue;
        const inner = Array.from(rule.cssRules);
        const showsIt = inner.some(
          (r) =>
            r instanceof CSSStyleRule &&
            r.selectorText === "[data-old-browser]",
        );
        if (!showsIt) continue;
        const style = document.createElement("style");
        style.textContent = inner.map((r) => r.cssText).join("\n");
        document.head.append(style);
        return rule.conditionText;
      }
    }
    return null;
  });
}

/**
 * The served CSS's rules that still use :dir(), which Chrome 119 lacks. The
 * floor counts on none: the build's targets turn every rtl:/ltr: into
 * :lang() (app/globals.css). Should the floor ever move to :dir(), its
 * condition names it: this check goes then, and the condition's below moves.
 */
async function dirRules(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.styleSheets).flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .map((rule) => rule.cssText)
          .filter((text) => text.includes(":dir("));
      } catch {
        return [];
      }
    }),
  );
}

/** `text` matched as it is, inside a pattern. */
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function expectAccessible(page: Page) {
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

test("the server sends the notice in the page's markup, so it shows with no script", async ({
  request,
}) => {
  // Every word of the app is in each page's scripts too (the intl provider
  // passes them all), and so is the notice's attribute: the markup is read
  // without them, and the title must be inside the notice's own card.
  const inTheNotice = new RegExp(
    `<div data-old-browser=""[^>]*>(?:(?!</section>)[\\s\\S])*?${literally(w.title)}`,
  );
  for (const path of ["/sign-in", "/enter"]) {
    const html = await (await request.get(path)).text();
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(markup, path).toMatch(inTheNotice);
  }
});

test("in a browser that has what the app needs, the notice stays hidden on every page signed out, and the CSS has no :dir()", async ({
  page,
}) => {
  for (const path of SIGNED_OUT) {
    await page.goto(path);
    await expect(pageTitle(page), path).toBeVisible();
    expect(
      await page.evaluate(() => CSS.supports("color", "rgb(from red r g b)")),
      path,
    ).toBe(true);
    const notice = pageNotice(page);
    await expect(notice, path).toHaveCount(1);
    await expect(notice, path).toBeHidden();
    await expect(notice, path).toContainText(w.title);
    expect(await dirRules(page), path).toEqual([]);
  }
});

test("signed in, inside the app's frame, it stays hidden too", async ({
  page,
}) => {
  await page.goto("/enter");
  await page
    .getByRole("region", { name: e.businesses.restaurant.name })
    .getByRole("button", { name: new RegExp(e.people.worker.name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(pageTitle(page)).toBeVisible();
  await expect(pageNotice(page)).toHaveCount(1);
  await expect(pageNotice(page)).toBeHidden();
  expect(await dirRules(page)).toEqual([]);
});

test("the gallery shows it by its prop, in Hebrew and English, while the page's own stays hidden", async ({
  page,
}) => {
  await page.goto("/design");
  await expect(pageTitle(page)).toBeVisible();
  await expect(pageNotice(page)).toBeHidden();
  const main = page.getByRole("main");
  const shown = main.getByRole("region", { name: w.title });
  await expect(shown).toBeVisible();
  for (const line of [w.cantUpdate, w.tryAnyway]) {
    await expect(shown).toContainText(line);
  }
  // The platforms in bold, as the words mark them.
  const bold = (lines: string[]) =>
    lines.map((line) => /<b>(.*?)<\/b>/.exec(line)?.[1] ?? "");
  await expect(shown.locator("strong")).toHaveText(bold([w.android, w.iphone]));
  const axeOnIt = async () =>
    (
      await new AxeBuilder({ page })
        .include("main [data-old-browser]")
        .analyze()
    ).violations.map((v) => v.id);
  expect(await axeOnIt()).toEqual([]);

  // In English, left to right, the same: its lines, its bold, axe.
  await page
    .getByRole("button", { name: he.design.languages.en, exact: true })
    .click();
  const ew = en.app.oldBrowser;
  const english = main.getByRole("region", { name: ew.title });
  await expect(english).toBeVisible();
  for (const line of [ew.cantUpdate, ew.tryAnyway]) {
    await expect(english).toContainText(line);
  }
  await expect(english.locator("strong")).toHaveText(
    bold([ew.android, ew.iphone]),
  );
  expect(await axeOnIt()).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const path of ["/sign-in", "/design/shell"]) {
      test(`${path}: where relative colours are missing, the notice is at the top, nothing is drawn over it, and the page still works`, async ({
        page,
      }) => {
        await page.goto(path);
        await expect(pageTitle(page)).toBeVisible();
        // The rule survived the build as written, outside any layer.
        expect(await showAsAnOldBrowser(page)).toMatch(
          /^not \(color: ?rgb\(from red r g b\)\)$/,
        );
        const notice = pageNotice(page);
        await expect(notice).toBeVisible();
        const region = notice.getByRole("region", { name: w.title });
        await expect(region).toBeVisible();
        for (const line of [w.cantUpdate, w.tryAnyway]) {
          await expect(region).toContainText(line);
        }

        // At the top of the page, and nothing that is drawn lies over it.
        // It has no z-index, so a fixed bar that met it would be drawn over
        // it: at the top none does (the desktop's sidebar is beside it, the
        // tab bar far below), and the floating title and its fade, which
        // would, stay see-through until the header has scrolled away. So no
        // point of it is another element's, and no fixed element that can
        // be seen meets it, those that take no pointer included.
        const box = await region.boundingBox();
        expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(48);
        const covered = await notice.evaluate((root) => {
          const r = root.querySelector("section")?.getBoundingClientRect();
          if (!r) return ["no section"];
          const points: [number, number][] = [
            [r.left + 28, r.top + 28],
            [r.right - 28, r.top + 28],
            [r.left + r.width / 2, r.top + r.height / 2],
            [r.left + 28, r.bottom - 28],
            [r.right - 28, r.bottom - 28],
          ];
          const taken = points
            .filter(([x, y]) => !root.contains(document.elementFromPoint(x, y)))
            .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`);
          const seen = (element: Element) => {
            if (getComputedStyle(element).visibility !== "visible") {
              return false;
            }
            for (let at: Element | null = element; at; at = at.parentElement) {
              if (getComputedStyle(at).opacity === "0") return false;
            }
            return true;
          };
          const over = Array.from(document.body.querySelectorAll("*"))
            .filter(
              (element) =>
                !root.contains(element) &&
                getComputedStyle(element).position === "fixed" &&
                seen(element),
            )
            .filter((element) => {
              const b = element.getBoundingClientRect();
              return (
                b.width > 0 &&
                b.height > 0 &&
                b.left < r.right &&
                b.right > r.left &&
                b.top < r.bottom &&
                b.bottom > r.top
              );
            })
            .map((element) => element.outerHTML.slice(0, 120));
          return [...taken, ...over];
        });
        expect(covered).toEqual([]);

        // And what lies beside it still takes the press: the desktop's
        // sidebar, whose first links sit level with it, or the tab bar. A
        // trial press fails when something else is under the link's middle.
        if (path === "/design/shell") {
          await firstTab(page).click({ trial: true });
        }

        // It never blocks the page: the page is all still there, under it.
        await expect(pageTitle(page)).toBeVisible();
        const below = await pageTitle(page).boundingBox();
        expect(below?.y ?? 0).toBeGreaterThanOrEqual(
          (box?.y ?? 0) + (box?.height ?? 0),
        );
        await expectAccessible(page);
      });
    }
  });
}

test("on a phone too short for both, the tab bar is drawn over the notice and still takes the press", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "A phone's tab bar, once.");
  await page.goto("/design/shell");
  await expect(pageTitle(page)).toBeVisible();
  expect(await showAsAnOldBrowser(page)).not.toBeNull();
  const card = pageNotice(page).locator("section");
  await expect(card).toBeVisible();
  const tab = firstTab(page);
  await expect(tab).toBeVisible();

  // The screen made just short enough for the tab's middle to fall 24px
  // inside the card, as on a first iPhone SE with Safari's bars showing:
  // the bar keeps to the bottom, the card to the top.
  const size = page.viewportSize();
  const [cardBox, tabBox] = await Promise.all([
    card.boundingBox(),
    tab.boundingBox(),
  ]);
  if (!size || !cardBox || !tabBox) throw new Error("Not drawn");
  const middleFromBottom = size.height - (tabBox.y + tabBox.height / 2);
  await page.setViewportSize({
    width: size.width,
    height: Math.round(cardBox.y + cardBox.height - 24 + middleFromBottom),
  });
  const [cardNow, tabNow] = await Promise.all([
    card.boundingBox(),
    tab.boundingBox(),
  ]);
  expect((tabNow?.y ?? 0) + (tabNow?.height ?? 0) / 2).toBeLessThan(
    (cardNow?.y ?? 0) + (cardNow?.height ?? 0),
  );
  await tab.click({ trial: true });
});
