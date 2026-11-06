import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// The design system in both appearances, on the demos: no data, no sign-in.
const PAGES = [
  "/design",
  "/design/shell",
  "/design/shell/today/on-shift",
  "/design/shell/today/availability-missing",
  "/design/shell/today/owner",
  "/design/shell/today/worker",
  "/design/shell/today/not-published",
  "/design/shell/today/worker-not-published",
  "/design/shell/today/scheduling-off",
  "/design/shell/schedule/availability",
  "/design/shell/schedule/build",
  "/design/shell/schedule/shifts",
  "/design/shell/team",
];

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

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const path of PAGES) {
      test(`${path} is clean`, async ({ page }) => {
        await page.goto(path);
        await expectCleanPage(page);
      });
    }

    test("the page follows the device", async ({ page }) => {
      await page.goto("/design");
      const color = await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      );
      expect(color).toBe(
        colorScheme === "dark" ? "rgb(8, 9, 11)" : "rgb(238, 239, 242)",
      );
    });
  });
}
