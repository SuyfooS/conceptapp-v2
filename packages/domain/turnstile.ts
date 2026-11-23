/**
 * Cloudflare Turnstile, the "אני לא רובוט" check before every SMS code
 * (P9b): sign-in, joining, the holder's code to open the files and the
 * worker's bank code. The browser gets a token and the send carries it to
 * the auth server, which checks it once Supabase's CAPTCHA is on
 * (docs/production.md, Turnstile). The app never refuses a send without
 * one: it can't know whether CAPTCHA is on, so the auth server decides.
 * The demo door sends no code and has no check.
 *
 * What is here is the pure part: the addresses, the test keys, and the rules
 * for where a check stands. `@ui/captcha` draws it, `@db/env` reads the key.
 */

/** Where Cloudflare serves the check: its script and its frame. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The script, rendered by the app itself (`explicit`), so each screen says
 * where its box goes and hears every answer. Never copied or cached here:
 * Cloudflare asks that it be loaded from its own address.
 */
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

/**
 * Cloudflare's published test site keys
 * (developers.cloudflare.com/turnstile/troubleshooting/testing): one that
 * always passes, the key of every site with none set (local, CI, e2e,
 * where Supabase's CAPTCHA is off); one that always fails; one that always
 * asks for a tick, for the design twin.
 */
export const TURNSTILE_TEST_KEYS = {
  pass: "1x00000000000000000000AA",
  fail: "2x00000000000000000000AB",
  tap: "3x00000000000000000000FF",
} as const;

/** The form field a send posts its token in. */
export const CAPTCHA_FIELD = "captcha";

/** Cloudflare's longest token. */
export const CAPTCHA_TOKEN_MAX = 2048;

/** No script by then, and the check is unavailable: no press waits for it. */
export const CAPTCHA_LOAD_MS = 15_000;

/** Turnstile's flexible box is 300px wide at least; narrower, it is compact. */
export const CAPTCHA_FLEXIBLE_MIN = 300;

/**
 * Where a check stands: on its way, a token in hand, Cloudflare asking for
 * a tick, failed (it may pass if tried again), or unavailable (no script, a
 * key or an address the widget doesn't take, a browser it doesn't run in).
 */
export type CaptchaState =
  | "loading"
  | "ready"
  | "tap"
  | "failed"
  | "unavailable";

/** Which send a check is for: Turnstile's `action`, seen in its analytics. */
export type CaptchaAction = "sign-in" | "join" | "file-code" | "bank-code";

/**
 * What a screen is given: the real widget with this deployment's key, or
 * the design twin's stand-in in a state of its own, drawn without
 * Cloudflare (`waiting`: a press held for a check on its way).
 */
export type CaptchaSetup =
  | { siteKey: string }
  | { demo: CaptchaState | "waiting" };

/** What happens to a check: Cloudflare's answers, and the script's. */
export type CaptchaEvent =
  /** A widget drawn into its place: a new check under way. */
  | { kind: "rendered" }
  | { kind: "token" }
  | { kind: "expired" }
  /** A token spent or a check tried again: the next one under way. */
  | { kind: "reset" }
  | { kind: "interactive" }
  /** The tick done, its answer on its way. */
  | { kind: "settled" }
  | { kind: "error"; code: string }
  | { kind: "unsupported" }
  | { kind: "scriptFailed" }
  | { kind: "loadTimeout" };

/**
 * Cloudflare's client error codes that no retry fixes, as its list says
 * them (developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes):
 * a site key that is wrong or unknown (1101xx, 4000xx), an address not on
 * the widget (1102xx, what a Vercel preview meets), a wrong action or data
 * (1104xx), a browser it doesn't run in (1105xx), and the visitor's clock
 * (200100). Anything else may pass on another try.
 */
const NO_RETRY = /^(?:110[1245]\d\d|4000\d\d|200100)$/;

export function captchaErrorKind(code: string): "failed" | "unavailable" {
  return NO_RETRY.test(code) ? "unavailable" : "failed";
}

/**
 * Where a check goes next. Only a new widget brings one back from
 * unavailable: without the script, nothing can until the page loads again.
 * The load's deadline counts only while nothing came.
 */
export function nextCaptchaState(
  state: CaptchaState,
  event: CaptchaEvent,
): CaptchaState {
  if (event.kind === "rendered") return "loading";
  if (state === "unavailable") return "unavailable";
  switch (event.kind) {
    case "token":
      return "ready";
    case "expired":
    case "reset":
    case "settled":
      return "loading";
    case "interactive":
      return "tap";
    case "error":
      return captchaErrorKind(event.code);
    case "unsupported":
    case "scriptFailed":
      return "unavailable";
    case "loadTimeout":
      return state === "loading" ? "unavailable" : state;
  }
}

/**
 * Whether a press waits for the check: while it is on its way or asks for a
 * tick. A failed or unavailable check never holds a press: it goes without
 * a token, and the auth server decides.
 */
export function pressWaits(state: CaptchaState): boolean {
  return state === "loading" || state === "tap";
}

/** The box's size for the room it has: flexible, or compact below 300px. */
export function captchaSizeFor(width: number): "flexible" | "compact" {
  return width >= CAPTCHA_FLEXIBLE_MIN ? "flexible" : "compact";
}

/**
 * A token as a send takes it from a browser: 1 to 2048 visible characters,
 * else none. One of another shape is dropped, not refused, since the app
 * refuses no send for its check (the auth server does, once CAPTCHA is on).
 */
export function captchaTokenOf(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw.length > CAPTCHA_TOKEN_MAX) return undefined;
  return /^[\x21-\x7e]+$/.test(raw) ? raw : undefined;
}

/** The box's language: the screen's, English or Hebrew. */
export function captchaLanguageOf(locale: string): "he" | "en" {
  return locale === "en" ? "en" : "he";
}
