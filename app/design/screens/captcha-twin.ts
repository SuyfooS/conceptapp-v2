import { type CaptchaSetup, TURNSTILE_TEST_KEYS } from "@domain/turnstile";

/**
 * The "אני לא רובוט" check on a twin, from its `?captcha=`: by default a
 * stand-in with a token in hand, which loads nothing from Cloudflare, so a
 * twin's page is the same with no network; `waiting`, `tap`, `failed` or
 * `unavailable` the stand-in in that state; `live` Cloudflare's own widget
 * with its test key that always passes, and `ask` with the one that always
 * asks for a tick.
 */
export function captchaTwinOf(param?: string): CaptchaSetup {
  switch (param) {
    case "waiting":
    case "tap":
    case "failed":
    case "unavailable":
      return { demo: param };
    case "live":
      return { siteKey: TURNSTILE_TEST_KEYS.pass };
    case "ask":
      return { siteKey: TURNSTILE_TEST_KEYS.tap };
    default:
      return { demo: "ready" };
  }
}
