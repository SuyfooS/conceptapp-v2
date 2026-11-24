import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { phoneEnding } from "../packages/domain/invites";
import { displayIsraeliMobile } from "../packages/domain/phone";
import { announcer, heardSoFar, pastSameWords, saidSince } from "./announcer";
import { heT } from "./t";
import { expect, type Locator, type Page, test } from "./test";

// The code boxes on the sign-in demo: no database and no SMS. Any code there is
// wrong except 123456, which goes on to the demo app.
const t = he.auth.signIn;

async function toCodeStep(page: Page) {
  await page.goto("/design/screens/sign-in");
  await page.getByLabel(t.phoneLabel).fill("050-000-0004");
  await page.getByRole("button", { name: t.send }).click();
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();
}

const posted = (page: Page) =>
  page.locator('input[type="hidden"][name="code"]').inputValue();

test("digits go in one by one and come out again", async ({ page }) => {
  await toCodeStep(page);
  await expect(page.getByLabel(t.codeLabel)).toBeFocused();
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  await page.keyboard.type("12x3");
  expect(await posted(page)).toBe("123");
  await page.keyboard.press("Backspace");
  await expect.poll(() => posted(page)).toBe("12");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect.poll(() => posted(page)).toBe("");
  // Nothing left to remove, and nothing breaks.
  await page.keyboard.press("Backspace");
  await expect.poll(() => posted(page)).toBe("");
});

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The screen's alerts: a refusal of the code step is never one. */
const alerts = (page: Page) => page.getByRole("main").getByRole("alert");

/** The field's description with no why: the digits' own line, none typed. */
const countOnly = heT("ui.codeSlots.count", { filled: 0, total: 6 });

/** Why first in the field's description, as a return to it reads it. */
const whyFirst = (why: string) => new RegExp(`^${literal(why)}`);

/** The focus leaves the field and comes back, as a swipe away and back does. */
async function leaveAndComeBack(field: Locator) {
  await field.blur();
  await field.focus();
}

// Each refusal of the code step is said once (accessibility, part 2): the
// announcer says it, at once where the field kept the focus, as here, where
// the code sent itself after its last digit, and the field's description
// keeps it out meanwhile, so a read of the field doesn't say it again; a
// return to the field reads it, first. An alert would say it again.
test("a wrong code sends itself, drains away and can be tried again", async ({
  page,
}) => {
  await toCodeStep(page);
  const field = page.getByLabel(t.codeLabel);
  const assertive = announcer(page, "assertive");
  await page.keyboard.type("000000");
  await expect(
    page.getByRole("main").getByText(t.errors.wrongCode),
  ).toBeVisible();
  await expect.poll(() => posted(page)).toBe("");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(saidSince(assertive, t.errors.wrongCode)).toHaveCount(1);
  await expect(field).toHaveAccessibleDescription(countOnly);
  await expect(alerts(page)).toHaveCount(0);
  // Why is the field's own, read first whenever the focus comes back.
  await leaveAndComeBack(field);
  await expect(field).toHaveAccessibleDescription(whyFirst(t.errors.wrongCode));

  // A second refusal drains again, and the same words are said again (once
  // the announcer's moment for the same words passed: no one types six
  // digits that fast).
  await heardSoFar(assertive);
  await pastSameWords(page);
  await page.keyboard.type("111111");
  await expect.poll(() => posted(page)).toBe("");
  await expect(saidSince(assertive, t.errors.wrongCode)).toHaveCount(1);
  await expect(alerts(page)).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveAccessibleDescription(countOnly);
});

// The press that checks the code ("כניסה", joining's "הצטרפות לצוות") is busy
// while it checks, so its focus falls to the page: the field takes it back,
// marked invalid (the digits are kept), and why is said once, by the
// announcer after the field's own read, politely: a description alone is a
// hint for VoiceOver. Out of the description meanwhile, back for a return.
test("a short code checked with the press is said once as the field takes the focus back, and marked, on sign-in and on joining", async ({
  page,
}) => {
  const j = he.auth.join;
  // Each twin reaches its own code step: the two fields have the same label,
  // so it is the way there, and the press, that tell them apart.
  for (const twin of [
    { label: t.codeLabel, verify: t.verify, go: () => toCodeStep(page) },
    {
      label: j.codeLabel,
      verify: j.verify,
      go: async () => {
        await page.goto("/design/screens/join");
        await page.getByRole("button", { name: j.send }).click();
      },
    },
  ]) {
    await twin.go();
    const press = page.getByRole("button", { name: twin.verify, exact: true });
    await expect(press, twin.verify).toBeVisible();
    const field = page.getByLabel(twin.label);
    await expect(field, twin.verify).toBeFocused();
    await page.keyboard.type("123");
    const polite = announcer(page, "polite");
    await heardSoFar(polite);
    await press.click();
    await expect(
      page.getByRole("main").getByText(t.errors.invalidCode),
      twin.verify,
    ).toBeVisible();
    await expect(field, twin.verify).toBeFocused();
    await expect(field, twin.verify).toHaveAttribute("aria-invalid", "true");
    expect(await posted(page), twin.verify).toBe("123");
    await expect(
      saidSince(polite, t.errors.invalidCode),
      twin.verify,
    ).toHaveCount(1);
    await expect(announcer(page, "assertive"), twin.verify).not.toContainText(
      t.errors.invalidCode,
    );
    await expect(alerts(page), twin.verify).toHaveCount(0);
    await expect(field, twin.verify).not.toHaveAccessibleDescription(
      new RegExp(literal(t.errors.invalidCode)),
    );
    await leaveAndComeBack(field);
    await expect(field, twin.verify).toHaveAccessibleDescription(
      whyFirst(t.errors.invalidCode),
    );
    await expect(field, twin.verify).toHaveAttribute("aria-invalid", "true");
  }
});

// The code step's words (where the code went, the only place the number
// typed is said back) are no live line: they are said once as the step
// arrives, politely, after the field its autoFocus reads.
test("the code step says where the code went as it arrives, once, on sign-in and on joining", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await toCodeStep(page);
  await expect(page.getByLabel(t.codeLabel)).toBeFocused();
  const intro = heT.markup("auth.signIn.codeIntro", {
    phone: displayIsraeliMobile("+972500000004"),
    ltr: (chunks) => chunks,
  });
  await expect(saidSince(polite, intro)).toHaveCount(1);

  const j = he.auth.join;
  await page.goto("/design/screens/join");
  await page.getByRole("button", { name: j.send }).click();
  await expect(page.getByLabel(j.codeLabel)).toBeFocused();
  const joinIntro = heT.markup("auth.join.codeIntro", {
    ending: phoneEnding("+972531234567"),
    ltr: (chunks) => chunks,
  });
  await expect(saidSince(polite, joinIntro)).toHaveCount(1);
  // Only as it arrives: a new code says its own words, not these again.
  await heardSoFar(polite);
  await page.getByRole("button", { name: j.resend }).click();
  await expect(page.getByLabel(j.codeLabel)).toBeFocused();
  await expect(
    saidSince(
      polite,
      heT.markup("auth.join.codeResent", {
        ending: phoneEnding("+972531234567"),
        ltr: (chunks) => chunks,
      }),
    ),
  ).toHaveCount(1);
  await expect(saidSince(polite, joinIntro)).toHaveCount(0);
});

// "שליחת קוד חדש" is busy while it asks, so its focus falls to the page: the
// field takes it back, for the code to come, and the new code is said after
// it. Twice in a row too, as when no SMS came: the words are the same, which
// a line of the screen wouldn't say again (accessibility, part 2). The second
// press waits out the announcer's moment for the same words, as anyone does.
test("each new code is said and puts the focus back in the field, on sign-in and on joining", async ({
  page,
}) => {
  const polite = announcer(page, "polite");
  await toCodeStep(page);
  const field = page.getByLabel(t.codeLabel);
  const resent = heT.markup("auth.signIn.codeResent", {
    phone: displayIsraeliMobile("+972500000004"),
    ltr: (chunks) => chunks,
  });
  for (const press of ["first", "again"]) {
    await heardSoFar(polite);
    if (press === "again") await pastSameWords(page);
    await page.getByRole("button", { name: t.resend }).click();
    await expect(saidSince(polite, resent), press).toHaveCount(1);
    await expect(field, press).toBeFocused();
  }
  await expect(
    page
      .getByRole("main")
      .getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
  ).toBeVisible();

  // Joining's code step, on its twin: the same after each new code, and
  // after each wrong code, said again.
  const j = he.auth.join;
  await page.goto("/design/screens/join");
  await page.getByRole("button", { name: j.send }).click();
  const joinField = page.getByLabel(j.codeLabel);
  await expect(joinField).toBeFocused();
  const joinResent = heT.markup("auth.join.codeResent", {
    ending: phoneEnding("+972531234567"),
    ltr: (chunks) => chunks,
  });
  for (const press of ["first", "again"]) {
    await heardSoFar(polite);
    if (press === "again") await pastSameWords(page);
    await page.getByRole("button", { name: j.resend }).click();
    await expect(saidSince(polite, joinResent), press).toHaveCount(1);
    await expect(joinField, press).toBeFocused();
  }
  await expect(
    page
      .getByRole("main")
      .getByText((j.codeResent.split("<ltr>")[0] ?? "").trim()),
  ).toBeVisible();

  const assertive = announcer(page, "assertive");
  for (const code of ["000000", "111111"]) {
    await heardSoFar(assertive);
    if (code !== "000000") await pastSameWords(page);
    await page.keyboard.type(code);
    await expect(saidSince(assertive, t.errors.wrongCode), code).toHaveCount(1);
    await expect(alerts(page), code).toHaveCount(0);
    await expect(joinField, code).toBeFocused();
  }
});

/** What the field was marked as when it took the focus, noted on the page. */
type MarkAtFocus = { markAtFocus?: string | null };

// A new code after a wrong one is no refusal: the field the focus comes back
// to is no longer marked invalid, nor red, and is read with no why. Already
// so as it takes the focus, whose read finds it as it is then: the mark is
// cleared as the answer is drawn, not in an effect after it.
test("a new code after a wrong one leaves the field unmarked", async ({
  page,
}) => {
  await toCodeStep(page);
  const field = page.getByLabel(t.codeLabel);
  await page.keyboard.type("000000");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByRole("main").locator('[data-status="error"]'),
  ).toHaveCount(1);

  const resend = page.getByRole("button", { name: t.resend });
  await resend.focus();
  await field.evaluate((input) => {
    input.addEventListener(
      "focusin",
      () => {
        (window as MarkAtFocus).markAtFocus =
          input.getAttribute("aria-invalid");
      },
      { once: true },
    );
  });
  await resend.click();
  await expect(
    page
      .getByRole("main")
      .getByText((t.codeResent.split("<ltr>")[0] ?? "").trim()),
  ).toBeVisible();
  await expect(field).toBeFocused();
  expect(
    await page.evaluate(() => (window as MarkAtFocus).markAtFocus),
  ).toBeNull();
  await expect(field).not.toHaveAttribute("aria-invalid");
  await expect(field).toHaveAccessibleDescription(countOnly);
  await expect(
    page.getByRole("main").locator('[data-status="error"]'),
  ).toHaveCount(0);
});

test("a code from a message fills every box at once", async ({ page }) => {
  await toCodeStep(page);
  // What the keyboard's suggestion does, and spaces from a pasted message.
  await page.getByLabel(t.codeLabel).fill("123 456");
  await expect(page.getByText(he.ui.codeSlots.accepted)).toBeAttached();

  // The check shows, then the app opens.
  await expect(page).toHaveURL(/\/design\/shell$/);
});

test("short of six digits, the button says so and keeps them", async ({
  page,
}) => {
  await toCodeStep(page);
  await page.keyboard.type("12");
  await page.getByRole("button", { name: t.verify, exact: true }).click();
  await expect(
    page.getByRole("main").getByText(t.errors.invalidCode),
  ).toBeVisible();
  expect(await posted(page)).toBe("12");
});

// The digits typed are said back, each on its own, in the field's own line,
// and after the arrows the digit the caret is on (accessibility, part 1).
test("the digits typed are read back", async ({ page }) => {
  await toCodeStep(page);
  const field = page.getByLabel(t.codeLabel);
  const words = (
    key: "typed" | "at",
    values: Record<string, string | number>,
  ) =>
    heT.markup(`ui.codeSlots.${key}`, {
      ltr: (chunks: string) => chunks,
      ...values,
    });
  await page.keyboard.type("12");
  await expect(field).toHaveAccessibleDescription(
    words("typed", { filled: 2, total: 6, digits: "1 2" }),
  );
  await page.keyboard.press("ArrowLeft");
  await expect(field).toHaveAccessibleDescription(
    words("at", { position: 2, total: 6, digit: "2" }),
  );
});
