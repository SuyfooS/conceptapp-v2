import "server-only";
import { sign } from "node:crypto";
import type { PushConfig } from "./env";

/**
 * VAPID (RFC 8292): who is sending, proved to the push service with a JWT
 * signed by the application server key, ES256, with `node:crypto` alone. The
 * header is `vapid t=<jwt>, k=<public key>` (§3). The token names the push
 * service's origin (`aud`), expires within a day (`exp`, §2) and says whom to
 * contact (`sub`). Apple asks not to sign a new one more than once an hour,
 * so each origin's token is kept and signed again only in the last hour of
 * its twelve.
 */

/** How long a token is good for: twelve hours, under the day RFC 8292 allows. */
export const TOKEN_HOURS = 12;

const b64url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64url");

/** A fresh token for one push service's origin, as of `now` (milliseconds). */
export function vapidToken(
  audience: string,
  config: Pick<PushConfig, "privateKey" | "subject">,
  now: number,
): { token: string; expires: number } {
  const expires = Math.floor(now / 1000) + TOKEN_HOURS * 3600;
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64url(
    JSON.stringify({ aud: audience, exp: expires, sub: config.subject }),
  );
  const input = `${header}.${claims}`;
  // A JWS wants r || s (64 bytes), not the DER node:crypto gives by default.
  const signature = sign("sha256", Buffer.from(input), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return { token: `${input}.${b64url(signature)}`, expires };
}

/**
 * Tokens kept at most. Push services are a handful of origins, so this many
 * means odd endpoints (each of a service's subdomains is its own origin):
 * the expired ones go first, then the oldest kept.
 */
export const KEPT_TOKENS = 32;

const tokens = new Map<string, { token: string; expires: number }>();

/** Forget the kept tokens: for tests, and when the keys change. */
export function forgetVapidTokens(): void {
  tokens.clear();
}

/** Keep a token, making room first; a Map keeps the order tokens came in. */
function keep(
  key: string,
  kept: { token: string; expires: number },
  now: number,
): void {
  tokens.delete(key);
  if (tokens.size >= KEPT_TOKENS) {
    for (const [other, { expires }] of tokens) {
      if (expires <= now / 1000) tokens.delete(other);
    }
  }
  while (tokens.size >= KEPT_TOKENS) {
    const oldest = tokens.keys().next().value;
    if (oldest === undefined) break;
    tokens.delete(oldest);
  }
  tokens.set(key, kept);
}

/**
 * The `Authorization` header for a push to `endpoint`, for the push service at
 * its origin (with its port, if any).
 */
export function vapidAuthorization(
  endpoint: URL,
  config: PushConfig,
  now = Date.now(),
): string {
  const audience = endpoint.origin;
  // A token belongs to its key and its subject as well as its audience.
  const key = `${audience} ${config.publicKey} ${config.subject}`;
  let kept = tokens.get(key);
  if (!kept || kept.expires - now / 1000 < 3600) {
    kept = vapidToken(audience, config, now);
    keep(key, kept, now);
  }
  return `vapid t=${kept.token}, k=${config.publicKey}`;
}
