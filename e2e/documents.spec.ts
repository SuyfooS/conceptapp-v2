import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearDemoChat,
  demoChatMessagesSince,
  demoConversation,
  demoDocument,
  demoDocumentFilesLeft,
  demoDocumentMark,
  demoDocumentsBy,
  demoSeededSickNote,
  endViewSessions,
  forgetDemoDocuments,
  retireDemoDocuments,
  seeDemoChatNotice,
  sendDemoSickNote,
} from "./db";
import { minimalPdf } from "./pdf";
import { cameraPhoto } from "./photo";
import { secondPage, signIn } from "./session";
import { unzip } from "./unzip";

// Official documents on screen (chat C7; the database is C6's,
// 20261111000700_documents.sql). The demo restaurant takes files for these
// tests ("chatFiles": true in supabase/seed.sql), but as a demo business it
// takes no title or note: a document is called by its kind's words. Its reset
// seeds a payslip from Galit (the accountant) to Noa, a procedure from Shiran
// to everyone asking for "קראתי", and Noa's sick note, which Uri opened; the
// shop seeds Tamar's. Shiran (a manager) has no pay access in the restaurant,
// so she is not in its office; Omer (the shop's manager) has it there.
//
// These write the shared demo, so they run once, on a computer, and take
// their own documents away after (their files through the clean-up,
// /cron/chat-files with the run's CRON_SECRET, then their rows). The shapes
// at 390, 820 and 1440 are design.spec.ts's, on /design/chat/documents, and
// screens.spec.ts opens /chat/documents for each role. Nothing assumes what
// another spec left: a document is found by who sent it and when.
const URI = {
  e164: "+972500000001",
  id: "00000000-0000-4000-a000-000000000001",
};
const SHIRAN = {
  e164: "+972500000002",
  id: "00000000-0000-4000-a000-000000000002",
};
const NOA = {
  e164: "+972500000003",
  id: "00000000-0000-4000-a000-000000000003",
};
const GALIT = { e164: "+972500000014" };
const ADMIN = { local: "050-000-0005", e164: "+972500000005" };
const RESTAURANT = "00000000-0000-4000-b000-000000000001";
const SHOP = "00000000-0000-4000-b000-000000000002";

const c = he.app.chat;
const d = c.documents;
const e = he.auth.enter;
const CRON_SECRET = process.env.CRON_SECRET ?? "";
const DESKTOP_ONLY = "Once, on a computer: it writes the shared demo";
/** The PDF Galit sends, by the name it goes with, and as the screen writes it. */
const PAYSLIP_NAME = "תלוש לבדיקה.pdf";

type DoorPerson =
  | "owner"
  | "manager"
  | "worker"
  | "accountant"
  | "shopManager"
  | "shopWorker";

/** In through the door, as one of the demo businesses' people. */
async function enterAs(page: Page, key: DoorPerson) {
  await page.goto("/enter");
  await page
    .getByRole("region", {
      name: key.startsWith("shop")
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

/** The link to a document's page on screen; a kept, hidden copy never counts. */
const documentLink = (page: Page, id: string) =>
  page
    .getByRole("main")
    .locator(`a[href$="/chat/documents/${id}"]`)
    .filter({ visible: true });
const notFoundTitle = (page: Page) =>
  page.getByRole("heading", { level: 1, name: he.app.notFound.title });
/** A document's file as the app's own page asks for it (`Sec-Fetch-Site`). */
const fileOf = (page: Page, business: string, id: string) =>
  page.request.get(`/document-files/${business}/${id}`, {
    headers: { "sec-fetch-site": "same-origin" },
  });
/** The id in a document page's address. */
const idIn = (url: string) => new URL(url).pathname.split("/").pop() ?? "";

/** The document's photo on its page, once it has loaded (which opens it). */
async function expectPhotoShown(page: Page, id: string) {
  const photo = page
    .getByRole("main")
    .locator(`img[src*="/document-files/"][src$="/${id}"]`)
    .filter({ visible: true });
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate((image: HTMLImageElement) =>
        image.complete ? image.naturalWidth : 0,
      ),
    )
    .toBeGreaterThan(0);
}

/** What a spec sent, taken away after it: files through the clean-up, then rows. */
const written: { ids: string[]; business: "restaurant" | "shop" }[] = [];

async function forgetWritten(page: Page) {
  for (const { ids, business } of written.splice(0)) {
    const held = await retireDemoDocuments(ids);
    if (held.length > 0 && CRON_SECRET) {
      const run = await page.request.post("/cron/chat-files", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      });
      expect(run.status()).toBe(202);
      await expect
        .poll(() => demoDocumentFilesLeft(ids), { timeout: 15_000 })
        .toBe(0);
    }
    await forgetDemoDocuments(ids, business);
  }
}

test.beforeEach(async ({ page }, testInfo) => {
  void page;
  test.skip(testInfo.project.name !== "desktop", DESKTOP_ONLY);
  for (const person of [NOA, SHIRAN, URI]) {
    await seeDemoChatNotice(person.e164);
  }
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.project.name !== "desktop") return;
  await forgetWritten(page);
  await clearDemoChat();
  await endViewSessions(ADMIN.e164);
});

test("a sick note from a private chat's attach button goes to the business, not into the chat", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const since = new Date(Date.now() - 1000);
  const conversation = await demoConversation({
    kind: "direct",
    between: [NOA.e164, SHIRAN.e164],
  });
  expect(conversation).not.toBeNull();

  // Noa, in her private chat with Shiran: the attach sheet's third row leads
  // to the document for the business, never into the conversation.
  await enterAs(page, "worker");
  await page.goto(`/chat/${conversation}`);
  await page
    .getByRole("button", { name: c.conversation.attach, exact: true })
    .filter({ visible: true })
    .click();
  const sheet = page.getByRole("dialog", { name: c.attach.title });
  await expect(sheet.getByText(c.attach.documentHint)).toBeVisible();
  await sheet
    .getByRole("link", { name: new RegExp(`^${c.attach.document}`) })
    .click();
  await expect(page).toHaveURL(/\/chat\/documents\/send\?to=business$/);
  await expect(
    page.getByRole("heading", { level: 1, name: d.sendToBusiness }),
  ).toBeVisible();
  // Who sees it, and for a sick note (the first kind) to send it alone.
  await expect(page.getByText(d.whoFromPerson)).toBeVisible();
  await expect(page.getByText(d.sickNoteHint)).toBeVisible();
  await expect(
    page.getByRole("radio", { name: d.categories.sick_note }),
  ).toBeChecked();
  // A demo business: no title and no note to type.
  await expect(page.getByLabel(d.send.titleLabel)).toHaveCount(0);

  // A phone's photo of the page, made ready here at 1600 px.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: d.send.photos }).click();
  await (await chooser).setFiles({
    name: "sick-note.jpg",
    mimeType: "image/jpeg",
    buffer: await cameraPhoto(page),
  });
  await expect(page.getByRole("img", { name: d.send.chosen })).toBeVisible();
  await expectCleanPage(page);
  await page.getByRole("button", { name: d.send.submitBusiness }).click();

  // Its page, with "ביטול" in the toast while it may be taken back.
  await expect(page).toHaveURL(/\/chat\/documents\/[0-9a-f-]{36}$/);
  const id = idIn(page.url());
  written.push({ ids: [id], business: "restaurant" });
  await expect(
    page.getByRole("status").filter({ hasText: d.page.sentToast }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: d.categories.sick_note }),
  ).toBeVisible();
  await expect(page.getByText(d.page.notOpened)).toBeVisible();
  const sent = await demoDocument(id);
  expect(sent).toMatchObject({
    direction: "from_person",
    category: "sick_note",
    author: NOA.e164,
    fileKind: "image",
    openedAt: null,
  });
  // The conversation has nothing new: it went to the office alone.
  expect(await demoChatMessagesSince(conversation ?? "", since)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("document-sent.png"),
    fullPage: true,
  });

  // Shiran manages the restaurant but has no pay access: nothing of it, its
  // page is not found, and its file is the same 404 as one that isn't there.
  const shiran = await secondPage(browser, testInfo);
  try {
    await enterAs(shiran, "manager");
    await shiran.goto("/chat/documents");
    await expect(
      shiran.getByRole("heading", { level: 1, name: d.mine }),
    ).toBeVisible();
    await expect(documentLink(shiran, id)).toHaveCount(0);
    await shiran.goto(`/chat/documents/${id}`);
    await expect(notFoundTitle(shiran)).toBeVisible();
    expect((await fileOf(shiran, RESTAURANT, id)).status()).toBe(404);
  } finally {
    await shiran.context().close();
  }

  // Uri, the owner, opens it: the photo on its page opens it.
  const uri = await secondPage(browser, testInfo);
  try {
    await enterAs(uri, "owner");
    await uri.goto("/chat/documents");
    await expect(
      uri.getByRole("heading", { level: 1, name: d.title }),
    ).toBeVisible();
    // On a computer, the table: Noa's row waits for the office.
    await expect(
      uri
        .getByRole("table", { name: d.office.table.caption })
        .getByRole("row")
        .filter({ hasText: d.state.waiting })
        .first(),
    ).toBeVisible();
    await uri.goto(`/chat/documents/${id}`);
    await expectPhotoShown(uri, id);
    // The file itself, only for a page of the app: kept by nobody, in a
    // sandbox; a link from another site opens nothing.
    const file = await fileOf(uri, RESTAURANT, id);
    expect(file.status()).toBe(200);
    expect(file.headers()["cache-control"]).toBe("private, no-store");
    expect(file.headers()["content-security-policy"]).toContain("sandbox");
    const outside = await uri.request.get(
      `/document-files/${RESTAURANT}/${id}`,
      { headers: { "sec-fetch-site": "cross-site" } },
    );
    expect(outside.status()).toBe(404);
    await expectCleanPage(uri);
  } finally {
    await uri.context().close();
  }
  await expect
    .poll(async () => (await demoDocument(id))?.openedAt)
    .not.toBeNull();

  // Noa's list says it reached the business.
  await page.goto("/chat/documents");
  await expect(documentLink(page, id)).toContainText(
    d.state.received.replace(" <ltr>{date}</ltr>", ""),
  );
  await expectCleanPage(page);
});

test("the office deletes a document's file with a reason, and puts it back from the toast", async ({
  page,
}) => {
  const id = await sendDemoSickNote(NOA.e164);
  written.push({ ids: [id], business: "restaurant" });
  await enterAs(page, "owner");
  await page.goto(`/chat/documents/${id}`);
  await expectPhotoShown(page, id);

  await page.getByRole("button", { name: d.removeFile }).click();
  const sheet = page.getByRole("dialog", { name: d.page.removeTitle });
  await expect(sheet).toBeVisible();
  // A reason from the list, never typed.
  await expect(sheet.getByRole("textbox")).toHaveCount(0);
  await sheet.getByRole("radio", { name: d.reasons.wrong_file }).check();
  await expectCleanPage(page);
  await sheet.getByRole("button", { name: d.removeFile }).click();
  await expect(sheet).toHaveCount(0);

  const removed = d.removed.replace("{reason}", d.reasons.wrong_file);
  await expect(page.getByRole("main").getByText(removed).first()).toBeVisible();
  await expect
    .poll(async () => (await demoDocument(id))?.removedReason)
    .toBe("wrong_file");
  // Removed, its file is nobody's to see, even within its 10 minutes of
  // undo: the page shows no photo, and its address the same 404 as none.
  await expect(
    page.getByRole("main").locator('img[src*="/document-files/"]'),
  ).toHaveCount(0);
  expect((await fileOf(page, RESTAURANT, id)).status()).toBe(404);

  // The way back, from the toast, for ten seconds.
  const toast = page
    .getByRole("status")
    .filter({ hasText: d.page.removedToast });
  await toast.getByRole("button", { name: d.page.undo }).click();
  await expect(
    page.getByRole("status").filter({ hasText: d.page.restoredToast }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText(removed)).toHaveCount(0);
  await expectPhotoShown(page, id);
  await expect.poll(async () => (await demoDocument(id))?.removedAt).toBeNull();
});

test("in the shop, the manager with pay access reads the worker's sick note", async ({
  page,
}) => {
  const id = await demoSeededSickNote("shop");
  expect(id).not.toBeNull();
  await enterAs(page, "shopManager");
  await page.goto("/chat/documents");
  // The office's screen: every document, and "שליחת מסמך לעובדים".
  await expect(
    page.getByRole("heading", { level: 1, name: d.title }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: d.sendToPeople }).first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: d.office.table.caption })
      .getByRole("row")
      // The name column names the person; the next one says which way.
      .filter({ hasText: "תמר אברהם" }),
  ).not.toHaveCount(0);
  await page.goto(`/chat/documents/${id}`);
  // The demo's own sample, the same address as a stored file.
  await expectPhotoShown(page, id ?? "");
  await expect(page.getByText(d.sample)).toBeVisible();
  await expectCleanPage(page);
});

test("the accountant sends a payslip asking for confirmation, and the worker confirms it from Today", async ({
  page,
  browser,
}, testInfo) => {
  test.slow();
  const since = new Date(Date.now() - 1000);
  await enterAs(page, "accountant");
  // Her tabs: Home, the hours for payroll and the documents; no chat.
  const nav = page
    .getByRole("navigation", { name: he.ui.appShell.mainNav })
    .filter({ visible: true });
  await nav
    .getByRole("link", { name: new RegExp(`^${he.modules.chat.outsideNav}`) })
    .click();
  await expect(page).toHaveURL(/\/chat\/documents$/);
  await page
    .getByRole("main")
    .getByRole("link", { name: d.sendToPeople })
    .first()
    .click();
  await expect(page).toHaveURL(/\/chat\/documents\/send\?to=people$/);
  await expect(page.getByText(d.whoToPeople)).toBeVisible();

  await page.getByRole("radio", { name: "נועה כהן" }).check();
  // The list she came from is kept hidden, its table naming Noa the same
  // way: only the send screen's own line counts.
  await expect(
    page
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: d.row.toPerson.replace("{name}", "נועה כהן") })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: d.categories.payslip }),
  ).toBeChecked();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: d.send.pdf }).click();
  await (await chooser).setFiles({
    name: PAYSLIP_NAME,
    mimeType: "application/pdf",
    buffer: minimalPdf("Payslip for the test"),
  });
  // The name as the screen writes it, without its ".pdf".
  await expect(page.getByText("תלוש לבדיקה", { exact: true })).toBeVisible();
  await page.getByRole("switch", { name: d.askConfirm }).click();
  await expectCleanPage(page);
  await page.getByRole("button", { name: d.send.submitPeople }).click();
  await expect(page).toHaveURL(/\/chat\/documents\/[0-9a-f-]{36}$/, {
    timeout: 30_000,
  });
  const id = idIn(page.url());
  written.push({ ids: [id], business: "restaurant" });
  const [sent] = await demoDocumentsBy(GALIT.e164, since);
  expect(sent).toMatchObject({
    id,
    direction: "to_people",
    category: "payslip",
    fileKind: "pdf",
  });
  // Its recipients' marks, for its sender: nobody confirmed yet.
  // Its section of the page shown, never a kept, hidden list's badge.
  const recipients = page
    .locator("section")
    .filter({ visible: true })
    .filter({ has: page.getByRole("heading", { name: d.page.recipients }) });
  await expect(recipients).toHaveCount(1);
  await expect(recipients.getByText("נועה כהן")).toBeVisible();
  await expect(recipients.getByText(d.page.markWaiting)).toBeVisible();

  // Noa confirms it from Today, where it waits for her.
  const noa = await secondPage(browser, testInfo);
  try {
    await enterAs(noa, "worker");
    const card = noa.locator(`[data-today-document="${id}"]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(d.today.toConfirm);
    await card.getByRole("button", { name: d.confirm }).click();
    await expect
      .poll(async () => (await demoDocumentMark(id, NOA.e164))?.confirmedAt)
      .not.toBeNull();
    // Today is drawn again without it.
    await expect(card).toHaveCount(0);
    await noa.reload();
    await expect(card).toHaveCount(0);
  } finally {
    await noa.context().close();
  }

  // Galit's page says who confirmed.
  await page.reload();
  await expect(
    recipients.getByText(
      d.page.markConfirmed.replace(" <ltr>{date}</ltr>", ""),
    ),
  ).toBeVisible();
});

test("the activity log shows document rows to the office, and not to a manager without pay access", async ({
  page,
  browser,
}, testInfo) => {
  const id = await sendDemoSickNote(NOA.e164);
  written.push({ ids: [id], business: "restaurant" });
  const row = he.app.manage.activity.actions.document.sendToBusiness;

  await enterAs(page, "owner");
  await page.goto("/manage/activity");
  await expect(
    page.getByRole("main").getByText(row).filter({ visible: true }).first(),
  ).toBeVisible();

  const shiran = await secondPage(browser, testInfo);
  try {
    await enterAs(shiran, "manager");
    await shiran.goto("/manage/activity");
    await expect(
      shiran.getByRole("heading", {
        level: 1,
        name: he.app.manage.activity.title,
      }),
    ).toBeVisible();
    await expect(shiran.getByRole("main").getByText(row)).toHaveCount(0);
  } finally {
    await shiran.context().close();
  }
});

test("the office downloads every document of a month, with their list; no link and nobody else does", async ({
  page,
  browser,
}, testInfo) => {
  const id = await sendDemoSickNote(NOA.e164);
  written.push({ ids: [id], business: "restaurant" });
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  await enterAs(page, "owner");
  const origin = new URL(page.url()).origin;

  // A link to it, as anyone could post one in a chat (the app's own page)
  // or send it from outside the browser, downloads nothing; nor does
  // another site's form. Noa's sick note stays unopened.
  for (const site of ["same-origin", "none"]) {
    const link = await page.request.get(
      `/document-files/download?month=${month}`,
      { headers: { "sec-fetch-site": site } },
    );
    expect(link.status(), site).toBe(405);
  }
  const forged = await page.request.post("/document-files/download", {
    form: { month },
    headers: { "sec-fetch-site": "cross-site", origin: "https://evil.test" },
  });
  expect(forged.status()).toBe(404);
  expect((await demoDocument(id))?.openedAt).toBeNull();

  // The page's own form does.
  await page.goto("/chat/documents");
  const button = page
    .getByRole("main")
    .getByRole("button", { name: /^הורדת המסמכים של / })
    .filter({ visible: true });
  await expect(button).toBeVisible();
  const download = page.waitForEvent("download");
  await button.click();
  const saved = await (await download).path();
  const entries = unzip(await readFile(saved));
  const names = [...entries.keys()];
  expect(names).toContain(`${d.download.list}.csv`);
  // This month's sick note is in it as a file, besides the list.
  expect(names.length).toBeGreaterThan(1);
  const list = entries.get(`${d.download.list}.csv`)?.data.toString("utf8");
  expect(list).toContain(d.categories.sick_note);
  // Each file in it is an opening: Noa's sick note reached the business.
  await expect
    .poll(async () => (await demoDocument(id))?.openedAt)
    .not.toBeNull();
  // The keep-a-copy notice is read with it.
  await page.reload();
  await expect(page.getByRole("heading", { name: d.notice.title })).toHaveCount(
    0,
  );

  // Noa is on the staff, not in the office: the same 404 as nothing, even
  // for a form as the page sends it.
  const noa = await secondPage(browser, testInfo);
  try {
    await enterAs(noa, "worker");
    const headers = { "sec-fetch-site": "same-origin", origin };
    const forms: Record<string, string>[] = [{ month }, { person: NOA.id }];
    for (const form of forms) {
      const refused = await noa.request.post("/document-files/download", {
        form,
        headers,
      });
      expect(refused.status(), JSON.stringify(form)).toBe(404);
    }
  } finally {
    await noa.context().close();
  }
});

test("a sample's file is the office's and its person's alone, in the shop too", async ({
  page,
}) => {
  const sick = await demoSeededSickNote("shop");
  expect(sick).not.toBeNull();
  // Tamar, its person, opens her own; the restaurant's isn't hers.
  await enterAs(page, "shopWorker");
  expect((await fileOf(page, SHOP, sick ?? "")).status()).toBe(200);
  const restaurant = await demoSeededSickNote("restaurant");
  expect((await fileOf(page, RESTAURANT, restaurant ?? "")).status()).toBe(404);
  // A file never answers a prefetch.
  const prefetch = await page.request.get(`/document-files/${SHOP}/${sick}`, {
    headers: { "sec-fetch-site": "same-origin", "next-router-prefetch": "1" },
  });
  expect(prefetch.status()).toBe(404);
});

test("viewing as a manager shows only that documents aren't shown", async ({
  page,
}) => {
  // A code by SMS, which may wait out the resend wait of another spec's.
  test.slow();
  await signIn(page, ADMIN, /\/admin$/);
  await page.goto("/admin/businesses/demo-restaurant");
  await page
    .getByRole("button", {
      name: he.admin.setup.viewAs.as.manager,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/chat/documents");
  await expect(page.getByText(c.viewing)).toBeVisible();
  await expect(
    page.getByRole("main").locator('a[href^="/chat/documents/"]'),
  ).toHaveCount(0);
  await expectCleanPage(page);
  const sick = await demoSeededSickNote("restaurant");
  await page.goto(`/chat/documents/${sick}`);
  await expect(page.getByText(c.viewing)).toBeVisible();
  expect((await fileOf(page, RESTAURANT, sick ?? "")).status()).toBe(404);
});
