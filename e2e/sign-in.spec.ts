import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { displayIsraeliMobile } from "../packages/domain/phone";
import { askForCode } from "./session";
import {
  codeAfter,
  forgetSentCodes,
  lastCodeId,
  latestCode,
  noteSentCode,
} from "./sms";

const t = he.auth.signIn;

// Seeded in supabase/seed.sql: נועה כהן, a worker at the demo restaurant.
// Each device project signs in with the same person; codes are told apart
// by time.
const WORKER = { local: "050-000-0003", e164: "+972500000003" };
// A valid number that is on no team.
const UNKNOWN = { local: "050-999-9999", e164: "+972509999999" };

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function requestCode(page: Page, phone: string) {
  await page.getByLabel(t.phoneLabel).fill(phone);
  await page.getByRole("button", { name: t.send }).click();
}

/** The code step's words, its number as a placeholder. */
async function codeStepWords(page: Page, phone: string): Promise<string> {
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();
  const words = (await page.getByRole("main").textContent()) ?? "";
  return words.replaceAll(displayIsraeliMobile(phone), "{phone}");
}

test("the sign-in page is clean, and the root leads to the door", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: t.title })).toBeVisible();
  await expectAccessible(page);

  // The root has no page of its own: it opens the app, and so leads to the door.
  await page.goto("/");
  await expect(page).toHaveURL(/\/enter$/);
});

test("a worker signs in with a phone code and lands on the home screen", async ({
  page,
}, testInfo) => {
  const since = await askForCode(page, WORKER);

  const codeField = page.getByLabel(t.codeLabel);
  await expect(codeField).toBeVisible();
  // What to do when no code came is always there.
  await expect(
    page.getByRole("heading", { name: t.noCode.title }),
  ).toBeVisible();
  await expectAccessible(page);

  // A wrong code is refused and the person stays on the code step.
  await codeField.fill("000000");
  await expect(page.getByText(t.errors.wrongCode)).toBeVisible();

  const code = await latestCode(WORKER.e164, since);
  await page.getByLabel(t.codeLabel).fill(code);

  await expect(page).toHaveURL(/\/home$/);
  // The greeting follows the hour; the name does not.
  await expect(
    page.getByRole("heading", { level: 1, name: /, נועה$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: he.app.nav.home }).first(),
  ).toBeVisible();
  await expectAccessible(page);
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });

  // Signed in: the sign-in screen and the root both send you home.
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);

  // Signing out, from the profile, closes the session.
  await page
    .getByRole("main")
    .getByRole("link", { name: he.app.me.open, exact: true })
    .click();
  await page.getByRole("button", { name: he.app.signOut }).click();
  await expect(page).toHaveURL(/\/enter$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/enter$/);
});

test("a code asked for again at once sends nothing new, reads as for any number, and the first code still signs in", async ({
  page,
}) => {
  const since = await askForCode(page, WORKER);
  const first = await latestCode(WORKER.e164, since);
  const codeField = page.getByLabel(t.codeLabel);
  const tooSoon = page.getByText(t.errors.rateLimit);

  // On the code step, a new code at once: the app's own wait holds it, the
  // same for every number, without asking the auth server, and the screen
  // says what it says for any number. A code counted as sent restarts the
  // wait right before each request, so the test does not depend on how fast
  // the runner is.
  await noteSentCode(WORKER.e164);
  const sent = await lastCodeId(WORKER.e164);
  await page.getByRole("button", { name: t.resend }).click();
  await expect(
    page.getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
  ).toBeVisible();
  await expect(tooSoon).toHaveCount(0);
  await expect(codeField).toBeVisible();

  // Back to the number and asking again at once: the code step, as always.
  await page.getByRole("button", { name: t.changePhone }).click();
  await page.getByLabel(t.phoneLabel).fill(WORKER.local);
  await noteSentCode(WORKER.e164);
  await page.getByRole("button", { name: t.send }).click();
  await expect(codeField).toBeVisible();
  await expect(tooSoon).toHaveCount(0);
  await expectAccessible(page);

  // Nothing new went, and the first code still signs in.
  expect(await codeAfter(WORKER.e164, sent)).toBeNull();
  await codeField.fill(first);
  await expect(page).toHaveURL(/\/home$/);
});

test("an unknown number reaches the code step a registered one does, word for word, and no code goes", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await requestCode(page, WORKER.local);
  const registered = await codeStepWords(page, WORKER.e164);

  await page.getByRole("button", { name: t.changePhone }).click();
  const sent = await lastCodeId(UNKNOWN.e164);
  await requestCode(page, UNKNOWN.local);
  const unknown = await codeStepWords(page, UNKNOWN.e164);

  expect(unknown).toBe(registered);
  expect(await codeAfter(UNKNOWN.e164, sent)).toBeNull();
  await expectAccessible(page);

  // A code typed for it is a wrong one, as any wrong code is.
  await page.getByLabel(t.codeLabel).fill("123456");
  await expect(page.getByText(t.errors.wrongCode)).toBeVisible();
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();
});

test("a code checked when none was sent lately is a wrong code, and the auth server isn't asked", async ({
  page,
}) => {
  const since = await askForCode(page, WORKER);
  const code = await latestCode(WORKER.e164, since);
  // As if the code had gone longer ago than a code lasts.
  await forgetSentCodes(WORKER.e164);

  await page.getByLabel(t.codeLabel).fill(code);
  await expect(page.getByText(t.errors.wrongCode)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The right code was refused without asking the auth server, which would
  // have taken it; once a code counts as sent again, the same code signs in.
  await noteSentCode(WORKER.e164);
  await page.getByLabel(t.codeLabel).fill(code);
  await expect(page).toHaveURL(/\/home$/);
});

test("a malformed number is caught before anything is sent", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await requestCode(page, "123");
  await expect(page.getByText(t.errors.invalidPhone)).toBeVisible();
});
