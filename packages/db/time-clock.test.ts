import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { hashPunchCode, hashShortCode, newPunchCode, newShortCode } =
  await import("./time-clock");
const { punchKey, punchKeyFrom } = await import("./punch-key");

const BUSINESS = "00000000-0000-4000-b000-000000000001";
const OTHER = "00000000-0000-4000-b000-000000000002";

describe("punch codes", () => {
  it("are fresh, URL-safe codes", () => {
    const a = newPunchCode();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(newPunchCode());
  });

  it("are stored as the SHA-256 the database expects", () => {
    // echo -n abc | sha256sum
    expect(hashPunchCode("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashPunchCode(newPunchCode())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the digits under a code", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("make six digits, leading zeros kept", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(newShortCode()).toMatch(/^\d{6}$/);
    }
  });

  it("hash the digits with the server's key, per business", () => {
    const key = punchKeyFrom("sb_secret_one");
    const other = punchKeyFrom("sb_secret_two");
    expect(key).toHaveLength(32);
    expect(key.equals(punchKeyFrom("sb_secret_one"))).toBe(true);
    expect(key.equals(other)).toBe(false);

    const hash = hashShortCode(BUSINESS, "004201", key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShortCode(BUSINESS, "004201", key)).toBe(hash);
    expect(hashShortCode(OTHER, "004201", key)).not.toBe(hash);
    expect(hashShortCode(BUSINESS, "004202", key)).not.toBe(hash);
    expect(hashShortCode(BUSINESS, "004201", other)).not.toBe(hash);
    // Not a plain hash of the digits, which a million guesses would undo.
    expect(hash).not.toBe(hashPunchCode(`${BUSINESS}:004201`));
  });

  it("need the secret key to hash digits, and never say it", () => {
    for (const value of ["", "sb_publishable_leaked"]) {
      vi.stubEnv("SUPABASE_SECRET_KEY", value);
      let message = "";
      try {
        punchKey();
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/SUPABASE_SECRET_KEY/);
      if (value) expect(message).not.toContain(value);
      expect(() => hashShortCode(BUSINESS, "004201")).toThrow(
        /SUPABASE_SECRET_KEY/,
      );
    }
  });
});
