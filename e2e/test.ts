import { test as base } from "@playwright/test";
import { standInForTurnstile } from "./captcha";

/*
 * Playwright as every spec takes it (Biome has the specs import from here,
 * never from @playwright/test): the same exports, and a `test` whose browser
 * is served the e2e's stand-in for Cloudflare's Turnstile script
 * (e2e/turnstile-stand-in.js, through `standInForTurnstile`). So no spec
 * waits on Cloudflare's network, and a page that draws the "אני לא רובוט"
 * box goes quiet (`networkidle`) as any other. The tests of Cloudflare's own
 * widget load the real script with `test.use({ turnstile: "cloudflare" })`.
 * A context a spec opens a page in itself takes the stand-in with
 * `standInForTurnstile` (`secondPage` does).
 */
export * from "@playwright/test";

/** The script a test's browser runs for the "אני לא רובוט" check. */
export type TurnstileScript = "stand-in" | "cloudflare";

export const test = base.extend<{ turnstile: TurnstileScript }>({
  turnstile: ["stand-in", { option: true }],
  context: async ({ context, turnstile }, use) => {
    if (turnstile === "stand-in") await standInForTurnstile(context);
    await use(context);
  },
});
