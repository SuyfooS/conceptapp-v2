import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The database as the secret key and a session reach it: what each table
 * read and each function answers, every call kept, in order.
 */
const db = vi.hoisted(() => ({
  tables: {} as Record<
    string,
    {
      data?: unknown;
      count?: number;
      error: { code?: string; message: string } | null;
    }
  >,
  answers: {} as Record<
    string,
    {
      data?: unknown;
      error: { code?: string; message: string; hint?: string } | null;
    }[]
  >,
  calls: [] as { name: string; args: Record<string, unknown> }[],
}));

/** A table's read, awaited at any point of its chain: a promise of its rows. */
type Query = Promise<unknown> & {
  select: () => Query;
  eq: () => Query;
  in: () => Query;
  is: () => Query;
  order: () => Query;
  maybeSingle: () => Promise<unknown>;
};

function query(table: string): Query {
  const result = () => db.tables[table] ?? { data: [], count: 0, error: null };
  return Object.assign(Promise.resolve().then(result), {
    select: () => query(table),
    eq: () => query(table),
    in: () => query(table),
    is: () => query(table),
    order: () => query(table),
    maybeSingle: async () => result(),
  });
}

function client() {
  return {
    from: query,
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args });
      return db.answers[name]?.shift() ?? { data: null, error: null };
    },
  };
}
vi.mock("./supabase/admin", () => ({ createAdminClient: client }));
vi.mock("./supabase/server", () => ({ createClient: async () => client() }));

const {
  getRunningOrderStations,
  getStationPeople,
  lockOrderStation,
  stationCloseOrder,
  stationOrderMenu,
  stationOrderPrep,
  stationOrderTill,
  stationSetTicketReady,
} = await import("./order-stations");
const { hashStationToken, lockPairingHash } = await import("./clock-stations");

const ACTOR = "ea000000-0000-4000-a000-000000000001";
const BUSINESS = "ea000000-0000-4000-b000-000000000001";
const DEPARTMENT = "ea000000-0000-4000-9000-000000000001";
const STATION = "ea000000-0000-4000-8000-000000000001";
const TOKEN = "Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3-_9xYz0Ab3";
const AT = "2026-12-01T18:00:00.000Z";

const prep = {
  version: 4,
  now: AT,
  lateAfterMinutes: 15,
  department: DEPARTMENT,
  departmentGone: false,
  departments: [{ id: DEPARTMENT, name: "Kitchen", archived: false }],
  tickets: [],
};

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_order_stations_test");
  db.tables = {};
  db.answers = {};
  db.calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("locking a device as the kitchen's screen or the till", () => {
  it("pairs on the business's own hash and locks at once, with its kind and department", async () => {
    db.tables.clock_stations = { count: 3, error: null };
    db.answers.lock_order_station = [{ data: STATION, error: null }];
    const result = await lockOrderStation(ACTOR, BUSINESS, {
      name: "Kitchen",
      shows: "prep",
      department: DEPARTMENT,
    });
    expect(result).toEqual({
      ok: true,
      value: { token: expect.any(String), stationId: STATION },
    });
    expect(db.calls.map((call) => call.name)).toEqual([
      "start_station_pairing",
      "lock_order_station",
    ]);
    expect(db.calls[1]?.args).toEqual({
      actor: ACTOR,
      business: BUSINESS,
      station_name: "Kitchen",
      station_shows: "prep",
      station_department: DEPARTMENT,
      pairing: lockPairingHash(BUSINESS, 0),
    });
  });

  it("sends no department for every one, nor for the till", async () => {
    db.answers.lock_order_station = [{ data: STATION, error: null }];
    await lockOrderStation(ACTOR, BUSINESS, {
      name: "Till",
      shows: "till",
      department: null,
    });
    expect(db.calls[1]?.args).not.toHaveProperty("station_department");
  });

  it("refuses ten running of every kind before any pairing starts", async () => {
    db.tables.clock_stations = { count: 10, error: null };
    expect(
      await lockOrderStation(ACTOR, BUSINESS, {
        name: "Kitchen",
        shows: "prep",
        department: null,
      }),
    ).toEqual({ ok: false, failure: "tooManyStations" });
    expect(db.calls).toEqual([]);
  });

  it("says what the database refused", async () => {
    for (const [error, failure] of [
      [{ code: "42501", message: "Taking orders is off", hint: "off" }, "off"],
      [{ code: "42501", message: "Those who run orders only" }, "noAccess"],
      [
        { code: "22023", message: "Not a live department", hint: "route" },
        "department",
      ],
      [{ code: "54000", message: "At most ten stations" }, "tooManyStations"],
    ] as const) {
      db.calls = [];
      db.answers.lock_order_station = [{ error }];
      expect(
        await lockOrderStation(ACTOR, BUSINESS, {
          name: "Kitchen",
          shows: "prep",
          department: DEPARTMENT,
        }),
        error.message,
      ).toEqual({ ok: false, failure });
    }
  });
});

describe("a station's reads", () => {
  it("read by the secret's hash, and parsed", async () => {
    db.answers.station_order_prep = [{ data: prep, error: null }];
    expect(await stationOrderPrep(TOKEN, 3)).toEqual({ ok: true, value: prep });
    expect(db.calls[0]?.args).toEqual({
      station_hash: hashStationToken(TOKEN),
      known_version: 3,
    });
    db.answers.station_order_prep = [{ data: null, error: null }];
    expect(await stationOrderPrep(TOKEN, 4)).toEqual({
      ok: true,
      value: "same",
    });
    db.answers.station_order_menu = [
      { data: { version: 1, items: [] }, error: null },
    ];
    expect(await stationOrderMenu(TOKEN, null)).toEqual({
      ok: true,
      value: { version: 1, items: [] },
    });
    expect(db.calls.at(-1)?.args).toEqual({
      station_hash: hashStationToken(TOKEN),
    });
  });

  it("refuse an answer that carries a price or a person, as failed", async () => {
    db.answers.station_order_till = [
      {
        data: {
          version: 1,
          now: AT,
          day: "2026-12-01",
          departments: [],
          orders: [],
          closed: [],
          total: 6400,
        },
        error: null,
      },
    ];
    expect(await stationOrderTill(TOKEN)).toEqual({
      ok: false,
      failure: "failed",
    });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(hashStationToken(TOKEN));
  });

  it("say the station's own refusals", async () => {
    for (const [error, failure] of [
      [{ code: "42501", message: "Not a station" }, "notStation"],
      [
        { code: "42501", message: "This station was stopped", hint: "stopped" },
        "stopped",
      ],
      [
        {
          code: "42501",
          message: "This station shows something else",
          hint: "shows",
        },
        "notOrders",
      ],
      [{ code: "42501", message: "Taking orders is off", hint: "off" }, "off"],
      [{ code: "XX000", message: "boom" }, "failed"],
    ] as const) {
      db.answers.station_order_prep = [{ error }];
      expect(await stationOrderPrep(TOKEN), error.message).toEqual({
        ok: false,
        failure,
      });
    }
  });
});

describe("a station's writes", () => {
  it("go by the secret's hash, refused in the orders' words", async () => {
    expect(await stationSetTicketReady(TOKEN, STATION, true)).toEqual({
      ok: true,
    });
    expect(db.calls[0]).toEqual({
      name: "station_set_ticket_ready",
      args: {
        station_hash: hashStationToken(TOKEN),
        ticket: STATION,
        ready: true,
      },
    });
    db.answers.station_close_order = [
      {
        error: {
          code: "55000",
          message: "A held block waits to be called",
          hint: "held",
        },
      },
    ];
    expect(await stationCloseOrder(TOKEN, STATION)).toEqual({
      ok: false,
      failure: "held",
    });
  });
});

describe("the names a kitchen's screen shows", () => {
  it("are the business's, short over the whole team, only for those asked", async () => {
    const noa = "ea000000-0000-4000-a000-000000000002";
    const noaToo = "ea000000-0000-4000-a000-000000000003";
    const yoav = "ea000000-0000-4000-a000-000000000004";
    db.tables.memberships = {
      data: [
        { user_id: noa, profiles: { full_name: "Noa Levi" } },
        { user_id: noaToo, profiles: { full_name: "Noa Cohen" } },
        { user_id: yoav, profiles: { full_name: "Yoav Bar" } },
      ],
      error: null,
    };
    db.tables.member_names = { data: [], error: null };
    expect(await getStationPeople(BUSINESS, [noa, yoav.toUpperCase()])).toEqual(
      { [noa]: "Noa Levi", [yoav]: "Yoav" },
    );
    expect(await getStationPeople(BUSINESS, [])).toEqual({});
  });
});

describe("the screens running", () => {
  it("are none before the migration reaches the project", async () => {
    db.tables.clock_stations = {
      data: null,
      error: { code: "42703", message: "column shows does not exist" },
    };
    expect(await getRunningOrderStations(BUSINESS)).toEqual([]);
  });

  it("are the kitchen's screens and the tills, by what each last did", async () => {
    db.tables.clock_stations = {
      data: [
        {
          id: STATION,
          name: "Kitchen",
          shows: "prep",
          department_id: DEPARTMENT,
          created_at: AT,
          last_seen_at: AT,
          last_action: "ready",
          last_action_at: AT,
        },
      ],
      error: null,
    };
    expect(await getRunningOrderStations(BUSINESS)).toEqual([
      {
        id: STATION,
        name: "Kitchen",
        shows: "prep",
        departmentId: DEPARTMENT,
        createdAt: AT,
        lastSeenAt: AT,
        lastAction: "ready",
        lastActionAt: AT,
      },
    ]);
  });
});
