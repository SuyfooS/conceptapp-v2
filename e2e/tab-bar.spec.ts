import { expect, test } from "@playwright/test";

// The tab bar on the demo: it shrinks scrolling down, and only comes back after
// a real move up, so reading the page doesn't keep resizing it.
test("the tab bar stays shrunk through small moves, and its blur goes with it", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "The desktop has a sidebar.");
  void isMobile;
  await page.setViewportSize({ width: 390, height: 420 });
  await page.goto("/design/shell/schedule");
  await page.getByRole("heading", { level: 1 }).first().waitFor();

  const shrunk = page.locator("nav[data-tab-compact]");
  const fade = page.locator("[data-tab-fade]");
  const scrollTo = async (y: number) => {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
  };

  await expect(shrunk).toHaveCount(0);
  await expect(fade).toHaveCSS("opacity", "1");

  // Down: it shrinks, and the blur under it fades away.
  await scrollTo(500);
  await expect(shrunk).toHaveCount(1);
  await expect(fade).toHaveCSS("opacity", "0");

  // A small move up leaves it as it is, in steps as a finger would.
  await scrollTo(470);
  await scrollTo(440);
  await scrollTo(400);
  await expect(shrunk).toHaveCount(1);

  // Going down again starts the count over.
  await scrollTo(500);
  await scrollTo(400);
  await expect(shrunk).toHaveCount(1);

  // A real move up brings it back, with its blur.
  await scrollTo(350);
  await expect(shrunk).toHaveCount(0);
  await expect(fade).toHaveCSS("opacity", "1");

  // So does reaching the top of the page, however short the way.
  await scrollTo(0);
  await scrollTo(100);
  await expect(shrunk).toHaveCount(1);
  await scrollTo(30);
  await expect(shrunk).toHaveCount(0);
});
