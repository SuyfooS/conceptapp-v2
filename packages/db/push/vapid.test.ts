import { createPublicKey, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { vapidKey } = await import("./env");
const {
  forgetVapidTokens,
  KEPT_TOKENS,
  TOKEN_HOURS,
  vapidAuthorization,
  vapidToken,
} = await import("./vapid");

// The ES256 key of RFC 7515, appendix A.3: a fixed pair, so these are vectors.
const JWK = {
  x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
  d: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI",
};
const PUBLIC_KEY =
  "BH_Nzidw9sRdQYPL7m_bS3tYBzM1e-nvE7rPbjx70VRFx_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0";
const SUBJECT = "mailto:push@example.com";
const config = {
  publicKey: PUBLIC_KEY,
  privateKey: vapidKey(PUBLIC_KEY, JWK.d),
  subject: SUBJECT,
};

// RFC 8292 section 2.4: the example token, its claims and its key.
const RFC_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA";
const RFC_KEY =
  "BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs";
const RFC_AUDIENCE = "https://push.example.net";
const RFC_EXP = 1453523768;

/** What a push service does with the header (RFC 8292 section 3). */
function check(authorization: string) {
  const match = /^vapid t=([^,\s]+), k=([A-Za-z0-9_-]+)$/.exec(authorization);
  if (!match) throw new Error(`not a vapid header: ${authorization}`);
  const [, token = "", k = ""] = match;
  const [header = "", claims = "", signature = ""] = token.split(".");
  const point = Buffer.from(k, "base64url");
  const key = createPublicKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "P-256",
      x: point.subarray(1, 33).toString("base64url"),
      y: point.subarray(33).toString("base64url"),
    },
  });
  const sig = Buffer.from(signature, "base64url");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString()),
    claims: JSON.parse(Buffer.from(claims, "base64url").toString()),
    k: point,
    signatureBytes: sig.length,
    verified: verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key, dsaEncoding: "ieee-p1363" },
      sig,
    ),
  };
}

beforeEach(() => forgetVapidTokens());

describe("the RFC 8292 example", () => {
  it("is accepted by the same check a push service makes", () => {
    const seen = check(`vapid t=${RFC_TOKEN}, k=${RFC_KEY}`);
    expect(seen.verified).toBe(true);
    expect(seen.claims).toEqual({
      aud: RFC_AUDIENCE,
      exp: RFC_EXP,
      sub: SUBJECT,
    });
  });

  it("has the header and claims our token writes for the same values", () => {
    const now = (RFC_EXP - TOKEN_HOURS * 3600) * 1000;
    const { token, expires } = vapidToken(RFC_AUDIENCE, config, now);
    const [header, claims, signature] = token.split(".");
    const [rfcHeader, rfcClaims] = RFC_TOKEN.split(".");
    expect(header).toBe(rfcHeader);
    expect(claims).toBe(rfcClaims);
    expect(expires).toBe(RFC_EXP);
    // ES256 signs with a fresh random number each time, so only its shape and
    // its check can match.
    expect(Buffer.from(signature ?? "", "base64url")).toHaveLength(64);
  });
});

describe("vapidAuthorization", () => {
  const now = Date.parse("2026-11-09T10:00:00Z");

  it("signs for the push service's origin, with our key", () => {
    const seen = check(
      vapidAuthorization(
        new URL("https://fcm.googleapis.com/fcm/send/abc?x=1"),
        config,
        now,
      ),
    );
    expect(seen.header).toEqual({ typ: "JWT", alg: "ES256" });
    expect(seen.claims).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: now / 1000 + TOKEN_HOURS * 3600,
      sub: SUBJECT,
    });
    expect(seen.verified).toBe(true);
    expect(seen.signatureBytes).toBe(64);
    expect([seen.k.length, seen.k[0]]).toEqual([65, 4]);
    expect(seen.k.toString("base64url")).toBe(PUBLIC_KEY);
  });

  it("names the origin with its port", () => {
    const seen = check(
      vapidAuthorization(
        new URL("http://127.0.0.1:3199/push/abc"),
        config,
        now,
      ),
    );
    expect(seen.claims.aud).toBe("http://127.0.0.1:3199");
  });

  it("expires within a day (RFC 8292 section 2)", () => {
    const seen = check(
      vapidAuthorization(new URL("https://web.push.apple.com/x"), config, now),
    );
    expect(seen.claims.exp - now / 1000).toBeGreaterThan(0);
    expect(seen.claims.exp - now / 1000).toBeLessThanOrEqual(24 * 3600);
  });

  it("keeps a token for an origin, and signs again in its last hour", () => {
    const url = new URL("https://web.push.apple.com/x");
    const first = vapidAuthorization(url, config, now);
    expect(vapidAuthorization(url, config, now + 60 * 60 * 1000)).toBe(first);
    expect(
      vapidAuthorization(
        new URL("https://web.push.apple.com/another-device"),
        config,
        now,
      ),
    ).toBe(first);
    expect(
      vapidAuthorization(url, config, now + (TOKEN_HOURS - 0.5) * 3600 * 1000),
    ).not.toBe(first);
    // Another push service gets its own.
    expect(
      check(
        vapidAuthorization(
          new URL("https://fcm.googleapis.com/x"),
          config,
          now,
        ),
      ).claims.aud,
    ).toBe("https://fcm.googleapis.com");
  });

  it("keeps a bounded number of tokens, the oldest going first", () => {
    const origin = (i: number) => new URL(`https://d${i}.push.apple.com/x`);
    const first = vapidAuthorization(origin(0), config, now);
    const second = vapidAuthorization(origin(1), config, now);
    // Another origin for every slot left, and one more.
    for (let i = 2; i <= KEPT_TOKENS; i += 1) {
      vapidAuthorization(origin(i), config, now);
    }
    // The first made room and is signed again; the second is still kept.
    expect(vapidAuthorization(origin(1), config, now)).toBe(second);
    expect(vapidAuthorization(origin(0), config, now)).not.toBe(first);
  });

  it("drops expired tokens before older ones that still hold", () => {
    const origin = (i: number) => new URL(`https://e${i}.push.apple.com/x`);
    const later = now + (TOKEN_HOURS + 1) * 3600 * 1000;
    // The first kept is good until long after `later`; every other slot
    // holds one that expired by then.
    const first = vapidAuthorization(origin(0), config, later);
    for (let i = 1; i < KEPT_TOKENS; i += 1) {
      vapidAuthorization(origin(i), config, now);
    }
    vapidAuthorization(origin(KEPT_TOKENS), config, later);
    expect(vapidAuthorization(origin(0), config, later)).toBe(first);
  });
});
