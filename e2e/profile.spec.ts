import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearDemoProfile,
  clearSchedule,
  demoPhotoPath,
  scheduleDemoToday,
} from "./db";
import { cameraPhoto, hasExif } from "./photo";
import { secondPage, signIn } from "./session";

// The profile, H1 (#82): a photo, who sees it, and the way out. People from
// supabase/seed.sql. The demo restaurant is opened to photos for these tests
// ("profiles": true); the demo shop keeps its people as they are, like the
// hosted demo businesses.
const NOA = {
  id: "00000000-0000-4000-a000-000000000003",
  name: "נועה כהן",
  local: "050-000-0003",
  e164: "+972500000003",
};
const SHIRAN = { local: "050-000-0002", e164: "+972500000002" };
const TAMAR = { local: "050-000-0010", e164: "+972500000010" };

const m = he.app.me;
const p = he.ui.photoPicker;

const main = (page: Page) => page.getByRole("main");
/** Today's avatar. On desktop the sidebar's foot says the same words, outside main. */
const profileLink = (page: Page) =>
  main(page).getByRole("link", { name: m.open, exact: true });
/** A stored photo, which the app serves from /photos (`profilePhotoSrc`). */
const photosIn = (page: Page) => main(page).locator('img[src^="/photos/"]');

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

/** Choose a phone's photo in the sheet and save it; returns where it shows. */
async function setPhoto(page: Page, button: string): Promise<string> {
  const photo = await cameraPhoto(page);
  await main(page).getByRole("button", { name: button, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: p.title });
  await expect(sheet).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: p.choose }).click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  await sheet.getByRole("button", { name: p.save }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: p.saved }),
  ).toBeVisible();
  const shown = photosIn(page).first();
  await expect(shown).toHaveAttribute("src", new RegExp(`^/photos/${NOA.id}/`));
  return (await shown.getAttribute("src")) ?? "";
}

test.afterEach(async () => {
  await clearDemoProfile(NOA.e164);
  await clearSchedule();
});

test("a person sets a photo from Today, and colleagues see it", async ({
  page,
  browser,
}, testInfo) => {
  // Three sign-ins and an upload.
  test.slow();
  await scheduleDemoToday([[NOA.e164, null]]);
  await signIn(page, NOA);
  await profileLink(page).click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole("heading", { level: 1, name: NOA.name }),
  ).toBeVisible();
  await expect(photosIn(page)).toHaveCount(0);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("me-empty.png"),
    fullPage: true,
  });

  const src = await setPhoto(page, p.add);
  // What the server keeps is the browser's own re-encoding: nothing from the
  // camera is left in it.
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/webp");
  expect(stored.headers()["cache-control"]).toContain("private");
  expect(hasExif(await stored.body())).toBe(false);
  await expect(
    main(page).getByRole("button", { name: p.change, exact: true }),
  ).toBeVisible();
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("me-photo.png"),
    fullPage: true,
  });

  // Shiran, her manager, sees it on Team and on Today.
  const manager = await secondPage(browser, testInfo);
  await signIn(manager, SHIRAN);
  await manager.goto("/team");
  await expect(
    main(manager).locator(`img[src="${src}"]`).filter({ visible: true }),
  ).not.toHaveCount(0);
  await manager.goto("/home");
  const who = main(manager)
    .locator("section")
    .filter({
      has: manager.getByRole("heading", {
        level: 2,
        name: he.app.home.who.title,
      }),
    });
  await expect(who.locator(`img[src="${src}"]`).first()).toBeVisible();
  // A photo that isn't there is not there for a colleague either.
  expect(
    (await manager.request.get(`/photos/${NOA.id}/zzzzzzzzzzzz.webp`)).status(),
  ).toBe(404);
  await manager.context().close();

  // Tamar, in the shop, works with nobody here: no photo for her.
  const stranger = await secondPage(browser, testInfo);
  await signIn(stranger, TAMAR);
  expect((await stranger.request.get(src)).status()).toBe(404);
  expect(
    (await stranger.request.get("/photos/not-a-uuid/abcdefgh.webp")).status(),
  ).toBe(404);
  await stranger.context().close();
});

test("removing the photo offers undo", async ({ page }) => {
  test.slow();
  await signIn(page, NOA);
  await page.goto("/me");
  const first = await setPhoto(page, p.add);

  // Remove it: the photo goes, and the way back is where the person looks.
  await main(page).getByRole("button", { name: p.change, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: p.title });
  await sheet.getByRole("button", { name: p.remove }).click();
  await expect(sheet).toBeHidden();
  const undo = page.getByRole("status").filter({ hasText: m.photo.removed });
  await expect(undo).toBeVisible();
  await expect(photosIn(page)).toHaveCount(0);
  await expect.poll(() => demoPhotoPath(NOA.e164)).toBeNull();

  // Undo brings it back, under a new address.
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(undo).toBeHidden();
  const again = photosIn(page).first();
  await expect(again).toHaveAttribute("src", /^\/photos\//);
  expect(await again.getAttribute("src")).not.toBe(first);
  await expect.poll(() => demoPhotoPath(NOA.e164)).not.toBeNull();

  // Removed again, it stays gone.
  await main(page).getByRole("button", { name: p.change, exact: true }).click();
  await sheet.getByRole("button", { name: p.remove }).click();
  await expect(undo).toBeVisible();
  await expect(photosIn(page)).toHaveCount(0);
  await expect.poll(() => demoPhotoPath(NOA.e164)).toBeNull();
});

test("a demo business that keeps its people keeps their photos", async ({
  page,
}) => {
  await signIn(page, TAMAR);
  await page.goto("/me");
  await expect(page.getByText(m.photo.demo)).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: p.add, exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("signing out is on the profile", async ({ page }) => {
  await signIn(page, NOA);
  await expect(page.getByRole("button", { name: he.app.signOut })).toHaveCount(
    0,
  );
  await profileLink(page).click();
  await expect(page).toHaveURL(/\/me$/);
  await page.getByRole("button", { name: he.app.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/enter$/);
});

test("the sidebar leads to the profile", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "the sidebar is on desktop only; phones and tablets use Today's avatar",
  );
  await signIn(page, NOA);
  const block = page
    .getByRole("complementary")
    .getByRole("link", { name: new RegExp(NOA.name) });
  await block.click();
  await expect(page).toHaveURL(/\/me$/);
  await expect(block).toHaveAttribute("aria-current", "page");
});
