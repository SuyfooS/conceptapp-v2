import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEmployeeDataKeys, parsePublicEnv, parseSecretKey } from "./env";

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
