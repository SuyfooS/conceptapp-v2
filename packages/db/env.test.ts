import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  demoDoorOpen,
  parseDemoDoor,
  parseEmployeeDataKeys,
  parsePublicEnv,
  parseSecretKey,
  parseTurnstileSiteKey,
  turnstileSiteKey,
} from "./env";

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

describe("parseDemoDoor", () => {
  // The demo door per site (Orel, 22 November 2026): unset is the site that
  // runs today, so it stays open with no change in Vercel.
  it("is open when unset, empty or on, in any case", () => {
    for (const value of [undefined, "", "  ", "on", "ON", " on ", "On\n"]) {
      expect(parseDemoDoor({ DEMO_DOOR: value }), JSON.stringify(value)).toBe(
        true,
      );
    }
    expect(parseDemoDoor({})).toBe(true);
  });

  it("is closed when off, in any case", () => {
    for (const value of ["off", "Off", "OFF", " off ", "off\n"]) {
      expect(parseDemoDoor({ DEMO_DOOR: value }), JSON.stringify(value)).toBe(
        false,
      );
    }
  });

  it("refuses anything else, naming the setting, never guessing", () => {
    for (const value of ["yes", "no", "0", "1", "false", "of", "closed"]) {
      expect(
        () => parseDemoDoor({ DEMO_DOOR: value }),
        JSON.stringify(value),
      ).toThrow(/DEMO_DOOR/);
    }
  });
});

describe("demoDoorOpen", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads this deployment's setting", () => {
    expect(demoDoorOpen()).toBe(true);
    vi.stubEnv("DEMO_DOOR", "off");
    expect(demoDoorOpen()).toBe(false);
    vi.stubEnv("DEMO_DOOR", "on");
    expect(demoDoorOpen()).toBe(true);
    vi.stubEnv("DEMO_DOOR", "maybe");
    expect(() => demoDoorOpen()).toThrow(/DEMO_DOOR/);
  });
});

describe("parseTurnstileSiteKey", () => {
  // Made up, and put together here so that no file holds a key that looks
  // real (tooling/captcha.test.ts).
  const SITE_KEY = `0x4${"A".repeat(7)}exampleKey00`;
  const SECRET = `0x4${"A".repeat(7)}exampleSecretKeyExample00`;

  /** The message it throws, or "" when it doesn't. */
  const refusal = (value: string) => {
    try {
      parseTurnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: value });
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  };

  it("is Cloudflare's always-passing test key when unset or blank", () => {
    for (const value of [undefined, "", "  ", "\n"]) {
      expect(
        parseTurnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: value }),
        JSON.stringify(value),
      ).toBe("1x00000000000000000000AA");
    }
    expect(parseTurnstileSiteKey({})).toBe("1x00000000000000000000AA");
  });

  it("takes a site key as Cloudflare writes it, trimmed, and its test keys", () => {
    expect(SITE_KEY).toHaveLength(22);
    expect(
      parseTurnstileSiteKey({
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: ` ${SITE_KEY}\n`,
      }),
    ).toBe(SITE_KEY);
    for (const key of [
      "1x00000000000000000000AA",
      "2x00000000000000000000AB",
      "3x00000000000000000000FF",
    ]) {
      expect(
        parseTurnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: key }),
      ).toBe(key);
    }
  });

  it("refuses anything else, a secret key too, naming the setting and never the value", () => {
    expect(SECRET).toHaveLength(35);
    for (const value of [
      "nope",
      "0x",
      SECRET,
      "1x0000000000000000000000000000000AA",
      `${SITE_KEY} ${SITE_KEY}`,
      "9x00000000000000000000AA",
    ]) {
      const message = refusal(value);
      expect(message, value).toMatch(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
      expect(message, value).not.toContain(value);
    }
  });
});

describe("turnstileSiteKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads this deployment's setting", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    expect(turnstileSiteKey()).toBe("1x00000000000000000000AA");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "3x00000000000000000000FF");
    expect(turnstileSiteKey()).toBe("3x00000000000000000000FF");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "nope");
    expect(() => turnstileSiteKey()).toThrow(/NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  });

  it("says in the log, never throwing, that Production has no key of its own", () => {
    // Made up, as above.
    const siteKey = `0x4${"A".repeat(7)}exampleKey00`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubEnv("VERCEL_ENV", "production");
      for (const unset of ["", "1x00000000000000000000AA"]) {
        vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", unset);
        warn.mockClear();
        expect(turnstileSiteKey()).toBe("1x00000000000000000000AA");
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toMatch(
          /NEXT_PUBLIC_TURNSTILE_SITE_KEY.*Production.*docs\/production\.md/,
        );
      }
      vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
      warn.mockClear();
      expect(turnstileSiteKey()).toBe(siteKey);
      expect(warn).not.toHaveBeenCalled();
      // Previews, CI and a computer use the test key on purpose.
      vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
      for (const env of ["preview", "development", ""]) {
        vi.stubEnv("VERCEL_ENV", env);
        expect(turnstileSiteKey()).toBe("1x00000000000000000000AA");
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("parseEmployeeDataKeys", () => {
  const one = randomBytes(32).toString("base64");
  const two = randomBytes(32).toString("base64");

  /** The message it throws, or "" when it doesn't. */
  const refusal = (source: Parameters<typeof parseEmployeeDataKeys>[0]) => {
    try {
      parseEmployeeDataKeys(source);
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  };

  it("is off with neither set", () => {
    expect(parseEmployeeDataKeys({})).toBeNull();
    expect(
      parseEmployeeDataKeys({
        EMPLOYEE_DATA_KEKS: " ",
        EMPLOYEE_DATA_KEK_ACTIVE: "",
      }),
    ).toBeNull();
  });

  it("reads each key by its id, and which one seals", () => {
    const parsed = parseEmployeeDataKeys({
      EMPLOYEE_DATA_KEKS: `1:${one}, 2:${two}`,
      EMPLOYEE_DATA_KEK_ACTIVE: "2",
    });
    expect(parsed?.active).toBe(2);
    expect([...(parsed?.keys.keys() ?? [])]).toEqual([1, 2]);
    expect(parsed?.keys.get(1)?.toString("base64")).toBe(one);
  });

  it("refuses one set without the other", () => {
    expect(refusal({ EMPLOYEE_DATA_KEKS: `1:${one}` })).toMatch(
      /EMPLOYEE_DATA_KEK_ACTIVE/,
    );
    expect(refusal({ EMPLOYEE_DATA_KEK_ACTIVE: "1" })).toMatch(
      /EMPLOYEE_DATA_KEKS/,
    );
  });

  it("refuses a bad entry, a short key, a repeated id or an active id that isn't there, never echoing a key", () => {
    const short = randomBytes(16).toString("base64");
    const cases = [
      { EMPLOYEE_DATA_KEKS: one, EMPLOYEE_DATA_KEK_ACTIVE: "1" },
      { EMPLOYEE_DATA_KEKS: `1:${short}`, EMPLOYEE_DATA_KEK_ACTIVE: "1" },
      { EMPLOYEE_DATA_KEKS: `0:${one}`, EMPLOYEE_DATA_KEK_ACTIVE: "1" },
      { EMPLOYEE_DATA_KEKS: `40000:${one}`, EMPLOYEE_DATA_KEK_ACTIVE: "1" },
      {
        EMPLOYEE_DATA_KEKS: `1:${one},1:${two}`,
        EMPLOYEE_DATA_KEK_ACTIVE: "1",
      },
      { EMPLOYEE_DATA_KEKS: `1:${one}`, EMPLOYEE_DATA_KEK_ACTIVE: "2" },
      { EMPLOYEE_DATA_KEKS: `1:${one}`, EMPLOYEE_DATA_KEK_ACTIVE: "one" },
    ];
    for (const source of cases) {
      const message = refusal(source);
      expect(message, JSON.stringify(Object.keys(source))).toMatch(
        /EMPLOYEE_DATA_KEK/,
      );
      for (const secret of [one, two, short]) {
        expect(message).not.toContain(secret);
        expect(message).not.toContain(secret.slice(0, 12));
      }
    }
  });
});

describe("tooling/employee-data-key.mjs", () => {
  /** What the script prints, as settings. */
  const made = (...args: string[]) =>
    Object.fromEntries(
      execFileSync(
        process.execPath,
        [
          join(__dirname, "..", "..", "tooling", "employee-data-key.mjs"),
          "--env",
          ...args,
        ],
        { encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at), line.slice(at + 1)];
        }),
    ) as { EMPLOYEE_DATA_KEKS: string; EMPLOYEE_DATA_KEK_ACTIVE: string };

  it("makes a key the parser takes, a new one every run", () => {
    const first = made();
    expect(parseEmployeeDataKeys(first)?.active).toBe(1);
    expect(made().EMPLOYEE_DATA_KEKS).not.toBe(first.EMPLOYEE_DATA_KEKS);
  });

  it("makes a rotation's next key, which seals beside the old one", () => {
    const old = made();
    const next = made("--id", "2");
    expect(next.EMPLOYEE_DATA_KEK_ACTIVE).toBe("2");
    const ring = parseEmployeeDataKeys({
      EMPLOYEE_DATA_KEKS: `${old.EMPLOYEE_DATA_KEKS},${next.EMPLOYEE_DATA_KEKS}`,
      EMPLOYEE_DATA_KEK_ACTIVE: next.EMPLOYEE_DATA_KEK_ACTIVE,
    });
    expect([...(ring?.keys.keys() ?? [])]).toEqual([1, 2]);
  });
});
