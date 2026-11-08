import fs from "node:fs";
import path from "node:path";
import {
  type Browser,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import he from "../messages/he.json" with { type: "json" };
import { latestCode } from "./sms";

const t = he.auth.signIn;

/** A seeded person (supabase/seed.sql): local and E.164 forms of the number. */
export type Person = { local: string; e164: string };

/**
 * How long the auth server makes a number wait between two codes:
 * `[auth.sms] max_frequency` in supabase/config.toml, read so the two never
 * drift apart. Paths are from the repo root, where `pnpm e2e` runs.
 */
export const SMS_COOLDOWN_MS = (() => {
  const config = fs.readFileSync(path.resolve("supabase/config.toml"), "utf8");
  const start = config.search(/^\[auth\.sms\]\s*$/m);
  const seconds =
    start < 0
      ? undefined
      : /^max_frequency = "(\d+)s"\s*$/m.exec(config.slice(start))?.[1];
  if (!seconds) {
    throw new Error(
      "No [auth.sms] max_frequency in seconds in supabase/config.toml",
    );
  }
  return Number(seconds) * 1000;
})();

/**
 * Ask for a code on the sign-in screen and wait for the code step. When a
 * spec before signed this person in moments ago, the auth server says it is
 * too soon: like a person would, wait it out and ask again once. Returns the
 * time to read the code from (`latestCode`).
 */
export async function askForCode(page: Page, person: Person): Promise<Date> {
  await page.goto("/sign-in");
  let since = new Date(Date.now() - 1000);
  await page.getByLabel(t.phoneLabel).fill(person.local);
  await page.getByRole("button", { name: t.send }).click();
  const codeField = page.getByLabel(t.codeLabel);
  const tooSoon = page.getByText(t.errors.rateLimit);
  await expect(codeField.or(tooSoon)).toBeVisible();
  if (await tooSoon.isVisible()) {
    await page.waitForTimeout(SMS_COOLDOWN_MS + 500);
    since = new Date(Date.now() - 1000);
    await page.getByRole("button", { name: t.send }).click();
  }
  await expect(codeField).toBeVisible();
  return since;
}

/**
 * A second person's page beside the test's own, as another device of the same
 * screen size, with its own cookies. Built from the project's fields one by
 * one: the whole `use` object holds keys a context doesn't take (trace,
 * launchOptions). Close its context at the end of the test.
 */
export async function secondPage(
  browser: Browser,
  testInfo: TestInfo,
): Promise<Page> {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    locale: use.locale,
    baseURL: use.baseURL,
    reducedMotion: "reduce",
  });
  return await context.newPage();
}

/**
 * Sign in with the code the dev SMS hook stored, and wait for the screen
 * the person lands on (home by default).
 */
export async function signIn(
  page: Page,
  person: Person,
  landing: RegExp = /\/home$/,
): Promise<void> {
  const since = await askForCode(page, person);
  // The form sends itself once the last digit is in.
  await page.getByLabel(t.codeLabel).fill(await latestCode(person.e164, since));
  await expect(page).toHaveURL(landing);
}
