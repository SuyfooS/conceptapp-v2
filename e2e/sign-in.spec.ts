import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { latestCode } from "./sms";

const t = he.auth.signIn;

// Seeded in supabase/seed.sql: נועה כהן, a worker at the demo restaurant.
// Each device project signs in with the same person; codes are told apart
// by time.
const WORKER = { local: "050-000-0003", e164: "+972500000003" };

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

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: t.title })).toBeVisible();
  await expectAccessible(page);

  // The root has no page of its own: it opens the app, and so leads here too.
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("a worker signs in with a phone code and lands on the home screen", async ({
  page,
}, testInfo) => {
  await page.goto("/sign-in");
  const since = new Date(Date.now() - 1000);
  await requestCode(page, WORKER.local);

  const codeField = page.getByLabel(t.codeLabel);
  await expect(codeField).toBeVisible();
  await expectAccessible(page);

  // A wrong code is refused and the person stays on the code step.
  await codeField.fill("000000");
  await page.getByRole("button", { name: t.verify, exact: true }).click();
  await expect(page.getByText(t.errors.wrongCode)).toBeVisible();

  const code = await latestCode(WORKER.e164, since);
  await page.getByLabel(t.codeLabel).fill(code);
  await page.getByRole("button", { name: t.verify, exact: true }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: he.app.home.greeting.replace("{name}", "נועה"),
    }),
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

  // Signing out closes the session.
  await page.getByRole("button", { name: he.app.home.signOut }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("an unknown number gets a clear answer and no code", async ({ page }) => {
  await page.goto("/sign-in");
  await requestCode(page, "050-999-9999");
  await expect(page.getByText(t.errors.unknownPhone)).toBeVisible();
  await expect(page.getByLabel(t.codeLabel)).toHaveCount(0);
});

test("a malformed number is caught before anything is sent", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await requestCode(page, "123");
  await expect(page.getByText(t.errors.invalidPhone)).toBeVisible();
});
