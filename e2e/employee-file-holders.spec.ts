import { expect, type Page, type TestInfo, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import {
  clearDemoFileAcks,
  demoFileReadsBy,
  demoFileViews,
  restoreDemoFile,
  setDemoBankReview,
  setDemoFileGaps,
  setDemoModuleSettings,
} from "./db";
import { enterAs, expectCleanPage } from "./orders-parts";
import { SMS_COOLDOWN_MS, secondPage } from "./session";
import { latestCode, setDemoModule } from "./sms";
import { heT } from "./t";

// The owner's and the accountant's view of the hiring file (profile H6a), at
// each width. The local demo restaurant's module is off, so each test
// switches it on and off again, gives Noa and Yoav their made-up files back
// (Yoav without his account, and here without his pension too: two missing)
// and starts with no holder having confirmed the duties. People come in
// through the demo door, so no sign-in SMS precedes the file's own code.
// From supabase/seed.sql: Uri, the owner; Shiran, a manager; Noa and Yoav,
// workers; Galit, the accountant.
const URI = {
  id: "00000000-0000-4000-a000-000000000001",
  e164: "+972500000001",
};
const SHIRAN = { id: "00000000-0000-4000-a000-000000000002" };
const NOA = { id: "00000000-0000-4000-a000-000000000003", name: "נועה כהן" };
const YOAV = { id: "00000000-0000-4000-a000-000000000004", name: "יואב לוי" };
const GALIT = {
  id: "00000000-0000-4000-a000-000000000014",
  e164: "+972500000014",
};

const f = he.app.team.file;
const main = (page: Page) => page.getByRole("main");
const visible = (page: Page, role: "button" | "link", name: string) =>
  page.getByRole(role, { name, exact: true }).filter({ visible: true });
const isDesktop = (testInfo: TestInfo) => testInfo.project.name === "desktop";

const yoavMissing = heT("app.team.file.line.missingGroups", {
  groups: "חשבון בנק ופנסיה",
});

/**
 * A file's words on /team, as each shape shows them: under the person on a
 * phone and a tablet, in the table's details cell on a desktop, where the
 * lists are hidden. The same words in each.
 */
const fileWords = (page: Page, testInfo: TestInfo, words: string) =>
  (isDesktop(testInfo)
    ? main(page).getByRole("cell", { name: words })
    : main(page).getByText(words, { exact: false }).filter({ visible: true })
  ).first();

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/**
 * Press the gate's action ("אישור ושליחת קוד" or "שליחת קוד"), waiting out
 * the auth server's wait if a code went to this number just now and then
 * pressing the action the gate shows again (a refused send leaves the
 * duties' card up when it started there), and give the code that came.
 */
async function sendFileCode(
  page: Page,
  action: string,
  phone: string,
): Promise<string> {
  let since = new Date(Date.now() - 1000);
  await visible(page, "button", action).click();
  const boxes = page.getByLabel(f.code.label);
  const tooSoon = page.getByText(f.code.rateLimit);
  await expect(boxes.or(tooSoon)).toBeVisible();
  if (await tooSoon.isVisible()) {
    await page.waitForTimeout(SMS_COOLDOWN_MS + 500);
    since = new Date(Date.now() - 1000);
    await visible(page, "button", f.duties.confirm)
      .or(visible(page, "button", f.locked.send))
      .click();
  }
  await expect(boxes).toBeVisible();
  return latestCode(phone, since);
}

/** The duties, then the code: the file opens. */
async function openFile(page: Page, phone: string) {
  await expect(main(page).getByText(f.duties.title)).toBeVisible();
  const code = await sendFileCode(page, f.duties.confirm, phone);
  await page.getByLabel(f.code.label).fill(code);
  await expect(
    main(page).getByRole("heading", { name: f.sections.identity }),
  ).toBeVisible();
}

test.beforeEach(async () => {
  await setDemoModule("employee_files", true);
  await restoreDemoFile(NOA.id);
  await restoreDemoFile(YOAV.id);
  await setDemoFileGaps(YOAV.id, ["pension"]);
  await clearDemoFileAcks();
});

test.afterEach(async () => {
  await restoreDemoFile(NOA.id);
  await restoreDemoFile(YOAV.id);
  await clearDemoFileAcks();
  await setDemoModuleSettings("employee_files", {});
  await setDemoModule("employee_files", false);
});

test("the accountant opens Noa's file with a code, and her account shows for a minute", async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await enterAs(page, "accountant");
  await open(page, "/home");
  const card = main(page).getByRole("region", {
    name: he.app.home.accountant.files.title,
  });
  await expect(
    card.getByText(heT("app.home.accountant.files.missing", { count: 1 })),
  ).toBeVisible();
  await card
    .getByRole("link", { name: he.app.home.accountant.files.open })
    .click();
  await expect(page).toHaveURL(/\/team$/);
  await page.waitForLoadState("networkidle");

  // The files alone: no numbers, Noa complete, Yoav's two parts named.
  await expect(main(page).getByText(f.filesOnly.note)).toBeVisible();
  await expect(fileWords(page, testInfo, yoavMissing)).toBeVisible();
  await expect(fileWords(page, testInfo, f.line.complete)).toBeVisible();
  await expect(main(page).getByText(/05\d-\d{3}-\d{4}/)).toHaveCount(0);

  await main(page)
    .getByRole("link", { name: new RegExp(NOA.name) })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/team/${NOA.id}/file$`));
  await page.waitForLoadState("networkidle");
  await expect(main(page).getByText(f.duties.title)).toBeVisible();
  await expectCleanPage(page);

  await openFile(page, GALIT.e164);
  const bank = main(page).getByRole("region", { name: f.sections.bank });
  await expect(bank.getByText(/^•••\d{3,4}$/)).toBeVisible();
  await expectCleanPage(page);

  await bank.getByRole("button", { name: he.app.file.masked.show }).click();
  const digits = bank.getByText(/^\d{5,}$/);
  await expect(digits).toBeVisible();
  const shown = (await digits.textContent()) ?? "";
  await page.clock.fastForward(60_000);
  await expect(digits).toHaveCount(0);
  await expect(bank.getByText(/^•••\d{3,4}$/)).toBeVisible();

  // The file's read once today, then the account's own row; never a value.
  const views = await demoFileViews(GALIT.id, NOA.id);
  expect(views).toEqual([
    { person: NOA.id, fields: ["file"] },
    { person: NOA.id, fields: ["bank_account"] },
  ]);
  expect(JSON.stringify(views)).not.toContain(shown);
  expect(
    heT("app.manage.activity.actions.employee.view", {
      fields: he.app.manage.activity.actions.employee.viewFields.bank_account,
      person: NOA.name,
    }),
  ).toBe("צפייה במספר החשבון של נועה כהן");
});

test("a manager sees how many are missing, and nothing of the file", async ({
  page,
}, testInfo) => {
  await enterAs(page, "manager");
  await open(page, "/team");
  await expect(
    fileWords(
      page,
      testInfo,
      heT("app.team.file.line.missingCount", { count: 2 }),
    ),
  ).toBeVisible();
  for (const group of Object.values(f.groups)) {
    await expect(main(page).getByText(group, { exact: false })).toHaveCount(0);
  }
  if (isDesktop(testInfo)) {
    await expect(
      main(page).getByRole("columnheader", { name: f.columns.details }),
    ).toBeVisible();
  }
  await expectCleanPage(page);

  await open(page, `/team/${YOAV.id}`);
  await expect(
    main(page).getByText(heT("app.team.file.card.missingCount", { count: 2 })),
  ).toBeVisible();
  await expect(main(page).getByText(f.card.onlyHolders)).toBeVisible();
  await expect(visible(page, "link", f.card.open)).toHaveCount(0);
  await expectCleanPage(page);

  await open(page, `/team/${YOAV.id}/file`);
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  expect(await demoFileReadsBy(SHIRAN.id)).toBe(0);
});

test("the owner sees who is missing what, and sends Yoav the link", async ({
  page,
}, testInfo) => {
  await enterAs(page, "owner");
  await open(page, "/team");
  await expect(fileWords(page, testInfo, yoavMissing)).toBeVisible();
  if (isDesktop(testInfo)) {
    await expect(
      main(page).getByRole("columnheader", {
        name: heT("app.team.file.columns.form101", {
          year: new Date().getFullYear(),
        }),
      }),
    ).toBeVisible();
  }

  await open(page, `/team/${YOAV.id}`);
  await expect(
    main(page).getByText(
      heT("app.team.file.card.missingGroups", { groups: "חשבון בנק ופנסיה" }),
    ),
  ).toBeVisible();
  await visible(page, "button", f.card.share).click();
  const sheet = page.getByRole("dialog", { name: f.card.shareTitle });
  await expect(sheet).toBeVisible();
  const message = (await sheet.textContent()) ?? "";
  expect(message).toContain("/me/file");
  for (const group of Object.values(f.groups)) {
    expect(message).not.toContain(group);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await visible(page, "link", f.card.open).click();
  await expect(page).toHaveURL(new RegExp(`/team/${YOAV.id}/file$`));
  await expect(main(page).getByText(f.duties.title)).toBeVisible();
  expect(await demoFileReadsBy(URI.id)).toBe(0);
});

test("a locked file asks for a code again, and the duties only once", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await enterAs(page, "accountant");
  await open(page, `/team/${NOA.id}/file`);
  await openFile(page, GALIT.e164);
  const stepUp = async () =>
    (await context.cookies()).some((cookie) => cookie.name === "ca_file_open");
  expect(await stepUp()).toBe(true);

  // The tab's own 15 minutes pass, not the server's (only the page's clock
  // runs ahead): asked, the server says the file is open, so it shows again,
  // and nothing was forgotten.
  const asked = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.clock.fastForward("15:01");
  await asked;
  await expect(
    main(page).getByRole("heading", { name: f.sections.identity }),
  ).toBeVisible();
  await expect(main(page).getByText(f.locked.title)).toHaveCount(0);
  expect(await stepUp()).toBe(true);

  // The server's 15 minutes pass too (its cookie gone by itself): the next
  // look finds the file closed.
  await context.clearCookies({ name: "ca_file_open" });
  await page.clock.fastForward("15:01");
  await expect(main(page).getByText(f.locked.title)).toBeVisible();

  // A code opens it again, with no duties on the way.
  const code = await sendFileCode(page, f.locked.send, GALIT.e164);
  await expect(main(page).getByText(f.duties.title)).toHaveCount(0);
  await page.getByLabel(f.code.label).fill(code);
  // The code's boxes went with the gate: the file's first heading has the
  // focus, so where the person is is heard.
  await expect(
    main(page).getByRole("heading", { name: f.sections.identity }),
  ).toBeFocused();

  // "נעילת התיק" went with the file: "התיק נעול" has the focus.
  await visible(page, "button", f.lock.action).click();
  await expect(
    main(page).getByRole("heading", { name: f.locked.title }),
  ).toBeFocused();
});

test("a file locked in one tab closes at once in another", async ({
  page,
  context,
}) => {
  await enterAs(page, "accountant");
  await open(page, `/team/${NOA.id}/file`);
  await openFile(page, GALIT.e164);
  const other = await context.newPage();
  await open(other, `/team/${YOAV.id}/file`);
  await expect(
    main(other).getByRole("heading", { name: f.sections.identity }),
  ).toBeVisible();

  await page.bringToFront();
  await visible(page, "button", f.lock.action).click();
  await expect(main(page).getByText(f.locked.title)).toBeVisible();
  // Told by the first tab, with no press there and no minute waited.
  await expect(main(other).getByText(f.locked.title)).toBeVisible();
  await expect(
    main(other).getByRole("heading", { name: f.sections.identity }),
  ).toHaveCount(0);
  await other.close();
});

test("the file answers no-store and never puts a number in an address", async ({
  page,
}) => {
  await enterAs(page, "accountant");
  const asked: { url: string; method: string }[] = [];
  page.on("request", (request) =>
    asked.push({ url: request.url(), method: request.method() }),
  );
  const response = await page.goto(`/team/${NOA.id}/file`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await page.waitForLoadState("networkidle");
  await openFile(page, GALIT.e164);

  const identity = main(page).getByRole("region", {
    name: f.sections.identity,
  });
  const before = asked.length;
  await identity.getByRole("button", { name: he.app.file.masked.show }).click();
  const digits = identity.getByText(/^\d{9}$/);
  await expect(digits).toBeVisible();
  const shown = (await digits.textContent()) ?? "";
  // The number came in a POST's answer, to the page's own address.
  const reveal = asked.slice(before);
  expect(
    reveal.some(
      (request) =>
        request.method === "POST" &&
        new URL(request.url).pathname === `/team/${NOA.id}/file`,
    ),
  ).toBe(true);
  expect(asked.some((request) => request.url.includes(shown))).toBe(false);
  expect(new URL(page.url()).pathname).toBe(`/team/${NOA.id}/file`);
  expect(new URL(page.url()).search).toBe("");
});

test("with the module off, nothing of the file shows", async ({
  page,
  browser,
}, testInfo) => {
  await setDemoModule("employee_files", false);
  await enterAs(page, "accountant");
  await open(page, "/home");
  await expect(
    main(page).getByRole("region", {
      name: he.app.home.accountant.files.title,
    }),
  ).toHaveCount(0);
  await open(page, "/team");
  await expect(
    page.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();

  const uri = await secondPage(browser, testInfo);
  await enterAs(uri, "owner");
  await open(uri, "/team");
  await expect(main(uri).getByText(f.line.complete)).toHaveCount(0);
  await expect(main(uri).getByText(yoavMissing)).toHaveCount(0);
  await open(uri, `/team/${NOA.id}/file`);
  await expect(
    uri.getByRole("heading", { level: 1, name: he.app.notFound.title }),
  ).toBeVisible();
  await uri.context().close();
});

test("a disputed account shows to the holder, with no action yet", async ({
  page,
}, testInfo) => {
  await setDemoBankReview(NOA.id, "disputed");
  await enterAs(page, "owner");
  await open(page, "/team");
  await expect(fileWords(page, testInfo, f.line.bankReview)).toBeVisible();

  await open(page, `/team/${NOA.id}/file`);
  await openFile(page, URI.e164);
  const bank = main(page).getByRole("region", { name: f.sections.bank });
  // Noa's form of address is cleared with her file (`restoreDemoFile`).
  await expect(
    bank.getByText(
      heT("app.team.file.review.disputed", { first: "נועה", form: "x" }),
    ),
  ).toBeVisible();
  await expectCleanPage(page);
});
