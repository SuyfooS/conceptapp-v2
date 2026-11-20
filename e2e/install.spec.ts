import { expect, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

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

// The clock station on a tablet's home screen (#78 phase 5,
// docs/clock-station.md "במסך הבית"): /station links its own manifest in the
// app's place, so it opens the station itself, in full screen, either way up,
// within /station, with the app's icons. The app's pages keep the app's.
test("a tablet can put the clock station on its home screen, as the station", async ({
  page,
  request,
}) => {
  const words = he.station.manifest;
  const manifestPath = async () =>
    new URL(
      (await page.locator('link[rel="manifest"]').getAttribute("href")) ?? "",
      page.url(),
    ).pathname;

  await page.goto("/enter");
  expect(await manifestPath()).not.toBe("/station/manifest.webmanifest");

  // Signed out, with no station's cookie: the station says what it is for.
  await page.goto("/station");
  await expect(
    page.getByRole("heading", { level: 1, name: he.station.notStation.title }),
  ).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  expect(await manifestPath()).toBe("/station/manifest.webmanifest");
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", words.shortName);

  const response = await request.get("/station/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: words.name,
    short_name: words.shortName,
    id: "/station",
    start_url: "/station",
    scope: "/station",
    display: "fullscreen",
    orientation: "any",
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
