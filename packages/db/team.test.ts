import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The Team screen's read of the invites nobody claimed (`getTeam`) against a
 * stand-in for the database: a read of `invites` gets the columns it names
 * of the rows seeded, or Postgres's 42703 for one the database doesn't have
 * yet, as before 20261128000200_invite_links_pending.sql (`link_pending`) or
 * 20261115001600_named_roles_give.sql (`named_role`) reaches a project. The
 * hosted demo deploys the code before Migrate runs, so the screen reads that
 * older database for a while: there every invite reads as having its link,
 * and the role the business named that it gives is kept. Any other error is
 * thrown. The other reads of the screen answer with their rows (none of
 * members, numbers or names here).
 */

type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  /** The invites' columns this database doesn't have yet. */
  missing: [] as string[],
  /** What a read of the invites that names `link_pending` gets instead. */
  failure: null as Failure | null,
  /** Each read of the invites: the columns it named, in order. */
  inviteReads: [] as string[][],
}));

/** A read of `table` (or a function's rows), as PostgREST answers it. */
function read(table: string) {
  let columns: string[] = [];
  const answer = (): { data: Row[] | null; error: Failure | null } => {
    if (table !== "invites") return { data: db.rows[table] ?? [], error: null };
    db.inviteReads.push(columns);
    if (db.failure && columns.includes("link_pending")) {
      return { data: null, error: db.failure };
    }
    const gone = columns.find((column) => db.missing.includes(column));
    if (gone) {
      return {
        data: null,
        error: {
          code: "42703",
          message: `column invites.${gone} does not exist`,
        },
      };
    }
    return {
      data: (db.rows.invites ?? []).map((row) =>
        Object.fromEntries(
          columns.filter((c) => c in row).map((c) => [c, row[c]]),
        ),
      ),
      error: null,
    };
  };
  const builder = {
    select: (list: string) => {
      columns = list.split(",").map((column) => column.trim());
      return builder;
    },
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    order: () => builder,
    range: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return builder;
}

const client = { from: read, rpc: (fn: string) => read(fn) };
vi.mock("./supabase/server", () => ({ createClient: async () => client }));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => client }));

const { getTeam } = await import("./team");

const BUSINESS = "c5000000-0000-4000-b000-000000000001";
const LEAD = "c5000000-0000-4000-8000-0000000000d1";
const SHAI = "c5000000-0000-4000-8000-000000000001";
const DANA = "c5000000-0000-4000-8000-000000000002";
const TAL = "c5000000-0000-4000-8000-000000000003";
const EXPIRES = "2026-12-10T08:00:00+00:00";

const COLUMNS = [
  "id",
  "full_name",
  "phone",
  "role",
  "named_role",
  "expires_at",
];

const lead = {
  id: LEAD,
  base: "worker",
  name: "Shift lead",
  nameEn: null,
  archived: false,
};

beforeEach(() => {
  db.rows = {
    // Shai waits for his link, Dana got hers, Tal's row has no key at all.
    invites: [
      {
        id: SHAI,
        full_name: "Shai",
        phone: "+972500007612",
        role: "worker",
        named_role: null,
        expires_at: EXPIRES,
        link_pending: true,
      },
      {
        id: DANA,
        full_name: "Dana",
        phone: "+972500007613",
        role: "worker",
        named_role: LEAD,
        expires_at: EXPIRES,
        link_pending: false,
      },
      {
        id: TAL,
        full_name: "Tal",
        phone: "+972500007614",
        role: "manager",
        named_role: null,
        expires_at: EXPIRES,
      },
    ],
    business_roles: [
      {
        id: LEAD,
        base: "worker",
        name: "Shift lead",
        name_en: null,
        archived_at: null,
      },
    ],
  };
  db.missing = [];
  db.failure = null;
  db.inviteReads = [];
});

const pendingOf = async () =>
  (await getTeam(BUSINESS)).invites.map((i) => [i.name, i.linkPending]);

describe("getTeam's invites", () => {
  it("say whether each got a link, in one read; a row without the key as having one", async () => {
    const { invites } = await getTeam(BUSINESS);
    expect(invites.map((i) => [i.name, i.linkPending])).toEqual([
      ["Shai", true],
      ["Dana", false],
      ["Tal", false],
    ]);
    expect(invites[1]?.namedRole).toEqual(lead);
    expect(db.inviteReads).toEqual([[...COLUMNS, "link_pending"]]);
  });

  it("read a database before link_pending as before: each with its link, the named role kept", async () => {
    db.missing = ["link_pending"];
    const { invites } = await getTeam(BUSINESS);
    expect(invites.map((i) => [i.name, i.linkPending])).toEqual([
      ["Shai", false],
      ["Dana", false],
      ["Tal", false],
    ]);
    expect(invites[1]?.namedRole).toEqual(lead);
    // Once with the new column, then the read before it.
    expect(db.inviteReads).toEqual([[...COLUMNS, "link_pending"], COLUMNS]);
  });

  it("read a database before named roles too, as the oldest read", async () => {
    db.missing = ["link_pending", "named_role"];
    const { invites } = await getTeam(BUSINESS);
    expect(invites.map((i) => [i.name, i.linkPending, i.namedRole])).toEqual([
      ["Shai", false, null],
      ["Dana", false, null],
      ["Tal", false, null],
    ]);
    expect(db.inviteReads).toEqual([
      [...COLUMNS, "link_pending"],
      COLUMNS,
      COLUMNS.filter((column) => column !== "named_role"),
    ]);
  });

  it("throw any other error, with no read after it", async () => {
    db.failure = {
      code: "57014",
      message: "canceling statement due to statement timeout",
    };
    await expect(pendingOf()).rejects.toMatchObject({ code: "57014" });
    expect(db.inviteReads).toEqual([[...COLUMNS, "link_pending"]]);
  });
});
