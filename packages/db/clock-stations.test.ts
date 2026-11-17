import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The database as the secret key reaches it: how many stations run, and
 * what each function answers; every call kept, in order.
 */
const db = vi.hoisted(() => ({
  running: 0,
  answers: {} as Record<
    string,
    { data?: unknown; error: { code?: string; message: string } | null }[]
  >,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  counted: [] as unknown[][],
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const query = {
        select: (...args: unknown[]) => {
          db.counted.push([table, ...args]);
          return query;
        },
        eq: (...args: unknown[]) => {
          db.counted.push(["eq", ...args]);
          return query;
        },
        is: async (...args: unknown[]) => {
          db.counted.push(["is", ...args]);
          return { data: null, count: db.running, error: null };
        },
      };
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args });
      return db.answers[name]?.shift() ?? { data: null, error: null };
    },
  }),
}));
vi.mock("./supabase/server", () => ({ createClient: async () => ({}) }));

const { hashStationToken, LOCK_PAIRING_SLOTS, lockPairingHash, lockStation } =
  await import("./clock-stations");
const { punchKeyFrom } = await import("./punch-key");

const ACTOR = "00000000-0000-4000-a000-000000000001";
const BUSINESS = "00000000-0000-4000-b000-000000000001";
const OTHER = "00000000-0000-4000-b000-000000000002";
const STATION = "00000000-0000-4000-c000-000000000001";

const started = () =>
  db.calls.filter((call) => call.name === "start_station_pairing");
const approved = () =>
  db.calls.filter((call) => call.name === "approve_station_pairing");

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_clock_stations_test");
  db.running = 0;
  db.answers = {};
  db.calls = [];
  db.counted = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a lock's pairing", () => {
  const key = punchKeyFrom("sb_secret_one");

  it("is a few hashes of the business's own, made with the server's key", () => {
    const hashes = [0, 1, 2].map((slot) =>
      lockPairingHash(BUSINESS, slot, key),
    );
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(hashes).size).toBe(3);
    expect(lockPairingHash(BUSINESS, 0, key)).toBe(hashes[0]);
    expect(lockPairingHash(OTHER, 0, key)).not.toBe(hashes[0]);
    expect(
      lockPairingHash(BUSINESS, 0, punchKeyFrom("sb_secret_two")),
    ).not.toBe(hashes[0]);
    // Not a plain hash anyone could make from the business's id.
    expect(hashes[0]).not.toBe(hashStationToken(`station-lock:${BUSINESS}:0`));
  });
});

describe("locking a device", () => {
  it("makes a station of the business, paired on its own hash and approved at once", async () => {
    db.running = 3;
    db.answers.approve_station_pairing = [{ data: STATION, error: null }];
    const result = await lockStation(ACTOR, BUSINESS, "Entrance");
    expect(result).toEqual({
      ok: true,
      value: { token: expect.any(String), stationId: STATION },
    });
    if (!result.ok) return;
    expect(db.counted).toEqual([
      ["clock_stations", "id", { count: "exact", head: true }],
      ["eq", "business_id", BUSINESS],
      ["is", "stopped_at", null],
    ]);
    expect(db.calls.map((call) => call.name)).toEqual([
      "start_station_pairing",
      "approve_station_pairing",
    ]);
    const pairing = lockPairingHash(BUSINESS, 0);
    expect(started()[0]?.args).toEqual({
      pairing_hash: pairing,
      short_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      token_hash: hashStationToken(result.value.token),
    });
    expect(approved()[0]?.args).toEqual({
      actor: ACTOR,
      business: BUSINESS,
      name: "Entrance",
      pairing_hash: pairing,
    });
  });

  it("refuses ten running before any pairing starts, so nothing is left pairing", async () => {
    db.running = 10;
    expect(await lockStation(ACTOR, BUSINESS, "Entrance")).toEqual({
      ok: false,
      failure: "tooManyStations",
    });
    expect(db.calls).toEqual([]);
  });

  it("says ten running when they were reached meanwhile", async () => {
    db.running = 9;
    db.answers.approve_station_pairing = [
      { error: { code: "54000", message: "At most ten stations" } },
    ];
    expect(await lockStation(ACTOR, BUSINESS, "Entrance")).toEqual({
      ok: false,
      failure: "tooManyStations",
    });
  });

  it("takes the business's next hash while one is pairing, and never more than its few", async () => {
    const taken = {
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "station_pairings_pkey"',
      },
    };
    db.answers.start_station_pairing = [taken];
    db.answers.approve_station_pairing = [{ data: STATION, error: null }];
    const second = await lockStation(ACTOR, BUSINESS, "Kitchen");
    expect(second.ok).toBe(true);
    expect(started().map((call) => call.args.pairing_hash)).toEqual([
      lockPairingHash(BUSINESS, 0),
      lockPairingHash(BUSINESS, 1),
    ]);
    expect(approved()[0]?.args.pairing_hash).toBe(lockPairingHash(BUSINESS, 1));

    db.calls = [];
    db.answers.start_station_pairing = Array.from(
      { length: LOCK_PAIRING_SLOTS + 1 },
      () => taken,
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lockStation(ACTOR, BUSINESS, "Office")).toEqual({
      ok: false,
      failure: "failed",
    });
    error.mockRestore();
    expect(started()).toHaveLength(LOCK_PAIRING_SLOTS);
    expect(approved()).toEqual([]);
  });
});
