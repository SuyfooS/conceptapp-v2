import AxeBuilder from "@axe-core/playwright";
import en from "../messages/en.json" with { type: "json" };
import he from "../messages/he.json" with { type: "json" };
import { expect, type Page, test } from "./test";

// A browser older than the app needs says so (closing the pilot, PR 26): the
// root layout draws the notice on every page, first after the announcer, and
// only a rule in app/globals.css shows it, where relative colours are missing
// (Chrome 119, Safari 16.4, Firefox 128; its comment says why that is the
// floor), with no script. The Chromium these tests run is newer, so here it
// stays hidden on every page, signed out and in; the rule is then taken from
// the stylesheet as served and applied as such a browser applies it, to see
// the notice at the top, above the page's fixed bars, readable, and the page
// still there under it. The gallery shows it by its prop. Unit and tooling
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

test("the server sends the notice in the page itself, before any script", async ({
  request,
}) => {
  for (const path of ["/sign-in", "/enter"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).toContain("data-old-browser");
    expect(html, path).toContain(w.title);
  }
});

test("in a browser that has what the app needs, the notice stays hidden on every page signed out", async ({
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
  await expect(shown.locator("strong")).toHaveText(
    [w.android, w.iphone].map((line) => /<b>(.*?)<\/b>/.exec(line)?.[1] ?? ""),
  );
  const { violations } = await new AxeBuilder({ page })
    .include("main [data-old-browser]")
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await page
    .getByRole("button", { name: he.design.languages.en, exact: true })
    .click();
  const english = main.getByRole("region", { name: en.app.oldBrowser.title });
  await expect(english).toBeVisible();
  await expect(english).toContainText(en.app.oldBrowser.cantUpdate);
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const path of ["/sign-in", "/design/shell"]) {
      test(`${path}: where relative colours are missing, the notice is at the top, above the bars, and the page still works`, async ({
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

        // At the top of the page, and nothing fixed is drawn over it: the
        // desktop's sidebar takes the pointer, so it would be the element
        // found. The floating title and its fade take none, so they are
        // passed through here; they sit at z-30 and z-20, under its z-40.
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
          return points
            .filter(([x, y]) => !root.contains(document.elementFromPoint(x, y)))
            .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`);
        });
        expect(covered).toEqual([]);

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
