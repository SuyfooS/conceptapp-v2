import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  agePhotoList,
  photoListPath,
  photoListRemoved,
  removePhotoLists,
  sendPhotoList,
} from "./db";
import { cameraPhoto, hasExif } from "./photo";
import { secondPage, signIn } from "./session";

// Photos on lists (L6, supabase/migrations/20261110001500_list_photos.sql). The
// demo restaurant takes photos for these tests ("photos": true in
// supabase/seed.sql); the demo shop takes none, like the hosted demo
// businesses. Each test sends its own list with one photo item, as the
// business's manager would, and removes it after. They write the shared demo,
// so they run once, on a computer; the screen's shapes at every width are
// design.spec.ts's (the weekly cleaning's twins). The daily clean-up's route
// needs the CRON_SECRET CI makes for each run.
const NOA = { local: "050-000-0003", e164: "+972500000003" };
const YOAV = { local: "050-000-0004", e164: "+972500000004" };
const TAMAR = { local: "050-000-0010", e164: "+972500000010" };

const NAME = "צילום לבדיקה";
const LABEL = "צילום של המקרר";
const p = he.app.lists.list.photo;
// The daily clean-up's bearer, which CI makes fresh for each run.
const CRON_SECRET = process.env.CRON_SECRET ?? "";

const main = (page: Page) => page.getByRole("main");
/** A stored photo, which the app serves from /list-photos (`listPhotoSrc`). */
const shownPhoto = (page: Page) =>
  main(page).locator('img[src^="/list-photos/"]').filter({ visible: true });

/** Takes a phone's photo for the list's photo item, and waits until it is saved. */
async function takePhoto(page: Page) {
  const take = main(page)
    .getByRole("button", { name: `${p.take}: ${LABEL}` })
    .filter({ visible: true });
  const chooser = page.waitForEvent("filechooser");
  await take.click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  await expect(
    page.getByRole("status").filter({ hasText: p.saved }),
  ).toBeVisible();
}

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

test.beforeEach(async () => {
  await removePhotoLists(NAME);
});

test.afterEach(async () => {
  await removePhotoLists(NAME);
});

test("a photo taken on a list is stored, read back, removed and brought back", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Once, on a computer: it writes the shared demo",
  );
  // Three sign-ins and two uploads.
  test.slow();
  const listId = await sendPhotoList("restaurant", NAME, LABEL);
  await signIn(page, NOA);
  await page.goto(`/lists/${listId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await expect(shownPhoto(page)).toHaveCount(0);
  await expectCleanPage(page);

  // A phone's photo, larger than the app keeps and with its EXIF block,
  // chosen from the phone's chooser.
  await takePhoto(page);
  await expect(shownPhoto(page)).toHaveCount(1);
  const src = (await shownPhoto(page).getAttribute("src")) ?? "";
  expect(src).toBe(`/list-photos/${await photoListPath(listId)}`);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("list-photo.png"),
    fullPage: true,
  });

  // What the server keeps is the browser's own re-encoding, read back through
  // the app's route: private, never sniffed, nothing from the camera inside.
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/webp");
  expect(stored.headers()["cache-control"]).toBe("private, max-age=3600");
  expect(stored.headers()["x-content-type-options"]).toBe("nosniff");
  const bytes = await stored.body();
  expect(bytes.length).toBeLessThanOrEqual(400 * 1024);
  expect(hasExif(bytes)).toBe(false);

  // Removing it offers the way back, where the person looks, and the file
  // goes; the undo stores the same picture again, under a new address.
  await main(page)
    .getByRole("button", { name: `${p.remove}: ${LABEL}` })
    .click();
  const undo = page.getByRole("status").filter({ hasText: p.removed });
  await expect(undo).toBeVisible();
  await expect(shownPhoto(page)).toHaveCount(0);
  await expect.poll(() => photoListPath(listId)).toBeNull();
  expect((await page.request.get(src)).status()).toBe(404);
  await undo.getByRole("button", { name: he.app.manage.undo }).click();
  await expect(undo).toHaveCount(0);
  await expect(shownPhoto(page)).toHaveCount(1);
  const again = (await shownPhoto(page).getAttribute("src")) ?? "";
  expect(again).not.toBe(src);
  expect((await page.request.get(again)).status()).toBe(200);

  // Yoav works here, but the list isn't his: not found, as for anyone.
  const colleague = await secondPage(browser, testInfo);
  await signIn(colleague, YOAV);
  expect((await colleague.request.get(again)).status()).toBe(404);
  await colleague.context().close();

  // Tamar, in the shop, is of another business: not found either, and so is
  // a path that isn't one.
  const stranger = await secondPage(browser, testInfo);
  await signIn(stranger, TAMAR);
  expect((await stranger.request.get(again)).status()).toBe(404);
  expect(
    (await stranger.request.get("/list-photos/not-a-uuid/x/y.webp")).status(),
  ).toBe(404);
  await stranger.context().close();
});

test("the daily clean-up runs only with the secret, and removes a photo past its days", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Once, on a computer: it writes the shared demo",
  );
  test.skip(!CRON_SECRET, "needs CRON_SECRET (CI sets it)");
  const wrong = await page.request.post("/cron/list-photos", {
    headers: { Authorization: `Bearer ${"x".repeat(64)}` },
  });
  expect(wrong.status()).toBe(401);
  expect((await page.request.post("/cron/list-photos")).status()).toBe(401);

  const listId = await sendPhotoList("restaurant", NAME, LABEL);
  await signIn(page, NOA);
  await page.goto(`/lists/${listId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await takePhoto(page);
  await expect(shownPhoto(page)).toHaveCount(1);
  const src = (await shownPhoto(page).getAttribute("src")) ?? "";
  expect((await page.request.get(src)).status()).toBe(200);

  // Taken longer ago than the restaurant keeps photos (90 days, the
  // default): the clean-up removes the file, and the item says so, still done.
  await agePhotoList(listId, 91);
  const right = await page.request.post("/cron/list-photos", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(right.status()).toBe(202);
  await expect
    .poll(() => photoListRemoved(listId), { timeout: 15_000 })
    .toBe(true);
  expect(await photoListPath(listId)).not.toBeNull();
  expect((await page.request.get(src)).status()).toBe(404);
  await page.reload();
  await expect(
    main(page).getByText(p.removedAfter, { exact: true }).filter({
      visible: true,
    }),
  ).toBeVisible();
  await expect(shownPhoto(page)).toHaveCount(0);
});

test("a demo business that takes no photos says so on the list", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Once, on a computer: it writes the shared demo",
  );
  const listId = await sendPhotoList("shop", NAME, LABEL);
  await signIn(page, TAMAR);
  await page.goto(`/lists/${listId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: NAME }),
  ).toBeVisible();
  await expect(
    main(page).getByText(p.demo, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: new RegExp(`^${p.take}`) }),
  ).toHaveCount(0);
  await expectCleanPage(page);
});
