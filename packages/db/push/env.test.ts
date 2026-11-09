import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  hasCronSecret,
  parseCronSecret,
  parsePushConfig,
  pushConfig,
  pushTestOrigin,
} = await import("./env");

/** What tooling/vapid-keys.mjs prints, as settings. */
function generated(): Record<string, string> {
  const out = execFileSync(
    process.execPath,
    [join(__dirname, "..", "..", "..", "tooling", "vapid-keys.mjs"), "--env"],
    { encoding: "utf8" },
  );
  return Object.fromEntries(
    out
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

const SUBJECT = "mailto:dev@conceptapp.invalid";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("tooling/vapid-keys.mjs", () => {
  it("prints a pair the app takes", () => {
    const keys = generated();
    expect(Object.keys(keys)).toEqual([
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
    ]);
    const config = parsePushConfig({ ...keys, VAPID_SUBJECT: SUBJECT });
    expect(config?.publicKey).toBe(keys.VAPID_PUBLIC_KEY);
    expect(config?.subject).toBe(SUBJECT);
    // 65 bytes, 0x04 first; 32 bytes.
    const point = Buffer.from(keys.VAPID_PUBLIC_KEY ?? "", "base64url");
    expect([point.length, point[0]]).toEqual([65, 4]);
    expect(Buffer.from(keys.VAPID_PRIVATE_KEY ?? "", "base64url")).toHaveLength(
      32,
    );
  });

  it("makes a new pair every time", () => {
    expect(generated().VAPID_PRIVATE_KEY).not.toBe(
      generated().VAPID_PRIVATE_KEY,
    );
  });
});

describe("parsePushConfig", () => {
  it("is in-app only while any of the three is unset", () => {
    const keys = generated();
    expect(parsePushConfig({})).toBeNull();
    expect(parsePushConfig({ ...keys })).toBeNull();
    expect(
      parsePushConfig({
        VAPID_PUBLIC_KEY: keys.VAPID_PUBLIC_KEY,
        VAPID_SUBJECT: SUBJECT,
      }),
    ).toBeNull();
    expect(parsePushConfig({ ...keys, VAPID_SUBJECT: "  " })).toBeNull();
  });

  it("takes a mailto: or https: subject only", () => {
    const keys = generated();
    for (const subject of [
      "mailto:orel@example.com",
      "https://www.conceptapp.co.il",
    ]) {
      expect(
        parsePushConfig({ ...keys, VAPID_SUBJECT: subject })?.subject,
      ).toBe(subject);
    }
    for (const subject of [
      "orel@example.com",
      "http://example.com",
      "mailto:nobody",
    ]) {
      expect(() =>
        parsePushConfig({ ...keys, VAPID_SUBJECT: subject }),
      ).toThrow(/VAPID_SUBJECT/);
    }
  });

  it("refuses keys that aren't a pair, without saying them", () => {
    const keys = generated();
    const other = generated();
    const cases = [
      { ...keys, VAPID_PRIVATE_KEY: other.VAPID_PRIVATE_KEY },
      { ...keys, VAPID_PUBLIC_KEY: other.VAPID_PUBLIC_KEY },
      { ...keys, VAPID_PUBLIC_KEY: "not-a-key" },
      { ...keys, VAPID_PRIVATE_KEY: "c2hvcnQ" },
      { ...keys, VAPID_PRIVATE_KEY: "not base64!" },
    ];
    for (const env of cases) {
      let message = "";
      try {
        parsePushConfig({ ...env, VAPID_SUBJECT: SUBJECT });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/VAPID_(PUBLIC|PRIVATE)_KEY/);
      for (const value of [
        keys.VAPID_PRIVATE_KEY,
        other.VAPID_PRIVATE_KEY,
        keys.VAPID_PUBLIC_KEY,
        other.VAPID_PUBLIC_KEY,
      ]) {
        expect(message).not.toContain(value);
      }
    }
  });

  it("refuses a public key that isn't P-256", () => {
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "secp384r1",
    });
    const jwk = publicKey.export({ format: "jwk" });
    const point = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x ?? "", "base64url"),
      Buffer.from(jwk.y ?? "", "base64url"),
    ]).toString("base64url");
    expect(() =>
      parsePushConfig({
        ...generated(),
        VAPID_PUBLIC_KEY: point,
        VAPID_SUBJECT: SUBJECT,
      }),
    ).toThrow(/VAPID_PUBLIC_KEY/);
  });
});

describe("pushConfig", () => {
  it("is in-app only, and says which setting, when one is wrong", () => {
    const keys = generated();
    vi.stubEnv("VAPID_PUBLIC_KEY", keys.VAPID_PUBLIC_KEY ?? "");
    vi.stubEnv("VAPID_PRIVATE_KEY", generated().VAPID_PRIVATE_KEY ?? "");
    vi.stubEnv("VAPID_SUBJECT", SUBJECT);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(pushConfig()).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toMatch(/VAPID_PRIVATE_KEY/);
    // Logged once, not on every page.
    expect(pushConfig()).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("reads the settings once they are right", () => {
    const keys = generated();
    vi.stubEnv("VAPID_PUBLIC_KEY", keys.VAPID_PUBLIC_KEY ?? "");
    vi.stubEnv("VAPID_PRIVATE_KEY", keys.VAPID_PRIVATE_KEY ?? "");
    vi.stubEnv("VAPID_SUBJECT", SUBJECT);
    expect(pushConfig()?.publicKey).toBe(keys.VAPID_PUBLIC_KEY);
  });
});

describe("the cron secret", () => {
  it("is 32 characters or more", () => {
    expect(parseCronSecret(undefined)).toBeNull();
    expect(parseCronSecret("short")).toBeNull();
    expect(parseCronSecret("a".repeat(32))).toBe("a".repeat(32));
  });

  it("is checked in the Authorization header", () => {
    const secret = "s".repeat(64);
    vi.stubEnv("CRON_SECRET", secret);
    expect(hasCronSecret(`Bearer ${secret}`)).toBe(true);
    expect(hasCronSecret(`Bearer ${"t".repeat(64)}`)).toBe(false);
    expect(hasCronSecret(secret)).toBe(false);
    expect(hasCronSecret(null)).toBe(false);
    vi.stubEnv("CRON_SECRET", "short");
    expect(hasCronSecret("Bearer short")).toBe(false);
  });
});

describe("pushTestOrigin", () => {
  it("is the loopback mock, off Vercel only", () => {
    expect(pushTestOrigin({ PUSH_TEST_ORIGIN: "http://127.0.0.1:3199" })).toBe(
      "http://127.0.0.1:3199",
    );
    expect(
      pushTestOrigin({
        PUSH_TEST_ORIGIN: "http://127.0.0.1:3199",
        VERCEL: "1",
      }),
    ).toBeNull();
    expect(
      pushTestOrigin({ PUSH_TEST_ORIGIN: "https://fcm.googleapis.com" }),
    ).toBe(null);
    expect(pushTestOrigin({})).toBeNull();
  });
});
