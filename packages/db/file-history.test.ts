import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * "מה קרה בתיק" as the server reads it (profile H6b-1), with the database
 * stood in for: each query's table, columns and filters kept as asked, and
 * answered as the test says. It holds the rules: only the five columns,
 * filtered on the person and the action alone; the daily read of a file
 * left out by its exact fields; the two reads merged newest first, capped,
 * saying whether there is more; and the actors named as the business names
 * them, someone who left as such.
 */

type Step = [string, ...unknown[]];
type Query = { table: string; steps: Step[] };

const db = vi.hoisted(() => ({
  queries: [] as Query[],
  answer: (_query: Query): { data: unknown; error: unknown } => ({
    data: [],
    error: null,
  }),
}));

function builder(table: string) {
  const query: Query = { table, steps: [] };
  db.queries.push(query);
  const chain: Record<string, unknown> = {};
  for (const step of [
    "select",
    "eq",
    "neq",
    "in",
    "filter",
    "order",
    "limit",
  ]) {
    chain[step] = (...args: unknown[]) => {
      query.steps.push([step, ...args]);
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: a query is awaited as PostgREST's is
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject: (error: unknown) => unknown,
  ) => Promise.resolve(db.answer(query)).then(resolve, reject);
  return chain;
}

vi.mock("./supabase/server", () => ({
  createClient: async () => ({ from: builder }),
}));

const { getFileHistory } = await import("./file-history");
const { FILE_HISTORY_SIZE } = await import("@domain/file-holders");

const SHOP = "11111111-1111-4111-a111-111111111111";
const NOA = "44444444-4444-4444-a444-444444444444";
const GALIT = "55555555-5555-4555-a555-555555555555";
const GONE = "66666666-6666-4666-a666-666666666666";

const row = (id: number, action: string, actor: string | null = NOA) => ({
  id,
  action,
  details: { person: NOA },
  created_at: `2026-11-22T08:${String(id % 60).padStart(2, "0")}:00+00:00`,
  actor_id: actor,
});

/** The steps a query of `table` took, by the action it filtered on. */
const logQueries = () => db.queries.filter((q) => q.table === "audit_log");

beforeEach(() => {
  db.queries = [];
  db.answer = () => ({ data: [], error: null });
});

describe("what happened in a file", () => {
  it("reads five columns, about the person, by the action only", async () => {
    await getFileHistory(SHOP, NOA);
    const [changes, reveals] = logQueries();
    const base: Step[] = [
      ["select", "id, action, details, created_at, actor_id"],
      ["eq", "business_id", SHOP],
      ["eq", "details->>person", NOA],
    ];
    expect(changes?.steps).toEqual([
      ...base,
      [
        "filter",
        "action",
        "in",
        '("employee.details","employee.submit","employee.tax_year","employee.bank_ack","employee.bank_disputed","employee.direct")',
      ],
      ["order", "id", { ascending: false }],
      ["limit", FILE_HISTORY_SIZE + 1],
    ]);
    // A reveal, never the daily read of the file: both writers log that one
    // as exactly ["file"].
    expect(reveals?.steps).toEqual([
      ...base,
      ["eq", "action", "employee.view"],
      ["neq", "details->>fields", '["file"]'],
      ["order", "id", { ascending: false }],
      ["limit", FILE_HISTORY_SIZE + 1],
    ]);
  });

  // The review: the log holds the id as Postgres prints a uuid, in lower
  // case, and `details->>person` compares text.
  it("asks for the person in lower case, however the id came", async () => {
    await getFileHistory(SHOP, NOA.toUpperCase());
    for (const query of logQueries()) {
      expect(query.steps).toContainEqual(["eq", "details->>person", NOA]);
    }
    expect(logQueries()).toHaveLength(2);
  });

  it("asks nobody's name with nothing to show", async () => {
    const page = await getFileHistory(SHOP, NOA);
    expect(page).toMatchObject({ rows: [], more: false });
    expect(db.queries.map((q) => q.table)).toEqual(["audit_log", "audit_log"]);
  });

  it("merges the two newest first, keeps the newest, and says there is more", async () => {
    db.answer = (query) => {
      if (query.table !== "audit_log") return { data: [], error: null };
      const reveal = query.steps.some(
        ([step, , value]) => step === "eq" && value === "employee.view",
      );
      const ids = Array.from({ length: FILE_HISTORY_SIZE + 1 }, (_, at) =>
        reveal ? 200 - at * 2 : 199 - at * 2,
      );
      return {
        data: ids.map((id) =>
          row(id, reveal ? "employee.view" : "employee.details"),
        ),
        error: null,
      };
    };
    const page = await getFileHistory(SHOP, NOA);
    expect(page.rows).toHaveLength(FILE_HISTORY_SIZE);
    expect(page.rows.slice(0, 3).map((r) => r.id)).toEqual([200, 199, 198]);
    expect(page.more).toBe(true);
    expect(page.rows[0]).toEqual({
      id: 200,
      action: "employee.view",
      details: { person: NOA },
      createdAt: "2026-11-22T08:20:00+00:00",
      actorId: NOA,
    });
  });

  it("names the actors as the business does, someone who left as such", async () => {
    db.answer = (query) => {
      switch (query.table) {
        case "audit_log":
          return query.steps.some(([step]) => step === "filter")
            ? {
                data: [
                  row(3, "employee.bank_ack", GALIT),
                  row(2, "employee.details", GONE),
                ],
                error: null,
              }
            : { data: [row(1, "employee.view", null)], error: null };
        case "memberships":
          return {
            data: [
              {
                user_id: GALIT,
                active: true,
                profiles: { full_name: "Galit" },
              },
              { user_id: GONE, active: false, profiles: { full_name: "X" } },
            ],
            error: null,
          };
        case "member_names":
          return { data: [{ user_id: GALIT, name: "גלית" }], error: null };
        default:
          return { data: [], error: null };
      }
    };
    const page = await getFileHistory(SHOP, NOA);
    expect(page.rows.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(page.more).toBe(false);
    expect(page.lookups.members.get(GALIT)).toEqual({
      active: true,
      name: "גלית",
    });
    expect(page.lookups.members.get(GONE)?.active).toBe(false);
    const members = db.queries.find((q) => q.table === "memberships");
    expect(members?.steps).toContainEqual(["in", "user_id", [GALIT, GONE]]);
  });

  it("throws what the database refused, for the screen to say", async () => {
    db.answer = () => ({ data: null, error: { code: "42501" } });
    await expect(getFileHistory(SHOP, NOA)).rejects.toEqual({ code: "42501" });
  });
});
