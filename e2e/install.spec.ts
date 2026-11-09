import { expect, test } from "@playwright/test";

// Install as an app: a phone finds the manifest, its icons and the iPhone
// home-screen settings on any page, signed in or not.
test("a phone can put the app on its home screen", async ({
  page,
  request,
}) => {
  await page.goto("/enter");
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestHref).toBeTruthy();
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(
    page.locator('meta[name="mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");

  const response = await request.get(manifestHref ?? "");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "ConceptApp",
    start_url: "/home",
    display: "standalone",
    dir: "rtl",
    lang: "he",
  });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
    "192x192",
    "512x512",
    "512x512",
  ]);
  for (const icon of manifest.icons as { src: string }[]) {
    const file = await request.get(icon.src);
    expect(file.ok(), icon.src).toBe(true);
    expect(file.headers()["content-type"]).toBe("image/png");
  }
});
