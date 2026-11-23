import fs from "node:fs";
import path from "node:path";
import {
  type BrowserContext,
  expect,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import { TURNSTILE_ORIGIN } from "../packages/domain/turnstile";

/*
 * The "אני לא רובוט" check before every SMS code (P9b), as the browser
 * tests meet it: Cloudflare's always-passing test key
 * (NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset), and Supabase's CAPTCHA off
 * locally, so the token goes and nobody checks it. The script is the e2e's
 * stand-in for Cloudflare's (e2e/turnstile-stand-in.js), served to every
 * spec by the `test` of e2e/test.ts, so no test waits on Cloudflare's
 * network. Only the tests of Cloudflare's own widget load the real one
 * (`test.use({ turnstile: "cloudflare" })`), and they wait on the box's
 * `data-captcha` and on the script's own answers, never on `networkidle`.
 */

/** Cloudflare's box: not the app's to fix, so axe leaves it out. */
export const CAPTCHA_FRAME = "[data-captcha-frame]";

/** The token Cloudflare's test key gives, and the stand-in's too. */
export const TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * A widget the stand-in drew: none in a test of Cloudflare's own widget,
 * which says so to prove it ran the real script.
 */
export const STAND_IN_WIDGET = "[data-turnstile-stand-in]";

/**
 * Cloudflare's script, at the address the app asks for
 * (`/turnstile/v0/api.js`) and at the versioned one that address redirects
 * to (`/turnstile/v0/b/<build>/api.js`).
 */
export const isTurnstileScript = (url: URL): boolean =>
  url.origin === TURNSTILE_ORIGIN && url.pathname.endsWith("/api.js");

/**
 * The stand-in for Cloudflare's script, served as it is. Paths are from the
 * repo root, where `pnpm e2e` runs.
 */
const STAND_IN = fs.readFileSync(
  path.resolve("e2e/turnstile-stand-in.js"),
  "utf8",
);

/**
 * Serves `context` the stand-in in place of Cloudflare's script, and nothing
 * else from Cloudflare's address, so no request of its pages leaves for
 * Cloudflare. Every spec's own context has it (e2e/test.ts); a context a
 * spec opens a page in itself takes it here (`secondPage` does). A page's
 * own `page.route` still comes first, as in the test that blocks Cloudflare.
 */
export async function standInForTurnstile(
  context: BrowserContext,
): Promise<void> {
  await context.route(
    (url) => url.origin === TURNSTILE_ORIGIN,
    (route) =>
      isTurnstileScript(new URL(route.request().url()))
        ? route.fulfill({
            status: 200,
            contentType: "text/javascript; charset=utf-8",
            body: STAND_IN,
          })
        : route.abort("blockedbyclient"),
  );
}

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
