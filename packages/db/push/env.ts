import "server-only";
import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { loopbackOrigin } from "@domain/push-endpoint";

/**
 * The settings for notifications on the phone, read from the environment:
 *
 *   VAPID_PUBLIC_KEY   the application server key (RFC 8292): the P-256 point,
 *                      uncompressed (0x04, x, y), base64url. Public: browsers
 *                      subscribe with it.
 *   VAPID_PRIVATE_KEY  its private scalar d, 32 bytes, base64url. A secret.
 *   VAPID_SUBJECT      who the push services may contact: mailto: or https:.
 *   CRON_SECRET        what the database's jobs send to /cron/notifications
 *                      (every minute) and /cron/list-photos (once a day). A
 *                      secret, 32 characters or more.
 *   PUSH_TEST_ORIGIN   the browser tests' loopback mock push service; never
 *                      honoured on Vercel.
 *
 * `node tooling/vapid-keys.mjs` makes a key pair. Without the three VAPID
 * settings the app notifies in the app only and says nothing about it.
 */

export type PushConfig = {
  /** VAPID_PUBLIC_KEY as given: what browsers subscribe with. */
  publicKey: string;
  privateKey: KeyObject;
  subject: string;
};

type PushEnv = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

const B64URL = /^[A-Za-z0-9_-]+$/;

/**
 * The key pair, checked: the public key a P-256 point, the private key 32
 * bytes, and the two a pair. Throws naming the setting, never its value.
 */
export function vapidKey(publicKey: string, privateKey: string): KeyObject {
  const point = B64URL.test(publicKey)
    ? Buffer.from(publicKey, "base64url")
    : Buffer.alloc(0);
  if (point.length !== 65 || point[0] !== 4) {
    throw new Error(
      "VAPID_PUBLIC_KEY: not an uncompressed P-256 point in base64url",
    );
  }
  const d = B64URL.test(privateKey)
    ? Buffer.from(privateKey, "base64url")
    : Buffer.alloc(0);
  if (d.length !== 32) {
    throw new Error("VAPID_PRIVATE_KEY: not 32 bytes in base64url");
  }
  const x = point.subarray(1, 33).toString("base64url");
  const y = point.subarray(33).toString("base64url");
  let key: KeyObject;
  try {
    key = createPrivateKey({
      format: "jwk",
      key: { kty: "EC", crv: "P-256", d: d.toString("base64url"), x, y },
    });
  } catch {
    throw new Error("VAPID_PRIVATE_KEY: not a P-256 private key");
  }
  // The pair, checked by hand rather than trusting the import to refuse one
  // that doesn't match: what the private key signs, the public key verifies.
  const probe = Buffer.from("ConceptApp VAPID key pair");
  const publicPoint = createPublicKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", x, y },
  });
  if (!verify("sha256", probe, publicPoint, sign("sha256", probe, key))) {
    throw new Error(
      "VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY are not one key pair",
    );
  }
  return key;
}

/** Who push services may contact, as they require it. */
function subjectOf(raw: string): string | null {
  const value = raw.trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The settings from these values: null while any of the three is unset (the
 * app notifies in the app only); throws, naming the setting and never its
 * value, when one is set wrong.
 */
export function parsePushConfig(env: PushEnv): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const rawSubject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !rawSubject) return null;
  const subject = subjectOf(rawSubject);
  if (!subject) {
    throw new Error(
      "VAPID_SUBJECT: must be a mailto: address or an https: URL",
    );
  }
  return { publicKey, privateKey: vapidKey(publicKey, privateKey), subject };
}

let cached: { from: string; config: PushConfig | null } | null = null;

/**
 * This process's settings, or null for in-app only: also when one is set
 * wrong, which is logged once by its name. Read again only when the values
 * change.
 */
export function pushConfig(): PushConfig | null {
  const env = {
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  };
  const from = JSON.stringify(env);
  if (cached?.from === from) return cached.config;
  let config: PushConfig | null;
  try {
    config = parsePushConfig(env);
  } catch (error) {
    console.error(`Notifications stay in the app: ${(error as Error).message}`);
    config = null;
  }
  cached = { from, config };
  return config;
}

/** CRON_SECRET, when it is long enough to be one; else null. */
export function parseCronSecret(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && value.length >= 32 ? value : null;
}

/** Whether a request's `Authorization` carries this process's CRON_SECRET. */
export function hasCronSecret(authorization: string | null): boolean {
  const secret = parseCronSecret(process.env.CRON_SECRET);
  if (!secret || !authorization) return false;
  const given = Buffer.from(authorization);
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * The browser tests' mock push service: its loopback origin, honoured only off
 * Vercel. Null everywhere else.
 */
export function pushTestOrigin(
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (env.VERCEL) return null;
  return loopbackOrigin(env.PUSH_TEST_ORIGIN);
}
