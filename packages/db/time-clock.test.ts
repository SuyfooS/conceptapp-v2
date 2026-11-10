import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * A business's entries as PostgREST serves them: in order, at most 1000 rows
 * a request (`max_rows`), cut short without an error.
 */
const served = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  ranges: [] as [number, number][],
  orders: [] as string[],
}));
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        lt: () => query,
        or: () => query,
        order: (column: string) => {
          served.orders.push(column);
          return query;
        },
        range: async (first: number, last: number) => {
          served.ranges.push([first, last]);
          const end = Math.min(last + 1, first + 1000);
          return { data: served.rows.slice(first, end), error: null };
        },
      };
      return query;
    },
  }),
}));

const {
  getTimeEntries,
  hashPunchCode,
  hashShortCode,
  newPunchCode,
  newShortCode,
} = await import("./time-clock");
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

describe("a business's entries", () => {
  it("come back whole past PostgREST's 1000 rows, oldest first", async () => {
    // Four months of a busy business, as payroll reads them: 2,500 entries.
    const start = Date.parse("2026-07-01T05:00:00Z");
    served.rows = Array.from({ length: 2500 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      user_id: "11111111-1111-4111-a111-111111111111",
      clock_in: new Date(start + index * 3_600_000).toISOString(),
      clock_out: new Date(start + index * 3_600_000 + 1_800_000).toISOString(),
      source: "punch",
      in_proof: "scan",
      out_proof: "scan",
      confirmed_at: null,
      note: null,
      edited_by: null,
      edited_at: null,
      created_at: new Date(start + index * 3_600_000).toISOString(),
      time_breaks: [],
    }));
    const entries = await getTimeEntries(
      BUSINESS,
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-11-01T00:00:00Z"),
    );
    expect(entries).toHaveLength(2500);
    expect(entries.at(-1)?.id).toBe(served.rows.at(-1)?.id);
    expect(served.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // A stable order, so no row falls between two pages.
    expect(served.orders.slice(0, 2)).toEqual(["clock_in", "id"]);
  });
});
