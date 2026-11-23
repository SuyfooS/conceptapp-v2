import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { displayIsraeliMobile } from "../packages/domain/phone";
import {
  TURNSTILE_ORIGIN,
  TURNSTILE_TEST_KEYS,
} from "../packages/domain/turnstile";
import {
  CAPTCHA_FRAME,
  captchaSettled,
  isTurnstileScript,
  nextAction,
  TEST_TOKEN,
  turnstileScript,
} from "./captcha";
import { askForCode, SMS_COOLDOWN_MS } from "./session";
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
  // Cloudflare's box isn't the app's to fix; the check's own lines are.
  const { violations } = await new AxeBuilder({ page })
    .exclude(CAPTCHA_FRAME)
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function requestCode(page: Page, phone: string) {
  await page.getByLabel(t.phoneLabel).fill(phone);
  await captchaSettled(page);
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
  await captchaSettled(page);
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
  await captchaSettled(page);
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

// The "אני לא רובוט" check (P9b), with Cloudflare's real script and its
// test key that always passes; Supabase's CAPTCHA is off here, so the token
// goes and nobody checks it.
test("the send carries Cloudflare's token, and a new code a fresh one", async ({
  page,
}) => {
  // Its versioned script's own answer, past Cloudflare's redirect to it.
  const script = turnstileScript(page);
  await page.goto("/sign-in");
  const ready = page.locator('[data-captcha="ready"]');
  await expect(ready).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator(CAPTCHA_FRAME)).toHaveAttribute(
    "data-sitekey",
    TURNSTILE_TEST_KEYS.pass,
  );
  expect((await script).ok()).toBe(true);

  await page.getByLabel(t.phoneLabel).fill(WORKER.local);
  // Held by the app's own wait, so no code goes: the post is what counts.
  await noteSentCode(WORKER.e164);
  const sent = nextAction(page);
  await page.getByRole("button", { name: t.send }).click();
  expect((await sent).postData()).toContain(TEST_TOKEN);
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();

  // The code step's own check: drawn anew, its token in hand again.
  await expect(ready).toHaveCount(1, { timeout: 20_000 });
  await noteSentCode(WORKER.e164);
  const again = nextAction(page);
  await page.getByRole("button", { name: t.resend }).click();
  expect((await again).postData()).toContain(TEST_TOKEN);
  await expect(
    page.getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
  ).toBeVisible();
});

test("a press before the check is done waits for it, and goes by itself", async ({
  page,
}) => {
  // Cloudflare's script held until the press is made. Only the address the
  // app asks for is held: Playwright lets the redirect's next request (the
  // versioned script) through without routing it.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTurnstileScript, async (route) => {
    await held;
    await route.continue();
  });
  // Its own load would wait for the script: the page is enough.
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  // The script asked for: the screen is the app's now, not only the HTML.
  await expect(page.locator("script#cf-turnstile")).toHaveCount(1);

  await page.getByLabel(t.phoneLabel).fill(WORKER.local);
  await noteSentCode(WORKER.e164);
  const sent = nextAction(page);
  const send = page.getByRole("button", { name: t.send });
  await send.click();
  await expect(page.getByText(he.ui.captcha.waiting)).toBeVisible();
  await expect(send).toHaveAttribute("aria-busy", "true");
  await expect(page.getByLabel(t.codeLabel)).toHaveCount(0);

  release();
  expect((await sent).postData()).toContain(TEST_TOKEN);
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();
  await expect(page.getByText(he.ui.captcha.waiting)).toHaveCount(0);
});

test("without Cloudflare the screen says so, and while CAPTCHA is off the code still goes", async ({
  page,
}) => {
  await page.route(
    (url) => url.origin === TURNSTILE_ORIGIN,
    (route) => route.abort(),
  );
  await page.goto("/sign-in");
  await expect(page.getByText(he.ui.captcha.unavailable)).toBeVisible();
  await expectAccessible(page);

  const before = await lastCodeId(WORKER.e164);
  await requestCode(page, WORKER.local);
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();
  // The code step says so too, and a press never waits for it.
  await expect(page.getByText(he.ui.captcha.unavailable)).toBeVisible();
  if (!(await codeAfter(WORKER.e164, before))) {
    // A code went to her moments ago: wait it out, as a person would.
    await page.waitForTimeout(SMS_COOLDOWN_MS + 500);
    await page.getByRole("button", { name: t.resend }).click();
    await expect(
      page.getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
    ).toBeVisible();
  }
  await expect.poll(() => codeAfter(WORKER.e164, before)).not.toBeNull();
});

test("a malformed number is caught before anything is sent", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await requestCode(page, "123");
  await expect(page.getByText(t.errors.invalidPhone)).toBeVisible();
});
