import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { displayIsraeliMobile } from "../packages/domain/phone";
import {
  TURNSTILE_ORIGIN,
  TURNSTILE_TEST_KEYS,
} from "../packages/domain/turnstile";
import { announcer, heardSoFar, pastSameWords, saidSince } from "./announcer";
import {
  CAPTCHA_FRAME,
  captchaSettled,
  isTurnstileScript,
  nextAction,
  STAND_IN_WIDGET,
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
import { heT } from "./t";
import { expect, type Page, test } from "./test";

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
  await expect(
    page.getByRole("main").getByText(t.errors.wrongCode),
  ).toBeVisible();

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
  // the runner is. Twice in a row, as when no SMS came: the press was busy
  // meanwhile, so the focus is back in the field, for the code to come, and
  // each answer is said after it, its words the same both times
  // (accessibility, part 2). The second press first waits out the
  // announcer's moment for the same words, as anyone does, before the code
  // is counted as sent.
  const sent = await lastCodeId(WORKER.e164);
  const polite = announcer(page, "polite");
  const resentWords = heT.markup("auth.signIn.codeResent", {
    phone: displayIsraeliMobile(WORKER.e164),
    ltr: (chunks) => chunks,
  });
  for (const press of ["first", "again"]) {
    await heardSoFar(polite);
    if (press === "again") await pastSameWords(page);
    await noteSentCode(WORKER.e164);
    await captchaSettled(page);
    await page.getByRole("button", { name: t.resend }).click();
    await expect(saidSince(polite, resentWords), press).toHaveCount(1);
    await expect(codeField, press).toBeFocused();
    await expect(tooSoon, press).toHaveCount(0);
  }
  await expect(
    page
      .getByRole("main")
      .getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
  ).toBeVisible();
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
  await expect(
    page.getByRole("main").getByText(t.errors.wrongCode),
  ).toBeVisible();
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
  await expect(
    page.getByRole("main").getByText(t.errors.wrongCode),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The right code was refused without asking the auth server, which would
  // have taken it; once a code counts as sent again, the same code signs in.
  await noteSentCode(WORKER.e164);
  await page.getByLabel(t.codeLabel).fill(code);
  await expect(page).toHaveURL(/\/home$/);
});

// The "אני לא רובוט" check (P9b), with Cloudflare's real script and its
// test key that always passes, where every other test has the e2e's
// stand-in (e2e/test.ts); Supabase's CAPTCHA is off here, so the token
// goes and nobody checks it. Each waits on the box's `data-captcha` and on
// the script's own answers, never on `networkidle`, which the file's pages
// never reached in CI with Cloudflare's widget up.
test.describe(() => {
  test.use({ turnstile: "cloudflare" });

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
    // Cloudflare's own widget gave the token, not the stand-in.
    await expect(page.locator(STAND_IN_WIDGET)).toHaveCount(0);

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
      page
        .getByRole("main")
        .getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
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
        page
          .getByRole("main")
          .getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
      ).toBeVisible();
    }
    await expect.poll(() => codeAfter(WORKER.e164, before)).not.toBeNull();
  });
});

// Each answer of the phone step is heard (accessibility, part 2).
test("a malformed number is caught before anything is sent, and said on its field", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const polite = announcer(page, "polite");
  const assertive = announcer(page, "assertive");
  await requestCode(page, "123");
  await expect(
    page.getByRole("main").getByText(t.errors.invalidPhone),
  ).toBeVisible();
  // The field takes the focus the busy press lost, and is read as invalid;
  // why is said after that read, by the announcer (a description alone is
  // a hint for VoiceOver), and is out of the description meanwhile.
  const field = page.getByLabel(t.phoneLabel);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(saidSince(polite, t.errors.invalidPhone)).toHaveCount(1);
  await expect(field).not.toHaveAttribute("aria-describedby");
  // The field says it: no line of its own as well.
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  // A return to the field reads why with it.
  await field.blur();
  await field.focus();
  await expect(field).toHaveAccessibleDescription(t.errors.invalidPhone);

  // Sent again from the field itself, where the focus already is: said all
  // the same, at once, and out of the description again.
  await captchaSettled(page);
  await field.press("Enter");
  await expect(saidSince(assertive, t.errors.invalidPhone)).toHaveCount(1);
  await expect(field).toBeFocused();
  await expect(field).not.toHaveAttribute("aria-describedby");
});

// The person moved the focus on while the press was busy (to the demo
// door's link, enabled all along): the answer leaves it there, and is said
// at once all the same. The twin's action is held until the focus moved.
test("a number refused after the focus moved on leaves it where it was put, and is said", async ({
  page,
}) => {
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = () => resolve();
  });
  await page.route("**/design/screens/sign-in", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await page.goto("/design/screens/sign-in");
  const field = page.getByLabel(t.phoneLabel);
  const send = page.getByRole("button", { name: t.send });
  const demo = page.getByRole("link", { name: t.demo });
  const assertive = announcer(page, "assertive");
  await field.fill("050");
  await send.click();
  await expect(send).toHaveAttribute("aria-busy", "true");
  await demo.focus();
  answer();

  await expect(
    page.getByRole("main").getByText(t.errors.invalidPhone),
  ).toBeVisible();
  await expect(saidSince(assertive, t.errors.invalidPhone)).toHaveCount(1);
  await expect(demo).toBeFocused();
  await expect(field).not.toBeFocused();
  // Marked, and read with why when the person comes back to it.
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(t.errors.invalidPhone);
});

test("a code that didn't go for another reason is said above the press each time, and the number isn't marked", async ({
  page,
}) => {
  const field = page.getByLabel(t.phoneLabel);
  const refused = page.getByRole("main").getByRole("alert");

  // Refused for its check, as the twin draws it: Supabase's CAPTCHA is off
  // here, so the auth server never refuses one.
  await page.goto("/design/screens/sign-in?error=captcha");
  await expect(refused).toHaveText(t.errors.captcha);
  await expect(field).not.toHaveAttribute("aria-invalid");
  await expect(field).not.toHaveAttribute("aria-describedby");
  // Right above the press it is about.
  expect(
    await refused.evaluate((line) =>
      line.nextElementSibling?.getAttribute("value"),
    ),
  ).toBe("send");

  // A failure, on the real screen: a press its action doesn't know, which
  // sends nothing and counts nothing.
  await page.goto("/sign-in");
  await field.fill(UNKNOWN.local);
  await captchaSettled(page);
  const send = page.getByRole("button", { name: t.send });
  await send.evaluate((button) => button.setAttribute("value", "unknown"));
  await send.click();
  await expect(refused).toHaveText(t.errors.failed);
  await expect(field).not.toHaveAttribute("aria-invalid");
  // The press, busy meanwhile, takes back the focus it lost, to be tried
  // again.
  await expect(send).toBeFocused();

  // The same failure again is a new line, so it is heard again.
  await refused.evaluate((line) => line.setAttribute("data-heard", ""));
  await send.click();
  await expect(page.locator("[data-heard]")).toHaveCount(0);
  await expect(refused).toHaveText(t.errors.failed);
  await expect(field).not.toHaveAttribute("aria-invalid");
  await expect(send).toBeFocused();
  await expectAccessible(page);
});

// Joining's invite step has no field: each code that didn't go is a line of
// its own above the press, drawn anew each time (the answer's count is its
// key), and the press takes back the focus it lost. A press the twin's
// action doesn't know answers as a failure.
test("joining's invite step says a code that didn't go above the press each time, and gives the press its focus back", async ({
  page,
}) => {
  const j = he.auth.join;
  const refused = page.getByRole("main").getByRole("alert");
  await page.goto("/design/screens/join");
  const send = page.getByRole("button", { name: j.send });
  await send.evaluate((button) => button.setAttribute("value", "unknown"));
  await send.click();
  await expect(refused).toHaveText(t.errors.failed);
  await expect(send).toBeFocused();

  // The same failure again is a new line, so it is heard again.
  await refused.evaluate((line) => line.setAttribute("data-heard", ""));
  await send.click();
  await expect(page.locator("[data-heard]")).toHaveCount(0);
  await expect(refused).toHaveText(t.errors.failed);
  await expect(send).toBeFocused();
});
