import type { ImportPerson } from "@domain/people-import";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The people import's calls (20261128000300_people_import.sql) against a
 * stand-in for the database as the secret key reaches it: what each sends,
 * how each answer is read, and the refusals as the screens explain them.
 * The rules themselves are pgTAP's (people_import.test.sql) and the parity
 * with the screen's reading people-import.db.test.ts's.
 */

type Row = Record<string, unknown>;
type Failure = {
  code?: string;
  hint?: string | null;
  details?: string | null;
  message: string;
};

const db = vi.hoisted(() => ({
  answer: { data: null as unknown, error: null as Failure | null },
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  rows: {} as Record<string, Row[]>,
  /** Each table read, with the columns it named and how it was narrowed. */
  reads: [] as {
    table: string;
    columns: string;
    filters: Record<string, unknown>;
  }[],
}));

/**
 * A read of `table`, as PostgREST answers it: every row seeded, one page,
 * whatever it was narrowed by; each filter recorded as `column op`.
 */
function read(table: string) {
  const asked = { table, columns: "", filters: {} as Record<string, unknown> };
  const narrow = (op: string) => (column: string, value: unknown) => {
    asked.filters[`${column} ${op}`] = value;
    return builder;
  };
  const builder = {
    select: (columns: string) => {
      asked.columns = columns;
      db.reads.push(asked);
      return builder;
    },
    eq: narrow("="),
    is: narrow("is"),
    in: narrow("in"),
    order: () => builder,
    range: () => builder,
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: { data: Row[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ data: db.rows[table] ?? [], error: null }).then(
        resolve,
        reject,
      ),
  };
  return builder;
}

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return db.answer;
    },
    from: read,
  }),
}));

const {
  consoleKnownTeam,
  importPeopleFromConsole,
  importPeopleToTeam,
  peopleImportError,
  undoConsoleImport,
  undoTeamImport,
} = await import("./people-import");

const ACTOR = "d7000000-0000-4000-a000-000000000001";
const BUSINESS = "d7000000-0000-4000-b000-000000000001";
const IMPORT = "5f0c4a5e-8c1d-4e0b-9a51-2b7f3c9d1e01";
const INVITE_A = "5f0c4a5e-8c1d-4e0b-9a51-2b7f3c9d1e02";
// An id as a seed may write it, which Zod's uuid() refuses (variant c).
const INVITE_B = "d7000000-0000-4000-c000-000000000002";
const LEAD = "5f0c4a5e-8c1d-4e0b-9a51-2b7f3c9d1e03";

const dana: ImportPerson = {
  name: "Dana Cohen",
  phone: "+972500007301",
  role: "worker",
  namedRole: null,
  roleFromLine: false,
};
const yossi: ImportPerson = {
  name: "Yossi Levi",
  phone: "+972500007302",
  role: "worker",
  namedRole: LEAD,
  roleFromLine: true,
};

beforeEach(() => {
  db.answer = { data: null, error: null };
  db.calls = [];
  db.rows = {};
  db.reads = [];
});

describe("peopleImportError", () => {
  it("explains each refusal the screens say", () => {
    expect(peopleImportError("42501", "pay")).toEqual({
      ok: false,
      failure: "givesPay",
    });
    for (const hint of ["held", null, undefined]) {
      expect(peopleImportError("42501", hint)).toEqual({
        ok: false,
        failure: "notAllowed",
      });
    }
    expect(peopleImportError("55000")).toEqual({ ok: false, failure: "demo" });
    expect(peopleImportError("54000", "limit")).toEqual({
      ok: false,
      failure: "tooMany",
    });
    expect(peopleImportError("22023", "archived")).toEqual({
      ok: false,
      failure: "roleGone",
    });
    for (const hint of ["role", "phone", "name", "duplicate", "base", null]) {
      expect(peopleImportError("22023", hint)).toEqual({
        ok: false,
        failure: "changed",
      });
    }
    expect(peopleImportError("P0002")).toEqual({
      ok: false,
      failure: "changed",
    });
  });

  it("reads how many invites wait from the cap's detail", () => {
    expect(peopleImportError("54000", "open", "499")).toEqual({
      ok: false,
      failure: "tooManyOpen",
      open: 499,
    });
    for (const detail of [null, "", "many", "-1", "2.5"]) {
      expect(peopleImportError("54000", "open", detail)).toEqual({
        ok: false,
        failure: "tooManyOpen",
        open: null,
      });
    }
  });

  it("reads the rows on another business's staff from the detail, by their places", () => {
    expect(peopleImportError("23505", "elsewhere", "2,7,12")).toEqual({
      ok: false,
      failure: "elsewhere",
      rows: [2, 7, 12],
    });
    expect(peopleImportError("23505", "elsewhere", "3, x,0,-1, 4")).toEqual({
      ok: false,
      failure: "elsewhere",
      rows: [3, 4],
    });
  });

  it("leaves anything else to the caller to throw", () => {
    expect(peopleImportError("23505")).toBe(null);
    expect(peopleImportError("54000")).toBe(null);
    expect(peopleImportError("22P02")).toBe(null);
    expect(peopleImportError(undefined)).toBe(null);
  });
});

describe("importPeopleToTeam", () => {
  it("sends each person as the database takes them, and reads its answer", async () => {
    db.answer = {
      data: {
        import: IMPORT,
        rows: [
          { i: 1, status: "created", invite: INVITE_A },
          { i: 2, status: "updated", invite: INVITE_B },
        ],
      },
      error: null,
    };
    const result = await importPeopleToTeam(ACTOR, BUSINESS, [dana, yossi]);
    expect(result).toEqual({
      ok: true,
      importId: IMPORT,
      rows: [
        { i: 1, status: "created", invite: INVITE_A },
        { i: 2, status: "updated", invite: INVITE_B },
      ],
    });
    // A named role's key only when there is one; no token, no link.
    expect(db.calls).toEqual([
      {
        fn: "team_import_people",
        args: {
          actor: ACTOR,
          business: BUSINESS,
          people: [
            {
              name: "Dana Cohen",
              phone: "+972500007301",
              role: "worker",
              role_from_line: false,
            },
            {
              name: "Yossi Levi",
              phone: "+972500007302",
              role: "worker",
              named_role: LEAD,
              role_from_line: true,
            },
          ],
        },
      },
    ]);
  });

  it("reads an answer that made nothing, with no import to take back", async () => {
    // A member's number, and one a single invite took at the same moment:
    // `invited`, with no invite id, since the import never read that one's.
    const rows = [
      { i: 1, status: "member", invite: null },
      { i: 2, status: "invited", invite: null },
    ];
    db.answer = { data: { import: null, rows }, error: null };
    expect(await importPeopleToTeam(ACTOR, BUSINESS, [dana, yossi])).toEqual({
      ok: true,
      importId: null,
      rows,
    });
  });

  it("never sends rows a screen couldn't have sent", async () => {
    for (const people of [
      [],
      [{ ...dana, name: " Dana" }],
      [{ ...dana, phone: "+97231234567" }],
      [{ ...dana, role: "owner" }],
      [dana, { ...yossi, phone: dana.phone }],
      // `againstTeam`'s `send` as it is: each row still has its `line`.
      [{ ...dana, line: 1 }],
      Array.from({ length: 301 }, (_, n) => ({
        ...dana,
        phone: `+9725000${String(n).padStart(5, "0")}`,
      })),
    ]) {
      expect(
        await importPeopleToTeam(ACTOR, BUSINESS, people as ImportPerson[]),
      ).toEqual({ ok: false, failure: "changed" });
    }
    expect(db.calls).toEqual([]);
  });

  it("says each refusal, which writes nothing", async () => {
    db.answer = {
      data: null,
      error: {
        code: "54000",
        hint: "open",
        details: "499",
        message: "Too many invites waiting",
      },
    };
    expect(await importPeopleToTeam(ACTOR, BUSINESS, [dana])).toEqual({
      ok: false,
      failure: "tooManyOpen",
      open: 499,
    });
    db.answer = {
      data: null,
      error: { code: "42501", hint: "pay", message: "Only an owner…" },
    };
    expect(await importPeopleToTeam(ACTOR, BUSINESS, [dana])).toEqual({
      ok: false,
      failure: "givesPay",
    });
  });

  it("answers failed before the migration reaches a project", async () => {
    for (const code of ["PGRST202", "42883"]) {
      db.answer = { data: null, error: { code, message: "no function" } };
      expect(await importPeopleToTeam(ACTOR, BUSINESS, [dana])).toEqual({
        ok: false,
        failure: "failed",
      });
    }
  });

  it("throws anything else, with the database's message alone", async () => {
    db.answer = {
      data: null,
      error: { code: "XX000", message: "something broke" },
    };
    await expect(importPeopleToTeam(ACTOR, BUSINESS, [dana])).rejects.toThrow(
      "Could not import: something broke",
    );
  });

  it("throws an answer that isn't one row each, in order", async () => {
    for (const rows of [
      [{ i: 1, status: "created", invite: INVITE_A }],
      [
        { i: 2, status: "created", invite: INVITE_A },
        { i: 1, status: "created", invite: INVITE_B },
      ],
    ]) {
      db.answer = { data: { import: IMPORT, rows }, error: null };
      await expect(
        importPeopleToTeam(ACTOR, BUSINESS, [dana, yossi]),
      ).rejects.toThrow("Could not import");
    }
    db.answer = {
      data: {
        import: IMPORT,
        rows: [{ i: 1, status: "pending", invite: null }],
      },
      error: null,
    };
    await expect(importPeopleToTeam(ACTOR, BUSINESS, [dana])).rejects.toThrow();
  });
});

describe("importPeopleFromConsole", () => {
  it("calls the console's import, and says which rows are on another staff", async () => {
    db.answer = {
      data: null,
      error: {
        code: "23505",
        hint: "elsewhere",
        details: "2",
        message: "On another business's staff",
      },
    };
    expect(
      await importPeopleFromConsole(ACTOR, BUSINESS, [dana, yossi]),
    ).toEqual({ ok: false, failure: "elsewhere", rows: [2] });
    expect(db.calls.map((call) => call.fn)).toEqual(["admin_import_people"]);
  });
});

describe("taking an import back", () => {
  it("calls each door's undo with the import's id, and reads what it did", async () => {
    db.answer = { data: { cancelled: 11, kept: 1, joined: 2 }, error: null };
    // Linked and joined apart: the screen tells the manager to delete only
    // the first on /team.
    expect(await undoTeamImport(ACTOR, BUSINESS, IMPORT)).toEqual({
      ok: true,
      cancelled: 11,
      kept: 1,
      joined: 2,
    });
    expect(await undoConsoleImport(ACTOR, BUSINESS, IMPORT)).toEqual({
      ok: true,
      cancelled: 11,
      kept: 1,
      joined: 2,
    });
    expect(db.calls).toEqual([
      {
        fn: "team_import_undo",
        args: { actor: ACTOR, business: BUSINESS, batch: IMPORT },
      },
      {
        fn: "admin_import_undo",
        args: { actor: ACTOR, business: BUSINESS, batch: IMPORT },
      },
    ]);
  });

  it("asks nothing for an id that is no id", async () => {
    expect(await undoTeamImport(ACTOR, BUSINESS, "import; drop")).toEqual({
      ok: false,
      failure: "changed",
    });
    expect(db.calls).toEqual([]);
  });

  it("says a refusal, and failed before the migration", async () => {
    db.answer = { data: null, error: { code: "42501", message: "no" } };
    expect(await undoTeamImport(ACTOR, BUSINESS, IMPORT)).toEqual({
      ok: false,
      failure: "notAllowed",
    });
    db.answer = { data: null, error: { code: "PGRST202", message: "none" } };
    expect(await undoTeamImport(ACTOR, BUSINESS, IMPORT)).toEqual({
      ok: false,
      failure: "failed",
    });
    db.answer = { data: null, error: { code: "XX000", message: "broke" } };
    await expect(undoTeamImport(ACTOR, BUSINESS, IMPORT)).rejects.toThrow(
      "Could not take the import back: broke",
    );
  });
});

describe("consoleKnownTeam", () => {
  const NOW = new Date("2026-11-26T10:00:00Z");
  const invite = (row: Row) => ({
    full_name: null,
    named_role: null,
    expires_at: "2026-12-01T10:00:00Z",
    link_pending: true,
    ...row,
  });

  it("reads the members' numbers by the names the business shows, and the invites as the console may change them", async () => {
    const GONE_ROLE = "5f0c4a5e-8c1d-4e0b-9a51-2b7f3c9d1e09";
    db.rows = {
      memberships: [
        {
          user_id: "u1",
          profiles: { full_name: "Owner Own", phone: "+972500007310" },
        },
        { user_id: "u2", profiles: { full_name: "Worker", phone: null } },
      ],
      member_names: [{ user_id: "u1", name: "The Owner" }],
      business_roles: [{ id: LEAD.toUpperCase() }],
      invites: [
        invite({ id: "i1", phone: "+972500007311", role: "worker" }),
        invite({ id: "i2", phone: "+972500007312", role: "owner" }),
        invite({ id: "i3", phone: "+972500007313", role: "accountant" }),
        invite({
          id: "i4",
          phone: "+972500007314",
          role: "worker",
          named_role: LEAD,
        }),
        invite({
          id: "i5",
          phone: "+972500007315",
          role: "worker",
          named_role: GONE_ROLE,
        }),
        invite({
          id: "i6",
          phone: "+972500007316",
          role: "manager",
          link_pending: false,
          expires_at: "2026-11-20T10:00:00Z",
        }),
      ],
    };
    const known = await consoleKnownTeam(BUSINESS, NOW);
    // A member with no number can't be pasted, so isn't listed.
    expect(known.members).toEqual([
      { phone: "+972500007310", name: "The Owner" },
    ]);
    expect(
      known.invites.map((one) => [one.id, one.touchable, one.expired]),
    ).toEqual([
      ["i1", true, false],
      ["i2", false, false],
      ["i3", false, false],
      ["i4", true, false],
      ["i5", false, false],
      ["i6", true, true],
    ]);
    // Waiting: every invite with no link yet, and none expired with one.
    expect(known.waiting).toBe(5);
    // The stand-in answers every row seeded, so what decides `touchable` and
    // who is a member is each read's own narrowing: this business only, its
    // active members, its invites nobody claimed, its live roles.
    expect(
      [...db.reads].sort((a, b) => a.table.localeCompare(b.table)),
    ).toEqual([
      {
        table: "business_roles",
        columns: "id",
        filters: { "business_id =": BUSINESS, "archived_at is": null },
      },
      {
        table: "invites",
        columns:
          "id, full_name, phone, role, named_role, expires_at, link_pending",
        filters: { "business_id =": BUSINESS, "claimed_at is": null },
      },
      {
        table: "member_names",
        columns: "user_id, name",
        filters: { "business_id =": BUSINESS },
      },
      {
        table: "memberships",
        columns: "user_id, profiles (full_name, phone)",
        filters: { "business_id =": BUSINESS, "active =": true },
      },
    ]);
  });
});
