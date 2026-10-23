import { expect, type Page } from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { latestCode } from "./sms";

const t = he.auth.signIn;

/** A seeded person (supabase/seed.sql): local and E.164 forms of the number. */
export type Person = { local: string; e164: string };

/**
 * Sign in with the code the dev SMS hook stored, and wait for the screen
 * the person lands on (home by default).
 */
export async function signIn(
  page: Page,
  person: Person,
  landing: RegExp = /\/home$/,
): Promise<void> {
  await page.goto("/sign-in");
  let since = new Date(Date.now() - 1000);
  await page.getByLabel(t.phoneLabel).fill(person.local);
  await page.getByRole("button", { name: t.send }).click();
  // The auth server refuses a second code to the same number within 5
  // seconds, and specs that run back to back may sign the same person in.
  // Like a person would, wait and ask again once.
  const codeField = page.getByLabel(t.codeLabel);
  const tooSoon = page.getByText(t.errors.rateLimit);
  await expect(codeField.or(tooSoon)).toBeVisible();
  if (await tooSoon.isVisible()) {
    await page.waitForTimeout(5_500);
    since = new Date(Date.now() - 1000);
    await page.getByRole("button", { name: t.send }).click();
  }
  await expect(codeField).toBeVisible();
  const code = await latestCode(person.e164, since);
  await page.getByLabel(t.codeLabel).fill(code);
  await page.getByRole("button", { name: t.verify, exact: true }).click();
  await expect(page).toHaveURL(landing);
}
