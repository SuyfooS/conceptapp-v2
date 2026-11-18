import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** The business's requests as PostgREST serves them, and what was asked. */
const served = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  /** Each call on the query, as [method, ...arguments]. */
  calls: [] as unknown[][],
}));
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      served.calls.push(["from", table]);
      const step =
        (method: string) =>
        (...args: unknown[]) => {
          served.calls.push([method, ...args]);
          return query;
        };
      const query = {
        select: step("select"),
        eq: step("eq"),
        in: step("in"),
        gte: step("gte"),
        order: step("order"),
        limit: async (count: number) => {
          served.calls.push(["limit", count]);
          return { data: served.rows, error: null };
        },
      };
      return query;
    },
  }),
}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { getEndedSwaps } = await import("./swaps");

afterEach(() => {
  served.rows = [];
  served.calls = [];
});

const row = (fields: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-a000-0000000000c1",
  shift_id: "00000000-0000-4000-a000-0000000000d1",
  shift: { day: "2026-11-08", name: "Evening", start: "16:00", end: "23:30" },
  requested_by: "00000000-0000-4000-a000-000000000003",
  taken_by: "00000000-0000-4000-a000-000000000004",
  status: "declined",
  cancelled_because: null,
  decided_by: "00000000-0000-4000-a000-000000000002",
  created_at: "2026-11-05T10:00:00+00:00",
  ...fields,
});

// What "מה קרה לבקשות שלך" and the board's "כבר לא מחכות להחלטה" read: the
// requests that no longer wait, by the shift each asked for.
describe("getEndedSwaps", () => {
  it("reads the business's closed requests on shifts from the day on, newest first", async () => {
    served.rows = [row()];
    const swaps = await getEndedSwaps("biz", "2026-11-08");
    expect(swaps.map((s) => [s.id, s.outcome])).toEqual([
      ["00000000-0000-4000-a000-0000000000c1", "declined"],
    ]);
    expect(served.calls).toContainEqual(["eq", "business_id", "biz"]);
    expect(served.calls).toContainEqual([
      "in",
      "status",
      ["approved", "declined", "cancelled"],
    ]);
    expect(served.calls).toContainEqual(["gte", "shift->>day", "2026-11-08"]);
    expect(served.calls).toContainEqual([
      "order",
      "created_at",
      { ascending: false },
    ]);
    expect(served.calls).toContainEqual(["limit", 200]);
  });

  it("leaves out a row that doesn't read as a request that ended", async () => {
    served.rows = [
      row({ id: "00000000-0000-4000-a000-0000000000c2", shift: null }),
      row({
        id: "00000000-0000-4000-a000-0000000000c3",
        status: "cancelled",
        cancelled_because: "schedule",
        decided_by: null,
        shift_id: null,
      }),
    ];
    const swaps = await getEndedSwaps("biz", "2026-11-08");
    expect(swaps.map((s) => [s.id, s.outcome, s.shiftId])).toEqual([
      ["00000000-0000-4000-a000-0000000000c3", "schedule", null],
    ]);
  });
});
