import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";

vi.mock("server-only", () => ({}));

/**
 * The names a business keeps for its people (`public.member_names`,
 * 20261117000700_member_names.sql) with the database stood in for: what a
 * read of the table gets, and how it was narrowed; and fixing one
 * (`public.set_member_name`), each call kept and answered as the test says,
 * its refusals read as the screens explain them.
 */
type Failure = { code?: string; hint?: string | null; message: string };

const db = vi.hoisted(() => ({
  rows: [] as unknown,
  error: null as Failure | null,
  /** Each read of the table: what it was narrowed by, in order. */
  reads: [] as [string, unknown][][],
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as Failure | null },
}));

/** `public.member_names` as a client reads it. */
function namesQuery() {
  const read: [string, unknown][] = [];
  const answer = () => {
    db.reads.push(read);
    return db.error
      ? { data: null, error: db.error }
      : { data: db.rows, error: null };
  };
  const query = {
    select: (columns: string) => {
      read.push(["select", columns]);
      return query;
    },
    eq: (column: string, value: unknown) => {
      read.push([column, value]);
      return query;
    },
    in: (column: string, values: unknown) => {
      read.push([`${column} in`, values]);
      return query;
    },
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return query;
}

const client = {
  from: (table: string) => {
    if (table !== "member_names") throw new Error(`unexpected ${table}`);
    return namesQuery();
  },
} as unknown as SupabaseClient<Database>;

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.answer;
    },
  }),
}));
vi.mock("./supabase/server", () => ({ createClient: async () => ({}) }));

const { memberNames, nameIn } = await import("./member-names");
const { setMemberName } = await import("./team");

const ACTOR = "9a000000-0000-4000-a000-000000000001";
const NOA = "9a000000-0000-4000-a000-000000000004";
const YOAV = "9a000000-0000-4000-a000-000000000005";
const BUSINESS = "9a000000-0000-4000-b000-000000000001";

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.reads = [];
  db.calls = [];
  db.answer = { data: { changed: true, name: "נועה לוי" }, error: null };
});

describe("memberNames", () => {
  it("reads the business's names by person", async () => {
    db.rows = [{ user_id: NOA.toUpperCase(), name: "נועה לוי" }];
    const names = await memberNames(client, BUSINESS);
    expect([...names]).toEqual([[NOA, "נועה לוי"]]);
    expect(db.reads).toEqual([
      [
        ["select", "user_id, name"],
        ["business_id", BUSINESS],
      ],
    ]);
    // Over their own, and theirs when it keeps none.
    expect(nameIn(names, NOA.toUpperCase(), "נועה כהן")).toBe("נועה לוי");
    expect(nameIn(names, YOAV, " יואב ")).toBe("יואב");
    expect(nameIn(names, YOAV, null)).toBe(null);
  });

  it("reads only the people asked for, and nothing for none", async () => {
    await memberNames(client, BUSINESS, [NOA, YOAV]);
    expect(db.reads).toEqual([
      [
        ["select", "user_id, name"],
        ["business_id", BUSINESS],
        ["user_id in", [NOA, YOAV]],
      ],
    ]);
    expect([...(await memberNames(client, BUSINESS, []))]).toEqual([]);
    expect(db.reads).toHaveLength(1);
  });

  it("is empty before its migration reaches the project", async () => {
    for (const code of ["PGRST205", "42P01"]) {
      db.error = { code, message: "no such table" };
      expect([...(await memberNames(client, BUSINESS))]).toEqual([]);
    }
  });

  it("throws any other error, and rows it can't read", async () => {
    db.error = { code: "42501", message: "denied" };
    await expect(memberNames(client, BUSINESS)).rejects.toMatchObject({
      code: "42501",
    });
    db.error = null;
    db.rows = [{ user_id: NOA, name: 5 }];
    await expect(memberNames(client, BUSINESS)).rejects.toThrow();
  });
});

describe("setMemberName", () => {
  it("sends the name and the one seen, and reads back the name shown", async () => {
    await expect(
      setMemberName(ACTOR, BUSINESS, NOA, "נועה לוי", "נועה כהן"),
    ).resolves.toEqual({ ok: true, changed: true, name: "נועה לוי" });
    expect(db.calls).toEqual([
      {
        fn: "set_member_name",
        args: {
          actor: ACTOR,
          business: BUSINESS,
          person: NOA,
          new_name: "נועה לוי",
          seen_name: "נועה כהן",
        },
      },
    ]);
  });

  it("sends none for none: their own name again, or none seen", async () => {
    db.answer = { data: { changed: false, name: null }, error: null };
    await expect(
      setMemberName(ACTOR, BUSINESS, NOA, null, null),
    ).resolves.toEqual({ ok: true, changed: false, name: null });
    expect(db.calls[0]?.args).toEqual({
      actor: ACTOR,
      business: BUSINESS,
      person: NOA,
    });
  });

  it("reads each refusal as the screens explain it", async () => {
    const cases: [Failure, string][] = [
      [{ code: "42501", message: "no" }, "notAllowed"],
      [{ code: "42501", hint: null, message: "no" }, "notAllowed"],
      [{ code: "22023", hint: "name", message: "no" }, "badName"],
      [{ code: "22023", message: "no" }, "yourself"],
      [{ code: "P0002", message: "no" }, "gone"],
      [{ code: "55000", hint: "demo", message: "no" }, "demo"],
      [{ code: "40001", message: "no" }, "changed"],
      [{ code: "PGRST202", message: "no" }, "notYet"],
    ];
    for (const [error, failure] of cases) {
      db.answer = { data: null, error };
      await expect(
        setMemberName(ACTOR, BUSINESS, NOA, "נועה לוי", null),
      ).resolves.toEqual({ ok: false, error: failure });
    }
  });

  it("throws anything else, and an answer it can't read", async () => {
    db.answer = { data: null, error: { code: "XX000", message: "broken" } };
    await expect(
      setMemberName(ACTOR, BUSINESS, NOA, "נועה לוי", null),
    ).rejects.toThrow("broken");
    db.answer = { data: { changed: "yes" }, error: null };
    await expect(
      setMemberName(ACTOR, BUSINESS, NOA, "נועה לוי", null),
    ).rejects.toThrow();
  });
});
