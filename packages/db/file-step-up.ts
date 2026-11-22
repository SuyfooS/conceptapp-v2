import "server-only";
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { parseSecretKey } from "./env";

/*
 * A holder's step-up for the hiring file (profile H6a, issue #82 §2.4): the
 * moment an SMS code proved a holder of people.files was at their own phone,
 * kept on their device in a cookie the server signs, so their files stay
 * open for the 15 minutes after their last activity and no longer. The
 * value holds two ids and a time, never a value of a file:
 * `v1.<business>.<holder>.<atMs>.<mac>`, the MAC an HMAC-SHA256 over the
 * rest, keyed by HKDF of SUPABASE_SECRET_KEY with its own info, as the
 * clock's punch key is (@db/punch-key): anyone who holds that key holds the
 * database already, so a separate secret would protect nothing more.
 * Rotating it locks every file screen, which a code opens again.
 */

export const FILE_STEP_UP_INFO = "conceptapp/file-step-up/v1";

const VERSION = "v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MOMENT = /^\d{1,16}$/;
const MAC = /^[A-Za-z0-9_-]{43}$/;

/** HKDF-SHA256 of a secret key, 32 bytes. Pure, for the tests. */
export function fileStepUpKeyFrom(secretKey: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secretKey, Buffer.alloc(0), FILE_STEP_UP_INFO, 32),
  );
}

let key: Buffer | null = null;

/**
 * The key, made once per process from SUPABASE_SECRET_KEY. Never logged; a
 * missing or wrong secret key throws without echoing it (parseSecretKey).
 */
export function fileStepUpKey(): Buffer {
  key ??= fileStepUpKeyFrom(
    parseSecretKey({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY }),
  );
  return key;
}

/** Whose step-up it is: the business the files are in, and the holder. */
export type StepUpWhose = { business: string; holder: string };

function macOf(text: string, secret: Buffer): string {
  return createHmac("sha256", secret).update(text).digest("base64url");
}

/** The cookie's value for a step-up at `atMs`. */
export function sealFileStepUp(
  at: StepUpWhose & { atMs: number },
  secret: Buffer = fileStepUpKey(),
): string {
  const text = `${VERSION}.${at.business}.${at.holder}.${Math.trunc(at.atMs)}`;
  return `${text}.${macOf(text, secret)}`;
}

/**
 * The moment a cookie's value says the holder's step-up was, when it is one
 * this server signed, for this business and this holder; null for anything
 * else: another key, another business's or person's, a value changed, cut
 * or added to. Never throws on what a browser sends.
 */
export function fileStepUpAt(
  value: string | undefined,
  whose: StepUpWhose,
  secret: Buffer = fileStepUpKey(),
): number | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const parts = value.split(".");
  if (parts.length !== 5) return null;
  const [version, business, holder, moment, mac] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (
    version !== VERSION ||
    !UUID.test(business) ||
    !UUID.test(holder) ||
    !MOMENT.test(moment) ||
    !MAC.test(mac)
  ) {
    return null;
  }
  const atMs = Number(moment);
  if (!Number.isSafeInteger(atMs)) return null;
  const expected = Buffer.from(
    macOf(`${version}.${business}.${holder}.${moment}`, secret),
  );
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  if (business !== whose.business || holder !== whose.holder) return null;
  return atMs;
}
