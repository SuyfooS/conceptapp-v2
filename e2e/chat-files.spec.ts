import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Request, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  ageChatFile,
  chatFileObjects,
  chatFileRemoved,
  clearDemoChat,
  type DemoChatFile,
  demoChatFile,
  demoChatFilesLeft,
  demoChatPdf,
  demoConversation,
  demoPdfPlaces,
  seeDemoChatNotice,
} from "./db";
import { fakePdf, minimalPdf } from "./pdf";
import { cameraPhoto, hasExif } from "./photo";
import { secondPage, signIn } from "./session";

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
//
// PDFs (C5, 20261111000600_chat_pdfs.sql) go up from the browser itself,
// through Storage's signed upload for the one path the server reserved: a
// PUT from the app's origin to local Storage, which plan §6.3 left to check
// (CORS). The tests watch that PUT and say so plainly when the browser never
// got Storage's answer, instead of timing out somewhere after it.
const NOA = { e164: "+972500000003" };
const YOAV = {
  local: "050-000-0004",
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
/** What they write with their PDFs, and the PDFs' names. */
const PDF_WORDS = "קובץ לבדיקה של הצ'אט";
const PDF_NAME = "תפריט לבדיקה.pdf";
const FAKE_NAME = "לא באמת PDF.pdf";
/** The name as the screen writes it: without its ".pdf" (`shownFileName`). */
const PDF_SHOWN = "תפריט לבדיקה";
/** Where the browser PUTs a PDF: Storage's signed upload for the chat bucket. */
const SIGNED_UPLOAD = "/storage/v1/object/upload/sign/chat-files/";
const CORS_HINT =
  "The browser's PUT to Storage's signed upload never got its answer: most likely CORS from the app's origin to local Storage, which the chat plan (§6.3) left to check";
const NO_PUT_HINT =
  "No PUT to Storage's signed upload was made at all, so this is not CORS: startChatPdfAction refused or failed (see the composer's notice and the server's log), or the screen never got that far";
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
/** The composer on screen: the form with the field to write in. */
const composer = (page: Page) =>
  page
    .locator("form")
    .filter({
      has: page.getByRole("textbox", { name: c.conversation.placeholder }),
    })
    .filter({ visible: true });
/** Text as a pattern, as it is. */
const named = (text: string) =>
  new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

/** The attach sheet's row for a picture or a PDF, which opens the picker. */
async function pickFrom(page: Page, row: "photo" | "pdf") {
  const sheet = page.getByRole("dialog", { name: c.attach.title });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("button", {
      name: new RegExp(`^${row === "photo" ? c.attach.photo : c.attach.pdf}`),
    })
    .click();
  await expect(sheet).toHaveCount(0);
}

/** One PUT to Storage's signed upload, as it ended. */
type PutSeen = {
  /** Where it went: the signed upload itself, token and all. */
  url: string;
  /** Storage's answer; none when the browser never got one. */
  status: number | null;
  /** Why the browser gave up on it (CORS, the network). */
  failed: string | null;
  headers: Record<string, string>;
};

/**
 * The browser's PUTs to Storage's signed upload, as they end, with the
 * console's CORS errors: what a test asserts on, so a refused PUT says what
 * it is.
 */
function watchPuts(page: Page): { puts: PutSeen[]; cors: string[] } {
  const puts: PutSeen[] = [];
  const cors: string[] = [];
  const isPut = (request: Request) =>
    request.method() === "PUT" && request.url().includes(SIGNED_UPLOAD);
  const headersOf = async (request: Request) => {
    try {
      return await request.allHeaders();
    } catch {
      return request.headers();
    }
  };
  page.on("requestfinished", async (request) => {
    if (!isPut(request)) return;
    const response = await request.response();
    puts.push({
      url: request.url(),
      status: response?.status() ?? null,
      failed: null,
      headers: await headersOf(request),
    });
  });
  page.on("requestfailed", async (request) => {
    if (!isPut(request)) return;
    puts.push({
      url: request.url(),
      status: null,
      failed: request.failure()?.errorText ?? "failed",
      headers: await headersOf(request),
    });
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /CORS|Access-Control-Allow/i.test(message.text())
    ) {
      cors.push(message.text());
    }
  });
  return { puts, cors };
}

/** What the composer says over the field now (its notice), or nothing. */
async function composerSays(page: Page): Promise<string> {
  try {
    const lines = composer(page).locator('div[aria-live="polite"]').first();
    return (await lines.innerText({ timeout: 1_000 })).trim();
  } catch {
    return "";
  }
}

/**
 * The first PUT ended with Storage's answer, which it was; never CORS. A PUT
 * CORS blocks still shows, as a failed request or the console's CORS error,
 * so none at all within 30 seconds is something else, and says so, with what
 * the composer said.
 */
async function expectPutAnswered(
  page: Page,
  watched: { puts: PutSeen[]; cors: string[] },
  status: number,
) {
  try {
    await expect
      .poll(() => watched.puts.length + watched.cors.length, {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
  } catch {
    const said = await composerSays(page);
    throw new Error(
      said ? `${NO_PUT_HINT}. The composer says: ${said}` : NO_PUT_HINT,
    );
  }
  expect(watched.cors, CORS_HINT).toEqual([]);
  const [put] = watched.puts;
  expect(put?.failed ?? null, CORS_HINT).toBeNull();
  expect(put?.status).toBe(status);
  // The file itself, typed, and nothing of the person's: no session, no key,
  // no cookie (the app's cookies are this host's too, whatever the port).
  const headers = put?.headers ?? {};
  expect(headers["content-type"]).toBe("application/pdf");
  expect(Object.keys(headers)).not.toContain("authorization");
  expect(Object.keys(headers)).not.toContain("apikey");
  expect(Object.keys(headers)).not.toContain("cookie");
}

/** Noa's private chat with Yoav, open, with her attach button. */
async function openWithYoav(page: Page) {
  await page.goto(`/chat/with/${YOAV.id}`);
  await expect(
    page
      .getByRole("heading", { level: 1, name: "יואב לוי" })
      .filter({ visible: true }),
  ).toBeVisible();
}

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
  // The attach button opens the attach sheet; its picture row, the picker.
  await attachButton(page).click();
  const chooser = page.waitForEvent("filechooser");
  await pickFrom(page, "photo");
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
  const left = [
    ...(await demoChatFilesLeft(WORDS)),
    ...(await demoChatFilesLeft(PDF_WORDS)),
  ];
  if (left.length === 0 || !CRON_SECRET) return;
  for (const message of left) await ageChatFile(message, 91);
  const run = await page.request.post("/cron/chat-files", {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(run.status()).toBe(202);
  await expect
    .poll(
      async () =>
        (await demoChatFilesLeft(WORDS)).length +
        (await demoChatFilesLeft(PDF_WORDS)).length,
      { timeout: 15_000 },
    )
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

// PDFs (C5). Noa sends Yoav a PDF from the attach sheet of their private chat:
// over 1 MB, so it could not have gone through a server action, it goes up
// from her browser through the signed upload, typed and with nothing of her
// session, and comes back as a download for the two of them alone.
test("a PDF goes up through its signed upload, and comes back as a download for its two people alone", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const watched = watchPuts(page);
  const pdf = minimalPdf("ConceptApp chat PDF", 2 * 1024 * 1024);
  await enterAs(page, "worker");
  await openWithYoav(page);

  // The attach sheet: a picture or a PDF, each with its line.
  await attachButton(page).click();
  const sheet = page.getByRole("dialog", { name: c.attach.title });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: new RegExp(`^${c.attach.photo}`) }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: new RegExp(`^${c.attach.pdf}`) }),
  ).toBeVisible();
  // The sheet hides the page from screen readers while it is open: axe alone.
  const opened = await new AxeBuilder({ page }).analyze();
  expect(
    opened.violations.flatMap((v) =>
      v.nodes.map((n) => `${v.id}: ${n.target.join(" ")} ${n.failureSummary}`),
    ),
  ).toEqual([]);
  const chooser = page.waitForEvent("filechooser");
  await pickFrom(page, "pdf");
  await (await chooser).setFiles({
    name: PDF_NAME,
    mimeType: "application/pdf",
    buffer: pdf,
  });

  // Over the field with its name, and sent with words.
  await expect(composer(page).getByText(PDF_SHOWN)).toBeVisible();
  await expect(
    composer(page).getByRole("button", { name: c.pdf.remove }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true })
    .fill(PDF_WORDS);
  await page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true })
    .click();
  await expect(log(page).getByText(PDF_SHOWN)).toBeVisible();
  await expectPutAnswered(page, watched, 200);

  // The sync brings the message: its chip is the download now.
  const chip = log(page).getByRole("link", { name: named(PDF_SHOWN) });
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await expect(log(page).getByText(PDF_WORDS)).toBeVisible();
  await expect(log(page).getByText(c.conversation.sending)).toHaveCount(0);
  const conversation =
    (await demoConversation({
      kind: "direct",
      between: [NOA.e164, YOAV.e164],
    })) ?? "";
  const kept = await demoChatPdf(conversation, PDF_NAME);
  if (!kept) throw new Error("The PDF wasn't kept");
  expect(kept.body).toBe(PDF_WORDS);
  expect(kept.fileSize).toBe(pdf.length);
  expect(kept.filePath).toMatch(
    new RegExp(`^[0-9a-f-]{36}/${conversation}/[0-9a-f]{32}\\.pdf$`),
  );
  const src = `/chat-files/${kept.filePath}`;
  expect(await chip.getAttribute("href")).toBe(src);
  expect(await chip.getAttribute("download")).not.toBeNull();
  // Storage keeps it as the browser put it: its size, typed a PDF.
  const asSent = [
    { name: kept.filePath, size: pdf.length, type: "application/pdf" },
  ];
  expect(await chatFileObjects([kept.filePath])).toEqual(asSent);

  // Its signed upload, good for 2 hours, writes its one path once: a second
  // PUT is refused, with upsert asked or not (the token says, never the
  // header), and so is the same token for the path beside it. Asked from
  // outside the app, with nothing of anyone's session.
  const signedUrl = watched.puts[0]?.url ?? "";
  expect(signedUrl).toContain(`${SIGNED_UPLOAD}${kept.filePath}?`);
  const other = Buffer.from("%PDF-1.7\nnot the file that was sent\n");
  const outside = await browser.newContext();
  try {
    for (const upsert of [false, true]) {
      const again = await outside.request.put(signedUrl, {
        data: other,
        headers: {
          "content-type": "application/pdf",
          ...(upsert ? { "x-upsert": "true" } : {}),
        },
      });
      expect(
        [400, 409],
        `a second PUT${upsert ? " asking upsert" : ""} was answered ${again.status()}`,
      ).toContain(again.status());
    }
    const besidePath = kept.filePath.replace(
      /[0-9a-f]{32}(?=\.pdf$)/,
      "0".repeat(32),
    );
    const beside = await outside.request.put(
      signedUrl.replace(kept.filePath, besidePath),
      { data: other, headers: { "content-type": "application/pdf" } },
    );
    expect([400, 401, 403]).toContain(beside.status());
    expect(await chatFileObjects([besidePath])).toEqual([]);
  } finally {
    await outside.close();
  }
  expect(await chatFileObjects([kept.filePath])).toEqual(asSent);

  // A press saves it under its own name, for the phone's own viewer.
  const download = page.waitForEvent("download");
  await chip.click();
  expect((await download).suggestedFilename()).toBe(PDF_NAME);

  // The app's route serves it as a download, never as a page: typed by its
  // bytes, named in UTF-8 with an ASCII fallback, private for a week, in a
  // sandbox nothing runs in, and whole.
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  const headers = stored.headers();
  expect(headers["content-type"]).toBe("application/pdf");
  const disposition = headers["content-disposition"] ?? "";
  const prefix = `attachment; filename="document.pdf"; filename*=UTF-8''`;
  expect(disposition.startsWith(prefix)).toBe(true);
  expect(decodeURIComponent(disposition.slice(prefix.length))).toBe(PDF_NAME);
  expect(disposition).toMatch(/^[\x20-\x7e]+$/);
  expect(headers["cache-control"]).toBe("private, max-age=604800");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["content-security-policy"]).toContain("default-src 'none'");
  expect(headers["content-security-policy"]).toContain("sandbox");
  expect(Buffer.compare(await stored.body(), pdf)).toBe(0);

  // Drawn again: the list says what it is, and the details have it too.
  await page.goto(`/chat/${conversation}`);
  await expect(chip).toBeVisible();
  await expect(
    page
      .getByText(
        c.list.fromYou.replace(
          "{preview}",
          c.list.pdfWith.replace("{caption}", PDF_WORDS),
        ),
      )
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: c.details.label })
      .getByRole("link", { name: named(PDF_SHOWN) }),
  ).toHaveAttribute("href", src);
  await expectCleanPage(page);
  await page.screenshot({
    path: testInfo.outputPath("chat-pdf.png"),
    fullPage: true,
  });

  // The owner and the manager work here, but the private chat isn't theirs:
  // not found, the same as a file that doesn't exist.
  for (const key of ["owner", "manager"] as const) {
    const other = await secondPage(browser, testInfo);
    try {
      await enterAs(other, key);
      expect((await other.request.get(src)).status()).toBe(404);
      expect(
        (
          await other.request.get(
            `/chat-files/${kept.filePath.replace(/[0-9a-f]{32}/, "0".repeat(32))}`,
          )
        ).status(),
      ).toBe(404);
    } finally {
      await other.context().close();
    }
  }
  // Yoav, the other of the two, downloads it.
  const yoav = await secondPage(browser, testInfo);
  try {
    await signIn(yoav, YOAV);
    const his = await yoav.request.get(src);
    expect(his.status()).toBe(200);
    expect(his.headers()["content-type"]).toBe("application/pdf");
  } finally {
    await yoav.context().close();
  }
  // Signed out, nothing either.
  const stranger = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const answer = await stranger.request.get(src, { maxRedirects: 0 });
    expect(answer.status()).not.toBe(200);
    expect(answer.headers()["content-type"] ?? "").not.toContain("pdf");
  } finally {
    await stranger.close();
  }
});

// What the browser can tell is refused before anything goes up: over 10 MB,
// or not named a PDF. A file named and typed a PDF whose bytes are a web page
// goes up (the browser can't tell), and the server refuses it on finishing,
// by its first bytes: its file gives way at once to the server's 1-byte
// tombstone, so its signed upload can't write there again, nothing is sent,
// and the words written with it go back to the field.
test("a PDF over 10 MB goes nowhere, and one whose bytes aren't a PDF is refused on finishing and let go", async ({
  page,
  browser,
}) => {
  test.slow();
  const watched = watchPuts(page);
  const field = page
    .getByRole("textbox", { name: c.conversation.placeholder })
    .filter({ visible: true });
  const notice = (text: string) =>
    page.getByText(text, { exact: true }).filter({ visible: true });
  await enterAs(page, "worker");
  await openWithYoav(page);

  // Too big: said over the field, and nothing goes up.
  await attachButton(page).click();
  let chooser = page.waitForEvent("filechooser");
  await pickFrom(page, "pdf");
  await (await chooser).setFiles({
    name: "big.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 0x20),
  });
  await expect(
    notice(c.pdfFailure.tooBig.replace("<ltr>{max}</ltr>", "10")),
  ).toBeVisible();
  await expect(composer(page).getByText("big", { exact: true })).toHaveCount(0);

  // Not named a PDF: the same.
  await attachButton(page).click();
  chooser = page.waitForEvent("filechooser");
  await pickFrom(page, "pdf");
  await (await chooser).setFiles({
    name: "notes.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("PK\u0003\u0004"),
  });
  await expect(notice(c.pdfFailure.notPdf)).toBeVisible();
  expect(watched.puts).toEqual([]);

  // A web page named and typed a PDF goes up, and is refused on finishing.
  await attachButton(page).click();
  chooser = page.waitForEvent("filechooser");
  await pickFrom(page, "pdf");
  await (await chooser).setFiles({
    name: FAKE_NAME,
    mimeType: "application/pdf",
    buffer: fakePdf(),
  });
  await expect(composer(page).getByText(FAKE_NAME)).toBeVisible();
  await expect(notice(c.pdfFailure.notPdf)).toHaveCount(0);
  await field.fill(PDF_WORDS);
  await page
    .getByRole("button", { name: c.conversation.send, exact: true })
    .filter({ visible: true })
    .click();
  await expectPutAnswered(page, watched, 200);
  await expect(notice(c.pdfFailure.notPdf)).toBeVisible({ timeout: 15_000 });
  await expect(log(page).getByText(FAKE_NAME)).toHaveCount(0);
  await expect(field).toHaveValue(PDF_WORDS);

  // Its place was reserved and never sent, and Storage holds the server's
  // tombstone there, one byte, in place of the web page.
  const [place] = await demoPdfPlaces(NOA.e164);
  expect(place?.name).toBe(FAKE_NAME);
  expect(place?.used).toBe(false);
  const path = place?.path ?? "";
  const tombstone = [{ name: path, size: 1, type: "application/pdf" }];
  await expect.poll(() => chatFileObjects([path])).toEqual(tombstone);
  // Its signed upload can't put the web page back.
  const outside = await browser.newContext();
  try {
    const again = await outside.request.put(watched.puts[0]?.url ?? "", {
      data: fakePdf(),
      headers: { "content-type": "application/pdf" },
    });
    expect([400, 409]).toContain(again.status());
  } finally {
    await outside.close();
  }
  expect(await chatFileObjects([path])).toEqual(tombstone);
  const conversation = await demoConversation({
    kind: "direct",
    between: [NOA.e164, YOAV.e164],
  });
  if (conversation) {
    expect(await demoChatPdf(conversation, FAKE_NAME)).toBeNull();
  }
  // Its address, had it been sent, is not found.
  expect(
    (await page.request.get(`/chat-files/${place?.path ?? ""}`)).status(),
  ).toBe(404);
  await expectCleanPage(page);
});
