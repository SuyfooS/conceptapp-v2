import { randomUUID } from "node:crypto";
import he from "../messages/he.json" with { type: "json" };
import { captchaSettled } from "./captcha";
import {
  bumpDemoBankChange,
  clearDemoFileAcks,
  clearDemoMinor,
  clearDemoTaxYears,
  clearPhoneChanges,
  codesSentSince,
  demoDirectGroups,
  demoFileActions,
  demoFileFacts,
  demoFileReadsBy,
  demoFileViews,
  fileStepUpsOf,
  logDemoFileRow,
  notePhoneChange,
  readFileAs,
  restoreDemoFile,
  restoreDemoPeriodStart,
  setDemoBankReview,
  setDemoDirectGroups,
  setDemoFileGaps,
  setDemoMinor,
  setDemoModuleSettings,
  setDemoPeriodStart,
} from "./db";
import { hearFileCheck } from "./file-watch";
import { enterAs, expectCleanPage } from "./orders-parts";
import { SMS_COOLDOWN_MS, secondPage } from "./session";
import { latestCode, setDemoModule } from "./sms";
import { heT } from "./t";
import { expect, type Page, type TestInfo, test } from "./test";

// The owner's and the accountant's view of the hiring file (profile H6a), at
// each width. The local demo restaurant's module is off, so each test
// switches it on and off again, gives Noa and Yoav their made-up files back
// (Yoav without his account, and here without his pension too: two missing)
// and starts with no holder having confirmed the duties. People come in
// through the demo door, so no sign-in SMS precedes the file's own code.
// From supabase/seed.sql: Uri, the owner; Shiran, a manager; Noa and Yoav,
// workers; Galit, the accountant. What a holder does there (H6b): an account
// confirmed after a change meanwhile, a disputed one from Today to the file,
// a part handed directly with its undo, a pension whose day passed, a write
// without a fresh step-up, what happened in the file, a minor's checklist
// and the team's filter. The step-up kept in the database too, for the
// sign-in it was taken on (20261127000400_file_step_up.sql), and the week
// after a phone change, when no code goes.
const URI = {
  id: "00000000-0000-4000-a000-000000000001",
  e164: "+972500000001",
};
const SHIRAN = { id: "00000000-0000-4000-a000-000000000002" };
const people = he.auth.enter.people;
const business = he.auth.enter.businesses.restaurant.name;
const NOA = { id: "00000000-0000-4000-a000-000000000003", name: "נועה כהן" };
const YOAV = { id: "00000000-0000-4000-a000-000000000004", name: "יואב לוי" };
const GALIT = {
  id: "00000000-0000-4000-a000-000000000014",
  e164: "+972500000014",
};
const RESTAURANT = "00000000-0000-4000-b000-000000000001";

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
 * Each press once the "אני לא רובוט" check is done.
 */
async function sendFileCode(
  page: Page,
  action: string,
  phone: string,
): Promise<string> {
  let since = new Date(Date.now() - 1000);
  await captchaSettled(page);
  await visible(page, "button", action).click();
  const boxes = page.getByLabel(f.code.label);
  const tooSoon = page.getByText(f.code.rateLimit);
  await expect(boxes.or(tooSoon)).toBeVisible();
  if (await tooSoon.isVisible()) {
    await page.waitForTimeout(SMS_COOLDOWN_MS + 500);
    since = new Date(Date.now() - 1000);
    await captchaSettled(page);
    await visible(page, "button", f.duties.confirm)
      .or(visible(page, "button", f.locked.send))
      .click();
  }
  await expect(boxes).toBeVisible();
  return latestCode(phone, since);
}

/**
 * This browser's sign-in, as the auth server names it in the access token
 * the session cookie holds (@supabase/ssr's `base64-` value, in pieces when
 * long). Never the newest the server keeps: checking a code opens one of its
 * own, ended at once.
 */
async function sessionHere(page: Page): Promise<string> {
  const pieces = (await page.context().cookies())
    .filter((one) => /-auth-token(\.\d+)?$/.test(one.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const kept = Buffer.from(
    pieces
      .map((one) => one.value)
      .join("")
      .replace(/^base64-/, ""),
    "base64url",
  ).toString("utf8");
  const token = (JSON.parse(kept) as { access_token: string }).access_token;
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
  ) as { session_id?: string };
  expect(claims.session_id, "the token's sign-in").toBeTruthy();
  return claims.session_id ?? "";
}

/**
 * The duties, then the code: the file opens, and its own first check is
 * answered before the test goes on (`hearFileCheck`), so a test may then
 * clear the cookie or move the page's clock.
 */
async function openFile(page: Page, phone: string) {
  await expect(main(page).getByText(f.duties.title)).toBeVisible();
  const code = await sendFileCode(page, f.duties.confirm, phone);
  const checked = await hearFileCheck(page);
  await page.getByLabel(f.code.label).fill(code);
  await expect(
    main(page).getByRole("heading", { name: f.sections.identity }),
  ).toBeVisible();
  await checked();
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
  await clearPhoneChanges(GALIT.id);
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
  // runs ahead): asked only to read, since nobody did anything, the server
  // says the file is open, so it shows again for the time its step-up has
  // left, and nothing was forgotten.
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

test("the files open in the database for this sign-in alone, and locking and signing out close them there", async ({
  page,
}) => {
  await enterAs(page, "accountant");
  await open(page, `/team/${NOA.id}/file`);
  await openFile(page, GALIT.e164);
  await expectCleanPage(page);
  const here = await sessionHere(page);
  expect(await fileStepUpsOf(GALIT.id)).toEqual([
    { businessId: RESTAURANT, sessionId: here },
  ]);
  // Asked by her own token, past the screens: this sign-in reads, another
  // reads nothing.
  expect(await readFileAs(GALIT.id, here, RESTAURANT, NOA.id)).toBe("holder");
  expect(await readFileAs(GALIT.id, randomUUID(), RESTAURANT, NOA.id)).toBe(
    "step_up",
  );

  // "נעילת התיק" closes it in the database too.
  await visible(page, "button", f.lock.action).click();
  await expect(main(page).getByText(f.locked.title)).toBeVisible();
  await expect.poll(() => fileStepUpsOf(GALIT.id)).toEqual([]);
  expect(await readFileAs(GALIT.id, here, RESTAURANT, NOA.id)).toBe("step_up");

  // A code opens it again, there as well.
  const code = await sendFileCode(page, f.locked.send, GALIT.e164);
  await page.getByLabel(f.code.label).fill(code);
  await expect(
    main(page).getByRole("heading", { name: f.sections.identity }),
  ).toBeVisible();
  expect(await fileStepUpsOf(GALIT.id)).toEqual([
    { businessId: RESTAURANT, sessionId: here },
  ]);

  // Signing out closes it there before the session ends.
  await open(page, "/me");
  await page.getByRole("button", { name: he.app.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await expect.poll(() => fileStepUpsOf(GALIT.id)).toEqual([]);
});

test("a holder whose number changed this week gets no code, and is told when the files open", async ({
  page,
}) => {
  await notePhoneChange(GALIT.id, 2);
  await enterAs(page, "accountant");
  await open(page, `/team/${NOA.id}/file`);
  await expect(main(page).getByText(f.duties.title)).toBeVisible();
  const before = new Date(Date.now() - 1000);
  await visible(page, "button", f.duties.confirm).click();
  await expect(
    main(page).getByText(f.code.phoneHold.split("{date}")[0] ?? ""),
  ).toBeVisible();
  await expect(page.getByLabel(f.code.label)).toHaveCount(0);
  await expect(visible(page, "button", f.duties.confirm)).toBeDisabled();
  expect(await codesSentSince(GALIT.e164, before)).toBe(0);
  expect(await fileStepUpsOf(GALIT.id)).toEqual([]);
  await expectCleanPage(page);
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

/** A region's words, in the shape that shows them (a list, or the desktop's table). */
const shownIn = (region: ReturnType<Page["getByRole"]>, words: string) =>
  region.getByText(words, { exact: false }).filter({ visible: true }).first();

test("the owner confirms Noa's new account, after a change meanwhile is said", async ({
  page,
}, testInfo) => {
  await setDemoBankReview(NOA.id, "new");
  await enterAs(page, "owner");
  await open(page, `/team/${NOA.id}/file`);
  await openFile(page, URI.e164);
  const bank = main(page).getByRole("region", { name: f.sections.bank });
  const confirm = bank.getByRole("button", { name: f.review.confirmNew });
  await expect(confirm).toBeVisible();
  await expect(bank.getByText(f.review.held)).toBeVisible();
  await expectCleanPage(page);

  // The account's digits shown, as an owner looks before confirming.
  const show = bank.getByRole("button", { name: he.app.file.masked.show });
  await show.click();
  const digits = bank.getByText(/^\d{5,}$/);
  await expect(digits).toBeVisible();
  // The reveal slides the step-up, so its answer also carries the page drawn
  // again (a cookie set in an action), streamed in after the digits: its line
  // in "מה קרה בתיק" says that drawing landed, read before the change below.
  // Changed before it landed, the screen would already show the newer change
  // and the press would confirm it, with nothing to say.
  const history = main(page).getByRole("region", { name: f.history.title });
  await expect(
    shownIn(
      history,
      heT("app.team.file.history.reveal", {
        fields: he.app.manage.activity.actions.employee.viewFields.bank_account,
      }),
    ),
  ).toBeVisible();

  // Changed again while the screen was open: said, with the focus on it,
  // and the newer change drawn under the same button, its digits hidden
  // again (the second review: never the old number beside the new bank).
  await bumpDemoBankChange(NOA.id);
  await confirm.click();
  const moved = bank.getByRole("alert");
  await expect(moved).toHaveText(f.review.moved);
  await expect(moved).toBeFocused();
  await expect(confirm).toBeVisible();
  await expect(digits).toHaveCount(0);
  await expect(show).toBeVisible();

  await confirm.click();
  await expect(
    page.getByText(heT("app.team.file.review.confirmed", { first: "נועה" })),
  ).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(
    main(page).getByRole("heading", { name: f.sections.bank }),
  ).toBeFocused();
  expect((await demoFileFacts(NOA.id))?.bankReview).toBeNull();
  expect(
    (await demoFileActions(NOA.id)).filter(
      (row) => row.action === "employee.bank_ack",
    ),
  ).toEqual([{ action: "employee.bank_ack", actor: URI.id }]);

  await expect(shownIn(history, f.history.bankAck)).toBeVisible();
  await expect(shownIn(history, people.owner.name)).toBeVisible();
  await expectCleanPage(page);

  await open(page, "/team");
  await expect(fileWords(page, testInfo, f.line.bankReview)).toHaveCount(0);
  await expectCleanPage(page);
});

test("a disputed account shows on Today, on the team and in the file, and is confirmed there", async ({
  page,
}, testInfo) => {
  await setDemoBankReview(NOA.id, "disputed");
  await logDemoFileRow(NOA.id, "employee.bank_disputed", { person: NOA.id });
  await enterAs(page, "owner");

  await open(page, "/team");
  await expect(fileWords(page, testInfo, f.line.bankDisputed)).toBeVisible();
  await expectCleanPage(page);

  await open(page, "/home");
  const reviews = main(page).getByRole("region", {
    name: heT("app.home.fileReviews.title", { count: 1 }),
  });
  await expect(reviews.getByText(he.app.home.fileReviews.body)).toBeVisible();
  // Noa's form of address is cleared with her file (`restoreDemoFile`).
  const row = reviews.getByRole("link", { name: new RegExp(NOA.name) });
  await expect(row).toContainText(
    heT("app.home.fileReviews.disputed", { form: "x" }),
  );
  await expectCleanPage(page);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/team/${NOA.id}/file$`));
  await page.waitForLoadState("networkidle");

  await openFile(page, URI.e164);
  const bank = main(page).getByRole("region", { name: f.sections.bank });
  await expect(
    bank.getByText(
      heT("app.team.file.review.disputed", { first: "נועה", form: "x" }),
    ),
  ).toBeVisible();
  await expect(
    bank.getByText(
      heT("app.team.file.review.notTheirs", { first: "נועה", form: "x" }),
    ),
  ).toBeVisible();
  const history = main(page).getByRole("region", { name: f.history.title });
  await expect(shownIn(history, f.history.bankDisputed)).toBeVisible();
  await expect(shownIn(history, NOA.name)).toBeVisible();
  await expectCleanPage(page);

  await bank
    .getByRole("button", {
      name: heT("app.team.file.review.confirmDisputed", { first: "נועה" }),
    })
    .click();
  await expect(
    page.getByText(heT("app.team.file.review.confirmed", { first: "נועה" })),
  ).toBeVisible();
  await expect
    .poll(async () => (await demoFileFacts(NOA.id))?.bankReview)
    .toBe(null);
  await open(page, "/home");
  await expect(
    main(page).getByRole("region", {
      name: heT("app.home.fileReviews.title", { count: 1 }),
    }),
  ).toHaveCount(0);
});

test("the accountant marks Yoav's account handed directly, undoes it, and marks it again, a stale press and a dropped undo said", async ({
  page,
}, testInfo) => {
  await enterAs(page, "accountant");
  await open(page, `/team/${YOAV.id}/file`);
  await openFile(page, GALIT.e164);
  const bank = main(page).getByRole("region", { name: f.sections.bank });
  const marked = heT("app.team.file.direct.marked", {
    group: f.direct.groups.bank,
  });

  await bank.getByRole("button", { name: f.direct.mark }).click();
  await expect(page.getByText(marked)).toBeVisible();
  // The button pressed went with its row: the focus is on "ביטול".
  const undo = page.getByRole("button", { name: f.direct.undo });
  await expect(undo).toBeFocused();
  await expect(bank.getByText(f.rows.direct, { exact: true })).toBeVisible();
  expect(await demoDirectGroups(YOAV.id)).toEqual(["bank"]);
  await expectCleanPage(page);

  await page.keyboard.press("Enter");
  await expect(
    page.getByText(
      heT("app.team.file.direct.unmarked", { group: f.direct.groups.bank }),
    ),
  ).toBeVisible();
  await expect(bank.getByText(f.rows.missing, { exact: true })).toBeVisible();
  await expect.poll(() => demoDirectGroups(YOAV.id)).toEqual([]);
  await expect(
    main(page).getByRole("heading", { name: f.sections.bank }),
  ).toBeFocused();

  // A screen drawn before another holder's press, here written behind it:
  // its press finds the account marked already, says so, writes nothing and
  // offers no "ביטול", and the page is drawn with the marks as they are.
  const stale = await page.context().newPage();
  await open(stale, `/team/${YOAV.id}/file`);
  const staleBank = main(stale).getByRole("region", {
    name: f.sections.bank,
  });
  const staleMark = staleBank.getByRole("button", { name: f.direct.mark });
  await expect(staleMark).toBeVisible();
  await setDemoDirectGroups(YOAV.id, ["bank"]);
  await staleMark.click();
  await expect(
    stale.getByText(
      heT("app.team.file.direct.alreadyMarked", {
        group: f.direct.groups.bank,
      }),
    ),
  ).toBeVisible();
  await expect(stale.getByRole("button", { name: f.direct.undo })).toHaveCount(
    0,
  );
  await expect(
    staleBank.getByText(f.rows.direct, { exact: true }),
  ).toBeVisible();
  expect(await demoDirectGroups(YOAV.id)).toEqual(["bank"]);
  await stale.close();
  // Taken off behind the screen again, so this page's press below changes
  // the file.
  await setDemoDirectGroups(YOAV.id, []);

  await bank.getByRole("button", { name: f.direct.mark }).click();
  await expect(page.getByText(marked)).toBeVisible();
  await expect.poll(() => demoDirectGroups(YOAV.id)).toEqual(["bank"]);
  const unmark = bank.getByRole("button", { name: f.direct.unmark });
  await expect(unmark).toBeVisible();

  // Its "ביטול" dropped on the way (the network, here): said in the bank's
  // own row, under the button that is now the way back, with the focus on
  // it so it is heard where the part is; the mark stays.
  const filePath = (url: URL) => url.pathname === `/team/${YOAV.id}/file`;
  let dropped = 0;
  await page.route(filePath, async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      dropped > 0 ||
      !(request.postData() ?? "").includes('"bank"')
    ) {
      await route.fallback();
      return;
    }
    dropped += 1;
    await route.abort();
  });
  await page.getByRole("button", { name: f.direct.undo }).click();
  const refused = bank.getByRole("alert");
  await expect(refused).toHaveText(
    `${heT("app.team.file.direct.undoRefused", {
      group: f.direct.groups.bank,
    })} ${heT("app.team.file.direct.undoWayBack", { label: f.direct.unmark })}`,
  );
  await expect(refused).toBeFocused();
  expect(dropped).toBe(1);
  await page.unroute(filePath);
  expect(await demoDirectGroups(YOAV.id)).toEqual(["bank"]);
  await expect(unmark).toBeVisible();
  // The toast went with its "ביטול".
  await expect(page.getByText(marked)).toHaveCount(0);
  await expectCleanPage(page);

  const direct = (await demoFileActions(YOAV.id)).filter(
    (row) => row.action === "employee.direct",
  );
  expect(direct).toEqual([
    { action: "employee.direct", actor: GALIT.id },
    { action: "employee.direct", actor: GALIT.id },
    { action: "employee.direct", actor: GALIT.id },
  ]);

  await open(page, "/team");
  await expect(
    fileWords(
      page,
      testInfo,
      heT("app.team.file.line.missingGroups", { groups: f.groups.pension }),
    ),
  ).toBeVisible();

  // The step-up is still fresh: the file opens with no code.
  await open(page, `/team/${YOAV.id}/file`);
  const history = main(page).getByRole("region", { name: f.history.title });
  await expect(
    shownIn(
      history,
      heT("app.team.file.history.direct", { groups: f.direct.groups.bank }),
    ),
  ).toBeVisible();
  await expect(shownIn(history, f.history.directCleared)).toBeVisible();
});

test("a pension whose day passed is marked as the business's choice", async ({
  page,
}) => {
  const was = await setDemoPeriodStart(YOAV.id, 70);
  try {
    await enterAs(page, "owner");
    await open(page, `/team/${YOAV.id}/file`);
    await openFile(page, URI.e164);
    const pension = main(page).getByRole("region", {
      name: f.sections.pension,
    });
    const passed = heT("app.team.file.rows.pensionPassed", { business });
    await expect(pension.getByText(passed)).toBeVisible();
    await pension
      .getByRole("button", {
        name: heT("app.team.file.direct.pension", { business }),
      })
      .click();
    await expect(
      page.getByText(heT("app.team.file.direct.pensionMarked", { business })),
    ).toBeVisible();
    await expect(
      pension.getByText(f.rows.direct, { exact: true }),
    ).toBeVisible();
    await expect(pension.getByText(passed)).toHaveCount(0);
    expect(await demoDirectGroups(YOAV.id)).toContain("pension");
    await expectCleanPage(page);
  } finally {
    await restoreDemoPeriodStart(YOAV.id, was);
  }
});

test("a write without a fresh step-up asks for the code and changes nothing", async ({
  page,
  context,
}) => {
  await enterAs(page, "accountant");
  await open(page, `/team/${YOAV.id}/file`);
  await openFile(page, GALIT.e164);
  await context.clearCookies({ name: "ca_file_open" });
  await main(page)
    .getByRole("region", { name: f.sections.bank })
    .getByRole("button", { name: f.direct.mark })
    .click();
  await expect(main(page).getByText(f.locked.title)).toBeVisible();
  expect(await demoDirectGroups(YOAV.id)).toEqual([]);
  expect(
    (await demoFileActions(YOAV.id)).some(
      (row) => row.action === "employee.direct",
    ),
  ).toBe(false);
});

test("what happened in a file shows a reveal and never its number", async ({
  page,
}, testInfo) => {
  await enterAs(page, "accountant");
  await open(page, `/team/${NOA.id}/file`);
  await openFile(page, GALIT.e164);
  const bank = main(page).getByRole("region", { name: f.sections.bank });
  await bank.getByRole("button", { name: he.app.file.masked.show }).click();
  const digits = bank.getByText(/^\d{5,}$/);
  await expect(digits).toBeVisible();
  const shown = (await digits.textContent()) ?? "";

  // Drawn again: the step-up is fresh, so no code.
  await open(page, `/team/${NOA.id}/file`);
  const history = main(page).getByRole("region", { name: f.history.title });
  await expect(
    shownIn(
      history,
      heT("app.team.file.history.reveal", {
        fields: he.app.manage.activity.actions.employee.viewFields.bank_account,
      }),
    ),
  ).toBeVisible();
  await expect(shownIn(history, people.accountant.name)).toBeVisible();
  // The daily read of the file itself isn't listed.
  await expect(
    history.getByText(
      heT("app.team.file.history.reveal", {
        fields: he.app.manage.activity.actions.employee.viewFields.file,
      }),
    ),
  ).toHaveCount(0);
  expect(await history.textContent()).not.toContain(shown);
  if (isDesktop(testInfo)) {
    for (const column of Object.values(f.history.columns)) {
      await expect(
        history.getByRole("columnheader", { name: column, exact: true }),
      ).toBeVisible();
    }
  }
  await expectCleanPage(page);
});

// Profile H6b-2.
test("a minor's file says what the business owes before and after the start", async ({
  page,
}) => {
  const born = new Date();
  born.setUTCFullYear(born.getUTCFullYear() - 16);
  const had = await setDemoMinor(NOA.id, born.toISOString().slice(0, 10));
  const was = await setDemoPeriodStart(NOA.id, 3);
  try {
    await enterAs(page, "owner");
    await open(page, `/team/${NOA.id}/file`);
    await openFile(page, URI.e164);
    const identity = main(page).getByRole("region", {
      name: f.sections.identity,
    });
    await expect(
      identity.getByRole("heading", { name: f.minor.title }),
    ).toBeVisible();
    await expect(identity.getByText(f.minor.before)).toBeVisible();
    await expect(
      identity.getByText(/הודעה על תנאי העבודה עד \d{1,2}\.\d{1,2}\.\d{4}/),
    ).toBeVisible();
    await expect(identity.getByText(f.minor.under15)).toHaveCount(0);
    await expectCleanPage(page);
  } finally {
    await restoreDemoPeriodStart(NOA.id, was);
    await clearDemoMinor(NOA.id, had);
  }
});

test("the team filters to missing details and an open 101, and the desktop shows the last change", async ({
  page,
}, testInfo) => {
  await clearDemoTaxYears(NOA.id);
  await enterAs(page, "owner");
  await open(page, "/team");
  const person = (name: string) =>
    main(page)
      .getByRole("link", { name: new RegExp(name) })
      .filter({ visible: true });
  const choose = (name: string) =>
    main(page).getByRole("button", { name, exact: true }).click();

  await choose(f.filter.missing);
  await expect(person(YOAV.name).first()).toBeVisible();
  await expect(person(NOA.name)).toHaveCount(0);
  await expectCleanPage(page);

  await choose(f.filter.form101);
  await expect(person(NOA.name).first()).toBeVisible();
  await expect(
    main(page).getByRole("button", { name: f.filter.form101, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await choose(f.filter.all);
  await expect(person(NOA.name).first()).toBeVisible();
  await expect(person(YOAV.name).first()).toBeVisible();

  if (isDesktop(testInfo)) {
    await expect(
      main(page).getByRole("columnheader", { name: f.columns.changed }),
    ).toBeVisible();
    const noa = main(page).getByRole("row", { name: new RegExp(NOA.name) });
    await expect(noa).toContainText(/\d{1,2}\.\d{1,2}\.\d{4}/);
  }
});
