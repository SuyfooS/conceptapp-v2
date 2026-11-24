import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { phoneEnding } from "../packages/domain/invites";
import { displayIsraeliMobile } from "../packages/domain/phone";
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

/** The page's announcer: said at once, or after what is being read. */
const announcer = (page: Page, politeness: "assertive" | "polite") =>
  page.locator(`[data-announcer="${politeness}"]`);

/** Marks what the announcer said so far, so a new line is told apart. */
const heardSoFar = (region: Locator) =>
  region.locator("p").evaluateAll((lines) => {
    for (const line of lines) line.setAttribute("data-heard", "");
  });

/** A line the announcer said since `heardSoFar`, in these words. */
const saidSince = (region: Locator, words: string) =>
  region.locator("p:not([data-heard])").filter({ hasText: words });

/** The screen's alerts: a refusal of the code step is never one. */
const alerts = (page: Page) => page.getByRole("main").getByRole("alert");

// Each refusal of the code step is said once (accessibility, part 2): it is
// the field's own description, read as the focus comes back to it, and the
// announcer says it only where the field kept the focus, as here, where the
// code sent itself after its last digit. An alert would say it again.
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
  // Why is the field's own, read with it whenever the focus comes back.
  await expect(field).toHaveAccessibleDescription(
    new RegExp(literal(t.errors.wrongCode)),
  );
  await expect(saidSince(assertive, t.errors.wrongCode)).toHaveCount(1);
  await expect(alerts(page)).toHaveCount(0);

  // A second refusal drains again, and the same words are said again.
  await heardSoFar(assertive);
  await page.keyboard.type("111111");
  await expect.poll(() => posted(page)).toBe("");
  await expect(saidSince(assertive, t.errors.wrongCode)).toHaveCount(1);
  await expect(alerts(page)).toHaveCount(0);
  await expect(field).toBeFocused();
});

// The press that checks the code ("כניסה", joining's "הצטרפות לצוות") is busy
// while it checks, so its focus falls to the page: the field takes it back
// and is read with why, and nothing else says it.
test("a short code checked with the press is said once, by the field taking the focus back, on sign-in and on joining", async ({
  page,
}) => {
  const j = he.auth.join;
  for (const twin of [
    { label: t.codeLabel, verify: t.verify },
    { label: j.codeLabel, verify: j.verify },
  ]) {
    if (twin.label === t.codeLabel) {
      await toCodeStep(page);
    } else {
      await page.goto("/design/screens/join");
      await page.getByRole("button", { name: j.send }).click();
    }
    const field = page.getByLabel(twin.label);
    await expect(field).toBeFocused();
    await page.keyboard.type("123");
    await page.getByRole("button", { name: twin.verify, exact: true }).click();
    await expect(
      page.getByRole("main").getByText(t.errors.invalidCode),
    ).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveAccessibleDescription(
      new RegExp(literal(t.errors.invalidCode)),
    );
    await expect(alerts(page)).toHaveCount(0);
    await expect(announcer(page, "assertive")).not.toContainText(
      t.errors.invalidCode,
    );
  }
});

// "שליחת קוד חדש" is busy while it asks, so its focus falls to the page: the
// field takes it back, for the code to come, and the new code is said after
// it. Twice in a row too, as when no SMS came: the words are the same, which
// a line of the screen wouldn't say again (accessibility, part 2).
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
    await page.keyboard.type(code);
    await expect(saidSince(assertive, t.errors.wrongCode), code).toHaveCount(1);
    await expect(alerts(page), code).toHaveCount(0);
    await expect(joinField, code).toBeFocused();
  }
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
