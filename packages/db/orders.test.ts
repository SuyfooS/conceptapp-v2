import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The mode's two reads of P4 with the person's own session stood in for:
// where they stand in the mode, "notYet" before its migration and null when
// it isn't theirs; and the people its screens name, by the business's names
// for them, short.

const served = vi.hoisted(() => ({
  rpc: { data: null as unknown, error: null as { code: string } | null },
  memberships: [] as {
    user_id: string;
    profiles: { full_name: string } | null;
  }[],
  names: [] as { user_id: string; name: string }[],
}));
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => served.rpc,
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        // biome-ignore lint/suspicious/noThenProperty: PostgREST's builders are awaited
        then: (resolve: (value: unknown) => void) =>
          resolve({
            data: table === "member_names" ? served.names : served.memberships,
            error: null,
          }),
      };
      return query;
    },
  }),
}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { getOrderMode, getOrderPeople } = await import("./orders");

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const KITCHEN = "20000000-0000-4000-a000-000000000001";
const DANA = "00000000-0000-4000-a000-0000000000a1";
const DANI = "00000000-0000-4000-a000-0000000000a2";
const YOAV = "00000000-0000-4000-A000-0000000000A3";

afterEach(() => {
  served.rpc = { data: null, error: null };
  served.memberships = [];
  served.names = [];
});

describe("where the person stands in the mode", () => {
  it("is read, the clock's refusal in the app's words", async () => {
    served.rpc = {
      data: {
        version: 1,
        takes: true,
        runs: false,
        viewing: false,
        clock: "stale_shift",
        departments: [KITCHEN],
        ready: 0,
        making: 1,
        waiting: [],
        soldOut: 0,
      },
      error: null,
    };
    expect(await getOrderMode(BUSINESS)).toMatchObject({
      takes: true,
      clock: "staleShift",
      departments: [KITCHEN],
    });
  });

  it("is none when it isn't theirs, and not yet before its migration", async () => {
    expect(await getOrderMode(BUSINESS)).toBeNull();
    served.rpc = { data: null, error: { code: "PGRST202" } };
    expect(await getOrderMode(BUSINESS)).toBe("notYet");
    served.rpc = { data: null, error: { code: "XX000" } };
    await expect(getOrderMode(BUSINESS)).rejects.toMatchObject({
      code: "XX000",
    });
  });
});

describe("the people the orders' screens name", () => {
  it("are named as the business calls them, first names unless two share one", async () => {
    served.memberships = [
      { user_id: DANA, profiles: { full_name: "דנה לוי" } },
      { user_id: DANI, profiles: { full_name: "דנה כהן" } },
      { user_id: YOAV, profiles: { full_name: "Yoav Ben" } },
    ];
    served.names = [{ user_id: YOAV, name: "יואב מזרחי" }];
    const names = await getOrderPeople(BUSINESS);
    expect(names.get(DANA)).toBe("דנה לוי");
    expect(names.get(DANI)).toBe("דנה כהן");
    expect(names.get(YOAV.toLowerCase())).toBe("יואב");
  });
});
