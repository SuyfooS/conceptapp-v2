import "server-only";
import { hkdfSync } from "node:crypto";
import { parseSecretKey } from "./env";

/*
 * The key the clock's six digits are hashed with, so the database alone can't
 * be turned back into digits (an HMAC, where a plain hash of six digits would
 * fall to a million guesses). It comes from SUPABASE_SECRET_KEY: anyone who
 * holds that key holds the whole database already, so a separate secret would
 * protect nothing more, and there is nothing else to set. Rotating the secret
 * key only invalidates digits for the minute a code lives. A separate
 * PUNCH_CODE_SECRET would change `punchKey` alone.
 */

const INFO = "conceptapp/punch-short-code/v1";

/** HKDF-SHA256 of a secret key, 32 bytes. Pure, for the tests. */
export function punchKeyFrom(secretKey: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secretKey, Buffer.alloc(0), INFO, 32));
}

let key: Buffer | null = null;

/**
 * The key, made once per process from SUPABASE_SECRET_KEY. Never logged; a
 * missing or wrong secret key throws without echoing it (parseSecretKey).
 */
export function punchKey(): Buffer {
  key ??= punchKeyFrom(
    parseSecretKey({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY }),
  );
  return key;
}
