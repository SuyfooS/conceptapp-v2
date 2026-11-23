import {
  expect,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { TURNSTILE_ORIGIN } from "../packages/domain/turnstile";

/*
 * The "אני לא רובוט" check before every SMS code (P9b), as the browser
 * tests meet it: Cloudflare's real script with its always-passing test key
 * (NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset), and Supabase's CAPTCHA off
 * locally, so the token goes and nobody checks it.
 */

/** Cloudflare's box: not the app's to fix, so axe leaves it out. */
export const CAPTCHA_FRAME = "[data-captcha-frame]";

/** The token Cloudflare's test key gives. */
export const TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * Cloudflare's script, at the address the app asks for
 * (`/turnstile/v0/api.js`) and at the versioned one that address redirects
 * to (`/turnstile/v0/b/<build>/api.js`).
 */
export const isTurnstileScript = (url: URL): boolean =>
  url.origin === TURNSTILE_ORIGIN && url.pathname.endsWith("/api.js");

/** The statuses that send the browser on to another address. */
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * The script as it came in the end. Cloudflare answers the address the app
 * asks for with a 302 to the versioned script, and Playwright reports that
 * redirect as a response of its own, the first one: so a redirect is passed
 * over, and what resolves is the versioned script's own answer (or a
 * failure, which then says so).
 */
export function turnstileScript(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      isTurnstileScript(new URL(response.url())) &&
      !REDIRECTS.has(response.status()),
  );
}

/**
 * Waits for the screen's check to settle before a press that sends a code:
 * a token in hand, or none to wait for (failed, or no script). The press
 * would wait for it anyway, and then the next step's own wait would count
 * Cloudflare's too.
 */
export async function captchaSettled(page: Page): Promise<void> {
  await expect(page.locator('[data-captcha="loading"]')).toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.locator('[data-captcha="tap"]')).toHaveCount(0);
}

/**
 * The next server action the page posts, as a press sends it, whose body
 * holds `holding` when given.
 */
export function nextAction(page: Page, holding?: string): Promise<Request> {
  return page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.headers()["next-action"] !== undefined &&
      (holding === undefined || (request.postData() ?? "").includes(holding)),
  );
}
