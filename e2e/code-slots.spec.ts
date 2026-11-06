import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };

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
