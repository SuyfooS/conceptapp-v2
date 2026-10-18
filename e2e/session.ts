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
  const since = new Date(Date.now() - 1000);
  await page.getByLabel(t.phoneLabel).fill(person.local);
  await page.getByRole("button", { name: t.send }).click();
  await expect(page.getByLabel(t.codeLabel)).toBeVisible();
  const code = await latestCode(person.e164, since);
  await page.getByLabel(t.codeLabel).fill(code);
  await page.getByRole("button", { name: t.verify, exact: true }).click();
  await expect(page).toHaveURL(landing);
}
