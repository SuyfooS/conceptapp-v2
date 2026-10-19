import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseSecretKey } from "./env";

describe("parsePublicEnv", () => {
  it("accepts a URL and a publishable key", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
      }),
    ).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "sb_publishable_abc",
    });
  });

  it("fails when a setting is missing", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("refuses a secret or legacy key in the public slot", () => {
    for (const key of ["sb_secret_abc", "eyJhbGciOiJIUzI1NiJ9.e30.x"]) {
      expect(() =>
        parsePublicEnv({
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toThrow();
    }
  });
});

describe("parseSecretKey", () => {
  it("accepts a secret key", () => {
    expect(parseSecretKey({ SUPABASE_SECRET_KEY: "sb_secret_abc" })).toBe(
      "sb_secret_abc",
    );
  });

  it("refuses a missing, publishable or legacy key without echoing it", () => {
    for (const key of [
      undefined,
      "sb_publishable_abc",
      "eyJhbGciOiJIUzI1NiJ9.e30.x",
    ]) {
      let message = "";
      try {
        parseSecretKey({ SUPABASE_SECRET_KEY: key });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/SUPABASE_SECRET_KEY/);
      if (key) expect(message).not.toContain(key);
    }
  });
});
