import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  EmployeeDataUnreadable,
  employeeKeyRing,
  fromBase64,
  newDataKey,
  open,
  seal,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
} = await import("./crypto");

const BUSINESS = "F1000000-0000-4000-B000-000000000001";
const USER = "f1000000-0000-4000-a000-000000000002";
const place = {
  table: "employee_details" as const,
  column: "id_enc" as const,
  business: BUSINESS,
  user: USER,
};
const ring = (active = 1) => ({
  active,
  keys: new Map([
    [1, randomBytes(32)],
    [2, randomBytes(32)],
  ]),
});

/** What opening throws, or null when it opens. */
const failure = (run: () => unknown) => {
  try {
    run();
    return null;
  } catch (error) {
    return error as Error;
  }
};

describe("sealing a value", () => {
  it("opens again with its key and place", () => {
    const dek = newDataKey();
    const sealed = seal(dek, "000000018", place);
    expect(sealed[0]).toBe(1);
    expect(sealed.length).toBe(1 + 12 + 16 + 9);
    expect(open(dek, sealed, place, { demo: false })).toBe("000000018");
  });

  it("differs every time, with a fresh IV", () => {
    const dek = newDataKey();
    const a = seal(dek, "000000018", place);
    const b = seal(dek, "000000018", place);
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(1, 13).equals(b.subarray(1, 13))).toBe(false);
  });

  it("holds no byte run of what it sealed", () => {
    const dek = newDataKey();
    const text = "רחוב הדגמה 12";
    const sealed = seal(dek, text, { ...place, column: "address_enc" });
    expect(sealed.includes(Buffer.from(text, "utf8"))).toBe(false);
    expect(sealed.includes(Buffer.from("הדגמה", "utf8"))).toBe(false);
  });

  it("doesn't open in another table, column, business or person", () => {
    const dek = newDataKey();
    const sealed = seal(dek, "000000018", place);
    for (const elsewhere of [
      { ...place, table: "member_emergency_contacts" as const },
      { ...place, column: "bank_account_enc" as const },
      { ...place, business: "f1000000-0000-4000-b000-000000000009" },
      { ...place, user: "f1000000-0000-4000-a000-000000000009" },
    ]) {
      expect(
        failure(() => open(dek, sealed, elsewhere, { demo: false })),
      ).toBeInstanceOf(EmployeeDataUnreadable);
    }
  });

  it("reads uuids in either case as one place", () => {
    const dek = newDataKey();
    const sealed = seal(dek, "x1", place);
    expect(
      open(
        dek,
        sealed,
        {
          ...place,
          business: BUSINESS.toLowerCase(),
          user: USER.toUpperCase(),
        },
        { demo: false },
      ),
    ).toBe("x1");
  });

  it("doesn't open with another key, or once a byte of it changed", () => {
    const dek = newDataKey();
    const sealed = seal(dek, "000000018", place);
    expect(
      failure(() => open(newDataKey(), sealed, place, { demo: false })),
    ).toBeInstanceOf(EmployeeDataUnreadable);
    // The IV, the tag and the ciphertext, a bit each.
    for (const at of [1, 13, 29, sealed.length - 1]) {
      const changed = Buffer.from(sealed);
      changed[at] = (changed[at] ?? 0) ^ 1;
      expect(
        failure(() => open(dek, changed, place, { demo: false })),
      ).toBeInstanceOf(EmployeeDataUnreadable);
    }
  });

  it("refuses another format's first byte", () => {
    const dek = newDataKey();
    const sealed = Buffer.from(seal(dek, "000000018", place));
    sealed[0] = 2;
    expect(
      failure(() => open(dek, sealed, place, { demo: false })),
    ).toBeInstanceOf(EmployeeDataUnreadable);
    expect(
      failure(() => open(null, seal(dek, "x", place), place, { demo: true })),
    ).toBeInstanceOf(EmployeeDataUnreadable);
  });

  it("reads a demo's made-up text only when the read says it's a demo's", () => {
    const demo = Buffer.concat([
      Buffer.from([0]),
      Buffer.from("000000018", "utf8"),
    ]);
    expect(open(null, demo, place, { demo: true })).toBe("000000018");
    expect(
      failure(() => open(newDataKey(), demo, place, { demo: false })),
    ).toBeInstanceOf(EmployeeDataUnreadable);
  });

  it("never says what it held when it fails", () => {
    const dek = newDataKey();
    const sealed = seal(dek, "000000018", place);
    const error = failure(() =>
      open(newDataKey(), sealed, place, { demo: false }),
    );
    expect(error?.message).not.toContain("000000018");
    expect(error?.message).not.toContain(toBase64(sealed));
  });

  it("goes to the database as base64 and back", () => {
    const dek = newDataKey();
    const sealed = seal(dek, "x".repeat(200), place);
    const text = toBase64(sealed);
    expect(text).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(fromBase64(text).equals(sealed)).toBe(true);
  });
});

describe("a person's data key", () => {
  it("wraps with the active key into 61 bytes, and unwraps", () => {
    const keys = ring();
    const dek = newDataKey();
    const { kekId, wrapped } = wrapDataKey(keys, dek, BUSINESS, USER);
    expect(kekId).toBe(1);
    expect(wrapped.length).toBe(61);
    expect(wrapped[0]).toBe(1);
    expect(
      unwrapDataKey(keys, kekId, wrapped, BUSINESS, USER).equals(dek),
    ).toBe(true);
  });

  it("doesn't unwrap for another person, or with a key the ring doesn't hold", () => {
    const keys = ring();
    const { kekId, wrapped } = wrapDataKey(keys, newDataKey(), BUSINESS, USER);
    expect(
      failure(() =>
        unwrapDataKey(
          keys,
          kekId,
          wrapped,
          BUSINESS,
          "f1000000-0000-4000-a000-000000000009",
        ),
      ),
    ).toBeInstanceOf(EmployeeDataUnreadable);
    expect(
      failure(() => unwrapDataKey(keys, 3, wrapped, BUSINESS, USER)),
    ).toBeInstanceOf(EmployeeDataUnreadable);
  });

  it("rotates: new wraps use the second key, and one wrapped with the first still opens", () => {
    const first = ring(1);
    const dek = newDataKey();
    const old = wrapDataKey(first, dek, BUSINESS, USER);
    const rotated = { active: 2, keys: first.keys };
    const fresh = wrapDataKey(rotated, newDataKey(), BUSINESS, USER);
    expect(fresh.kekId).toBe(2);
    expect(
      unwrapDataKey(rotated, old.kekId, old.wrapped, BUSINESS, USER).equals(
        dek,
      ),
    ).toBe(true);
  });
});

describe("this process's keys", () => {
  const saved = {
    keks: process.env.EMPLOYEE_DATA_KEKS,
    active: process.env.EMPLOYEE_DATA_KEK_ACTIVE,
  };
  afterEach(() => {
    // process.env keeps strings: undefined would come back as "undefined".
    for (const [name, value] of [
      ["EMPLOYEE_DATA_KEKS", saved.keks],
      ["EMPLOYEE_DATA_KEK_ACTIVE", saved.active],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.restoreAllMocks();
  });

  it("are the test run's own key (tooling/vitest-setup.ts)", () => {
    const keys = employeeKeyRing();
    expect(keys?.active).toBe(1);
    expect(keys?.keys.get(1)?.length).toBe(32);
  });

  it("are none, said once by name, when set wrong", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const key = randomBytes(16).toString("base64");
    process.env.EMPLOYEE_DATA_KEKS = `1:${key}`;
    process.env.EMPLOYEE_DATA_KEK_ACTIVE = "1";
    expect(employeeKeyRing()).toBeNull();
    expect(employeeKeyRing()).toBeNull();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/EMPLOYEE_DATA_KEKS/);
    expect(String(logged.mock.calls[0]?.[0])).not.toContain(key);
  });

  it("are none when neither is set", () => {
    delete process.env.EMPLOYEE_DATA_KEKS;
    delete process.env.EMPLOYEE_DATA_KEK_ACTIVE;
    expect(employeeKeyRing()).toBeNull();
  });
});
