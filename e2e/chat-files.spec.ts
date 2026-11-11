import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  ageChatFile,
  chatFileObjects,
  chatFileRemoved,
  clearDemoChat,
  type DemoChatFile,
  demoChatFile,
  demoChatFilesLeft,
  demoConversation,
  seeDemoChatNotice,
} from "./db";
import { cameraPhoto, hasExif } from "./photo";
import { secondPage } from "./session";

// Pictures in chat (C4, supabase/migrations/20261111000500_chat_files.sql).
// The demo restaurant takes them for these tests ("chatFiles": true in
// supabase/seed.sql); the demo shop takes none, like the hosted demo
// businesses. Noa sends Yoav a phone's photo in their private chat, which her
// first message opens. These write the shared demo and its Storage, so they
// run once, on a computer, and remove their own files through the clean-up
// (/cron/chat-files, with the CRON_SECRET CI makes for each run); the
// conversation's shapes at every width are design.spec.ts's, on
// /design/chat. Nothing assumes what another spec left in the demo: the
// pictures are found by their own words.
const NOA = { e164: "+972500000003" };
const YOAV = {
  e164: "+972500000004",
  id: "00000000-0000-4000-a000-000000000004",
};
const URI = { e164: "+972500000001" };
const SHIRAN = { e164: "+972500000002" };
const TAMAR = { e164: "+972500000010" };

const c = he.app.chat;
const e = he.auth.enter;
/** What these tests write with their pictures, so they find their own. */
const WORDS = "תמונה לבדיקה של הצ'אט";
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const DESKTOP_ONLY = "Once, on a computer: it writes the shared demo";

type DoorPerson = "owner" | "manager" | "worker" | "shopWorker";

/** In through the door, as one of the demo businesses' people. */
async function enterAs(page: Page, key: DoorPerson) {
  await page.goto("/enter");
  await page
    .getByRole("region", {
      name:
        key === "shopWorker"
          ? e.businesses.shop.name
          : e.businesses.restaurant.name,
    })
    .getByRole("button", { name: new RegExp(e.people[key].name) })
    .click();
  await expect(page).toHaveURL(/\/home$/);
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

/** The conversation on screen; a kept, hidden copy of another never counts. */
const log = (page: Page) =>
  page.getByRole("log", { name: c.conversation.log }).filter({ visible: true });
const attachButton = (page: Page) =>
  page
    .getByRole("button", { name: c.conversation.attach, exact: true })
    .filter({ visible: true });
/**
 * A picture the app serves (`chatFileSrc`). The browser may hold its address
 * resolved against the page (a picture with an error handler does), so it is
 * matched by its path, written either way.
 */
const served = (page: Page) => log(page).locator('img[src*="/chat-files/"]');
/** An address on screen as the path it names on this page's own origin. */
const onThisPage = (page: Page, src: string | null) =>
  src === null ? null : new URL(src, page.url()).pathname;

/**
 * Noa's photo to Yoav, taken on a phone (larger than the app keeps, with its
 * EXIF block), with `words` under it: picked from the attach button, made
 * ready on the page, and sent. Returns their conversation and the picture as
 * the database keeps it.
 */
async function sendPhoto(
  page: Page,
  words: string,
): Promise<{ conversation: string; file: DemoChatFile }> {
  await page.goto(`/chat/with/${YOAV.id}`);
  await expect(
    page
      .getByRole("heading", { level: 1, name: "יואב לוי" })
      .filter({ visible: true }),
  ).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await attachButton(page).click();
  await (await chooser).setFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  // Made ready on the page: shown over the field, with the way to take it out.
  await expect(
    page.getByRole("img", { name: c.image.chosen }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: c.image.remove })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true })
    .fill(words);
  await page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true })
    .click();
  await expect(log(page).getByText(words)).toBeVisible();
  await expect(
    log(page).getByRole("img", { name: c.image.altOwn }),
  ).toBeVisible();
  await expect(log(page).getByText(c.conversation.sending)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect
    .poll(() =>
      demoConversation({ kind: "direct", between: [NOA.e164, YOAV.e164] }),
    )
    .not.toBeNull();
  const conversation =
    (await demoConversation({
      kind: "direct",
      between: [NOA.e164, YOAV.e164],
    })) ?? "";
  await expect.poll(() => demoChatFile(conversation, words)).not.toBeNull();
  const file = await demoChatFile(conversation, words);
  if (!file) throw new Error("The picture wasn't kept");
  return { conversation, file };
}

/**
 * What these tests sent goes from Storage: their pictures, aged past the
 * restaurant's days, are removed by the clean-up. Without the secret they
 * stay in the local Storage, read by nobody, until the orphan sweep.
 */
async function removeOwnFiles(page: Page) {
  const left = await demoChatFilesLeft(WORDS);
  if (left.length === 0 || !CRON_SECRET) return;
  for (const message of left) await ageChatFile(message, 91);
  const run = await page.request.post("/cron/chat-files", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(run.status()).toBe(202);
  await expect
    .poll(async () => (await demoChatFilesLeft(WORDS)).length, {
      timeout: 15_000,
    })
    .toBe(0);
}

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(testInfo.project.name !== "desktop", DESKTOP_ONLY);
  await clearDemoChat();
  for (const person of [NOA, YOAV, URI, SHIRAN]) {
    await seeDemoChatNotice(person.e164);
  }
  await seeDemoChatNotice(TAMAR.e164, "shop");
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await removeOwnFiles(page);
  await clearDemoChat();
});

test("a phone's photo goes as a thumbnail, opens whole, keeps nothing from the camera, and is read by nobody else", async ({
  page,
  browser,
}, testInfo) => {
  // Three people in through the door, a picture made ready and sent.
  test.slow();
  await enterAs(page, "worker");
  const { conversation, file } = await sendPhoto(page, WORDS);
  const thumbSrc = `/chat-files/${file.thumbPath}`;
  const fileSrc = `/chat-files/${file.filePath}`;
  expect(file.thumbPath).toMatch(
    new RegExp(`^[0-9a-f-]{36}/${conversation}/[0-9a-f]{32}-s\\.webp$`),
  );
  expect(file.filePath).toBe(file.thumbPath.replace("-s.webp", ".webp"));

  // Drawn again from the server: the thumbnail, from the app's own route,
  // which answers the sender's own session (asked first, so a refusal says
  // so before the bubble turns it into "try again").
  await page.goto(`/chat/${conversation}`);
  await expect(log(page).getByText(WORDS)).toBeVisible();
  const first = await page.request.get(thumbSrc, { maxRedirects: 0 });
  expect(
    first.status(),
    `the thumbnail answered ${first.status()} (${first.headers()["content-type"] ?? "no type"})`,
  ).toBe(200);
  expect(first.headers()["content-type"]).toBe("image/webp");
  await expect(served(page)).toHaveCount(1);
  expect(onThisPage(page, await served(page).getAttribute("src"))).toBe(
    thumbSrc,
  );
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("chat-photo.png"),
    fullPage: true,
  });

  // A tap opens it whole, in a sheet, with what was written under it.
  await log(page).getByRole("img", { name: c.image.altOwn }).click();
  const sheet = page.getByRole("dialog", { name: c.image.altOwn });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(`img[src$="${fileSrc}"]`)).toBeVisible();
  await expect(sheet.getByText(WORDS)).toBeVisible();
  await expectCleanPage(page);
  await sheet.getByRole("button", { name: c.image.close }).click();
  await expect(sheet).toHaveCount(0);

  // What the server keeps is the page's own re-encoding, read back through
  // the app's route: private for a week, typed by its bytes, in a sandbox,
  // nothing from the camera inside, each under its size.
  for (const [src, max] of [
    [thumbSrc, 48 * 1024],
    [fileSrc, 400 * 1024],
  ] as const) {
    const stored = await page.request.get(src);
    expect(stored.status()).toBe(200);
    const headers = stored.headers();
    expect(headers["content-type"]).toBe("image/webp");
    expect(headers["cache-control"]).toBe("private, max-age=604800");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["content-security-policy"]).toContain("default-src 'none'");
    expect(headers["content-security-policy"]).toContain("sandbox");
    const bytes = await stored.body();
    expect(bytes.length).toBeLessThanOrEqual(max);
    expect(hasExif(bytes)).toBe(false);
  }
  const objects = await chatFileObjects([file.filePath, file.thumbPath]);
  expect(objects.map((o) => o.type)).toEqual(["image/webp", "image/webp"]);
  expect(objects.reduce((sum, o) => sum + o.size, 0)).toBe(file.fileSize);

  // The owner and the manager work here, but the private chat isn't theirs:
  // not found, the same as a file that doesn't exist.
  for (const key of ["owner", "manager"] as const) {
    const other = await secondPage(browser, testInfo);
    try {
      await enterAs(other, key);
      expect((await other.request.get(thumbSrc)).status()).toBe(404);
      expect((await other.request.get(fileSrc)).status()).toBe(404);
      expect(
        (
          await other.request.get(
            `/chat-files/${file.filePath.replace(/[0-9a-f]{32}/, "0".repeat(32))}`,
          )
        ).status(),
      ).toBe(404);
    } finally {
      await other.context().close();
    }
  }
  // Signed out, nothing either.
  const stranger = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const answer = await stranger.request.get(thumbSrc, { maxRedirects: 0 });
    expect(answer.status()).not.toBe(200);
    expect(answer.headers()["content-type"] ?? "").not.toContain("image/");
  } finally {
    await stranger.close();
  }
});

test("the clean-up runs only with the secret, and a picture past its days says its file is no longer kept", async ({
  page,
}) => {
  test.skip(!CRON_SECRET, "needs CRON_SECRET (CI sets it)");
  test.slow();
  const wrong = await page.request.post("/cron/chat-files", {
    headers: { Authorization: `Bearer ${"x".repeat(64)}` },
  });
  expect(wrong.status()).toBe(401);
  expect((await page.request.post("/cron/chat-files")).status()).toBe(401);

  await enterAs(page, "worker");
  const { conversation, file } = await sendPhoto(page, WORDS);
  const thumbSrc = `/chat-files/${file.thumbPath}`;
  expect((await page.request.get(thumbSrc)).status()).toBe(200);

  // Sent longer ago than the restaurant keeps files (90 days, the default):
  // the clean-up removes both files, and the message stays and says so.
  await ageChatFile(file.message, 91);
  const right = await page.request.post("/cron/chat-files", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(right.status()).toBe(202);
  await expect
    .poll(() => chatFileRemoved(file.message), { timeout: 15_000 })
    .toBe(true);
  await expect
    .poll(
      async () =>
        (await chatFileObjects([file.filePath, file.thumbPath])).length,
    )
    .toBe(0);
  expect((await page.request.get(thumbSrc)).status()).toBe(404);
  await page.goto(`/chat/${conversation}`);
  await expect(log(page).getByText(WORDS)).toBeVisible();
  await expect(
    log(page).getByText(c.message.fileGone, { exact: true }),
  ).toBeVisible();
  await expect(served(page)).toHaveCount(0);
  await expectCleanPage(page);
});

test("a demo business that takes no files says so at the attach button", async ({
  page,
}) => {
  const team = await demoConversation({ kind: "team" }, "shop");
  expect(team).not.toBeNull();
  await enterAs(page, "shopWorker");
  await page.goto(`/chat/${team}`);
  await expect(
    page
      .getByRole("heading", { level: 1, name: c.list.team })
      .filter({ visible: true }),
  ).toBeVisible();
  // Pressed, it says why, and no picker opens.
  let picked = false;
  page.on("filechooser", () => {
    picked = true;
  });
  await attachButton(page).click();
  await expect(
    page.getByText(c.fileFailure.demo, { exact: true }).filter({
      visible: true,
    }),
  ).toBeVisible();
  expect(picked).toBe(false);
  await expectCleanPage(page);
});
