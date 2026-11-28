import { TURNSTILE_TEST_KEYS } from "@domain/turnstile";
import { z } from "zod";

/**
 * Supabase connection settings, read from the environment and checked once.
 * The URL and the publishable key are public by design. The secret key is
 * parsed here too but read only by the server-only admin client
 * (`supabase/admin.ts`).
 */
const PublicEnv = z.object({
  url: z.url(),
  publishableKey: z.string().startsWith("sb_publishable_"),
});

export type PublicEnv = z.infer<typeof PublicEnv>;

/**
 * Parse the two public settings. Throws with a readable message when one is
 * missing, so a bad deploy fails at the first request instead of at sign-in.
 */
export function parsePublicEnv(source: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}): PublicEnv {
  const result = PublicEnv.safeParse({
    url: source.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) {
    throw new Error(
      `Supabase settings missing or invalid (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY): ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * The settings for this process. NEXT_PUBLIC_ variables are inlined at build
 * time only when written out in full, so they are listed explicitly.
 */
export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

/** True when both public settings are present (e.g. not on a bare preview). */
export function hasPublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

const SecretKey = z.string().startsWith("sb_secret_");

/**
 * The secret key, checked. Throws without echoing the value, so a bad
 * setting never ends up in a log.
 */
export function parseSecretKey(source: { SUPABASE_SECRET_KEY?: string }) {
  const result = SecretKey.safeParse(source.SUPABASE_SECRET_KEY);
  if (!result.success) {
    throw new Error(
      "Supabase secret key missing or invalid (SUPABASE_SECRET_KEY): expected an sb_secret_ key",
    );
  }
  return result.data;
}

const DemoDoor = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(["on", "off"]));

/**
 * The demo door on this deployment (`DEMO_DOOR`, Orel, 22 November 2026):
 * `on`, or unset, offers the demo people at /enter, their one-press sign-in
 * and the demo reset; `off` closes all three, for the site of real
 * businesses (docs/production.md, B7). Read where a page is built and where a
 * request runs, so a change takes a Redeploy. Anything else throws, naming
 * the setting, so a typo fails the build instead of guessing which site this
 * is.
 */
export function parseDemoDoor(source: { DEMO_DOOR?: string }): boolean {
  const raw = source.DEMO_DOOR ?? "";
  if (raw.trim() === "") return true;
  const parsed = DemoDoor.safeParse(raw);
  if (!parsed.success) throw new Error("DEMO_DOOR: on or off (unset means on)");
  return parsed.data === "on";
}

/**
 * Whether this deployment's demo door is open. Server code and the proxy
 * only: in a browser the setting reads as unset, so open
 * (tooling/demo-door.test.ts keeps it out of client files).
 */
export function demoDoorOpen(): boolean {
  return parseDemoDoor({ DEMO_DOOR: process.env.DEMO_DOOR });
}

/**
 * A WhatsApp number as `whatsappToHref` (@domain/share) takes it: E.164, a
 * plus and 8 to 15 digits, the first not 0. Surrounding spaces are trimmed;
 * spaces or dashes inside are not E.164, so refused.
 */
const SupportWhatsapp = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/);

/**
 * ConceptApp's team on WhatsApp for this deployment (`SUPPORT_WHATSAPP`,
 * docs/production.md, B11; closing the pilot, PR 15): the number "עזרה" on
 * /me offers an owner, a manager or the accountant, in E.164. Null when
 * unset or blank, and when it isn't E.164: "עזרה" then offers only whom to
 * ask in the business, as with none. Never throws, so a typo here never
 * takes down the profile; `supportWhatsapp` says it in the log.
 */
export function parseSupportWhatsapp(source: {
  SUPPORT_WHATSAPP?: string;
}): string | null {
  const parsed = SupportWhatsapp.safeParse(source.SUPPORT_WHATSAPP ?? "");
  return parsed.success ? parsed.data : null;
}

/**
 * This deployment's ConceptApp WhatsApp (`parseSupportWhatsapp`), read on
 * the server where /me is drawn: never in a browser file, where the setting
 * reads as unset. A value set but not E.164 is said in the log, naming the
 * setting and never the value.
 */
export function supportWhatsapp(): string | null {
  const raw = process.env.SUPPORT_WHATSAPP ?? "";
  const number = parseSupportWhatsapp({ SUPPORT_WHATSAPP: raw });
  if (number === null && raw.trim() !== "") {
    console.warn(
      "SUPPORT_WHATSAPP is set but not a number in E.164 (a plus, the country code and the number, no spaces): the help on /me offers no WhatsApp to ConceptApp's team (docs/production.md, B11)",
    );
  }
  return number;
}

/**
 * A Turnstile site key as Cloudflare writes it: a digit, `x`, and some 20
 * letters and digits (the ConceptApp widget's is 24 in all). A secret key
 * is longer (35), so one pasted here by mistake is refused and never
 * reaches a browser.
 */
const TurnstileSiteKey = z
  .string()
  .trim()
  .regex(/^[0-3]x[0-9A-Za-z_-]{18,30}$/);

/**
 * Turnstile's site key on this deployment (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`,
 * docs/production.md, Turnstile): public, it is in every page that sends
 * an SMS code. Unset or blank, Cloudflare's test key that always passes,
 * for local, CI and e2e, where Supabase's CAPTCHA is off. Anything else
 * throws naming the setting, never the value, so a wrong one fails the
 * build of /sign-in, which reads it as it is built.
 */
export function parseTurnstileSiteKey(source: {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
}): string {
  const raw = source.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  if (raw.trim() === "") return TURNSTILE_TEST_KEYS.pass;
  const parsed = TurnstileSiteKey.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY: Cloudflare Turnstile's Site Key (unset means its test key), never the Secret Key",
    );
  }
  return parsed.data;
}

/**
 * This deployment's Turnstile site key, read on the server by the pages
 * that send a code and handed to their screens (`CaptchaSetup`). Written
 * out in full, as a NEXT_PUBLIC_ variable must be to be read at build time.
 * On Vercel's Production a test key (the setting unset, most likely) is
 * said in the log, where /sign-in's build reads it: it passes anywhere, so
 * no screen shows it, and once Supabase's CAPTCHA is on every code would be
 * refused (docs/production.md, Turnstile, step 4). Never thrown: the merge
 * that brings this code in builds before the key is set.
 */
export function turnstileSiteKey(): string {
  const key = parseTurnstileSiteKey({
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  if (process.env.VERCEL_ENV === "production" && isTurnstileTestKey(key)) {
    console.warn(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset or a test key on Production: Cloudflare's test widget passes anywhere, and Supabase's CAPTCHA refuses its token (docs/production.md, Turnstile, step 4)",
    );
  }
  return key;
}

/** Whether `key` is one of Cloudflare's published test site keys. */
function isTurnstileTestKey(key: string): boolean {
  return (Object.values(TURNSTILE_TEST_KEYS) as string[]).includes(key);
}

/** The hiring file's keys, checked: which one seals, and every one that opens. */
export type EmployeeDataKeys = {
  /** The key new data keys are wrapped with. */
  active: number;
  /** Every key by its id, the active one among them; older ones still open. */
  keys: Map<number, Buffer>;
};

const KeyId = z.coerce.number().int().min(1).max(32767);
const KeyEntry = z.string().regex(/^[0-9]{1,5}:[A-Za-z0-9+/]{43}=$/);

/**
 * The hiring file's key-encryption keys (profile H4): `EMPLOYEE_DATA_KEKS`,
 * `id:base64` entries separated by commas, each id 1 to 32767 once and each
 * key 32 bytes, and `EMPLOYEE_DATA_KEK_ACTIVE`, the id new data keys are
 * wrapped with. Null when neither is set: the file is closed on this
 * deployment, and reads and writes say so. Throws naming the setting and the
 * rule, never a value, when one is set without the other or either is wrong.
 * `node tooling/employee-data-key.mjs` makes one.
 */
export function parseEmployeeDataKeys(source: {
  EMPLOYEE_DATA_KEKS?: string;
  EMPLOYEE_DATA_KEK_ACTIVE?: string;
}): EmployeeDataKeys | null {
  const listed = source.EMPLOYEE_DATA_KEKS?.trim() ?? "";
  const chosen = source.EMPLOYEE_DATA_KEK_ACTIVE?.trim() ?? "";
  if (listed === "" && chosen === "") return null;
  if (listed === "" || chosen === "") {
    throw new Error(
      "Hiring-file keys incomplete (EMPLOYEE_DATA_KEKS, EMPLOYEE_DATA_KEK_ACTIVE): set both or neither",
    );
  }
  const keys = new Map<number, Buffer>();
  for (const entry of listed.split(",").map((part) => part.trim())) {
    if (!KeyEntry.safeParse(entry).success) {
      throw new Error(
        "EMPLOYEE_DATA_KEKS: each entry is id:base64 of 32 bytes, separated by commas",
      );
    }
    const at = entry.indexOf(":");
    const id = KeyId.safeParse(entry.slice(0, at));
    const key = Buffer.from(entry.slice(at + 1), "base64");
    if (!id.success || key.length !== 32) {
      throw new Error(
        "EMPLOYEE_DATA_KEKS: each id is 1 to 32767 and each key 32 bytes",
      );
    }
    if (keys.has(id.data)) {
      throw new Error("EMPLOYEE_DATA_KEKS: each id appears once");
    }
    keys.set(id.data, key);
  }
  const active = KeyId.safeParse(chosen);
  if (!active.success || !/^[0-9]{1,5}$/.test(chosen)) {
    throw new Error("EMPLOYEE_DATA_KEK_ACTIVE: a key id, 1 to 32767");
  }
  if (!keys.has(active.data)) {
    throw new Error(
      "EMPLOYEE_DATA_KEK_ACTIVE: names none of EMPLOYEE_DATA_KEKS' ids",
    );
  }
  return { active: active.data, keys };
}
