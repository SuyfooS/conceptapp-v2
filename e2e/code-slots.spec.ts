import AxeBuilder from "@axe-core/playwright";
import he from "../messages/he.json" with { type: "json" };
import { heT } from "./t";
import { expect, type Page, test } from "./test";

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

test("a wrong code sends itself, drains away and can be tried again", async ({
  page,
}) => {
  await toCodeStep(page);
  await page.keyboard.type("000000");
  await expect(page.getByText(t.errors.wrongCode)).toBeVisible();
  await expect.poll(() => posted(page)).toBe("");
  await expect(page.getByLabel(t.codeLabel)).toBeFocused();

  // A second refusal drains again.
  await page.keyboard.type("111111");
  await expect.poll(() => posted(page)).toBe("");
  await expect(page.getByText(t.errors.wrongCode)).toBeVisible();
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
  await expect(page.getByText(t.errors.invalidCode)).toBeVisible();
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
