import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Who sees pay by role (`getPayRoles`, `getPayRolesForTeam`) with the
 * database stood in for: the rows of `public.role_permissions` each read
 * gets, narrowed as it narrows them. Only a row that gives pay counts (the
 * roles plan's R1 lets a row deny a key; R1's security review, note 2), and
 * before that migration, whose column is missing, every row gives. And who
 * the access screen lists (`getAccessPeople`, `getPayAccessForTeam`): the
 * business's members with the role the business named that each holds, by
 * its names (the roles plan's R11e), and before that migration nobody holds
 * one; each by the name the business gave them (`public.member_names`), else
 * their own.
 */
type Row = { role: string; perm: string; allowed: boolean };

type Member = {
  user_id: string;
  role: string;
  named_role: string | null;
  perms: string[];
  profiles: { full_name: string | null; avatar_path: string | null } | null;
};

type BusinessRole = {
  id: string;
  base: string;
  name: string;
  name_en: string | null;
  archived_at: string | null;
};

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  /** The project has no `allowed` column yet (before R1's migration). */
  noColumn: false,
  reads: [] as string[][],
  members: [] as Member[],
  roles: [] as BusinessRole[],
  /**
   * The project has no named roles yet (before
   * 20261115001500_named_roles.sql): no `memberships.named_role`, no
   * `business_roles`.
   */
  noNamed: false,
  /** What each read of `memberships` selected, in order. */
  selects: [] as string[],
  /** The names the business gave its people (`public.member_names`). */
  names: [] as { user_id: string; name: string }[],
  /** The project has no `member_names` yet (before its migration). */
  noNames: false,
}));

/** The names the business gave its people; no such table before their migration. */
function namesQuery() {
  const answer = () =>
    db.noNames
      ? { data: null, error: { code: "PGRST205", message: "no table" } }
      : { data: db.names, error: null };
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    range: () => query,
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return query;
}

/** The business's members, as a select of `columns` gets them. */
function membersQuery() {
  let columns = "";
  const answer = () => {
    db.selects.push(columns);
    if (db.noNamed && columns.includes("named_role")) {
      return { data: null, error: { code: "42703", message: "no column" } };
    }
    return {
      data: db.members.map(({ named_role, ...row }) =>
        columns.includes("named_role") ? { ...row, named_role } : row,
      ),
      error: null,
    };
  };
  const query = {
    select: (picked: string) => {
      columns = picked;
      return query;
    },
    eq: () => query,
    order: () => query,
    range: () => query,
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return query;
}

/** The business's named roles; no such table before their migration. */
function rolesQuery() {
  const answer = () =>
    db.noNamed
      ? { data: null, error: { code: "PGRST205", message: "no table" } }
      : { data: db.roles, error: null };
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: () => query,
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return query;
}

function client() {
  return {
    from: (table: string) => {
      if (table === "memberships") return membersQuery();
      if (table === "business_roles") return rolesQuery();
      if (table === "member_names") return namesQuery();
      if (table !== "role_permissions") throw new Error(table);
      const filters: [string, unknown][] = [];
      const answer = () => {
        db.reads.push(filters.map(([column]) => column));
        if (db.noColumn && filters.some(([column]) => column === "allowed")) {
          return { data: null, error: { code: "42703", message: "no column" } };
        }
        return {
          data: db.rows
            .filter((row) =>
              filters.every(
                ([column, value]) =>
                  column === "business_id" ||
                  row[column as keyof Row] === value,
              ),
            )
            .map((row) => ({ role: row.role })),
          error: null,
        };
      };
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        order: () => query,
        range: () => query,
        // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
        then: (
          resolve: (value: ReturnType<typeof answer>) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return query;
    },
  };
}

vi.mock("./supabase/server", () => ({ createClient: async () => client() }));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => client() }));

const {
  getAccessPeople,
  getPayAccessForTeam,
  getPayRoles,
  getPayRolesForTeam,
} = await import("./payroll");

const BUSINESS = "93000000-0000-4000-b000-000000000001";
const SHIFT_LEAD = "93000000-0000-4000-a000-000000000011";

beforeEach(() => {
  db.rows = [
    { role: "manager", perm: "clock.payroll", allowed: true },
    { role: "worker", perm: "clock.payroll", allowed: false },
    { role: "worker", perm: "schedule.edit", allowed: true },
  ];
  db.noColumn = false;
  db.reads = [];
  db.members = [
    {
      user_id: "owner",
      role: "owner",
      named_role: null,
      perms: [],
      profiles: { full_name: "Ronit", avatar_path: "owner/a.jpg" },
    },
    {
      user_id: "manager",
      role: "manager",
      named_role: null,
      perms: [],
      profiles: { full_name: " Meir ", avatar_path: null },
    },
    {
      user_id: "lead",
      role: "manager",
      named_role: SHIFT_LEAD,
      perms: ["clock.payroll"],
      profiles: { full_name: "Noa", avatar_path: "lead/b.jpg" },
    },
  ];
  db.roles = [
    {
      id: SHIFT_LEAD,
      base: "manager",
      name: "Shift lead",
      name_en: null,
      archived_at: null,
    },
  ];
  db.noNamed = false;
  db.selects = [];
  db.names = [];
  db.noNames = false;
});

describe("pay by role", () => {
  it("counts only a row that gives it, never a denial", async () => {
    expect(await getPayRoles(BUSINESS)).toEqual(["manager"]);
    expect(await getPayRolesForTeam(BUSINESS)).toEqual(["manager"]);
    expect(db.reads[0]).toEqual(["business_id", "perm", "allowed"]);
  });

  it("reads every row before the column exists, when every row gives", async () => {
    db.noColumn = true;
    db.rows = [{ role: "manager", perm: "clock.payroll", allowed: true }];
    expect(await getPayRoles(BUSINESS)).toEqual(["manager"]);
    expect(db.reads).toEqual([
      ["business_id", "perm", "allowed"],
      ["business_id", "perm"],
    ]);
  });
});

describe("who the access screen lists", () => {
  const owner = {
    userId: "owner",
    name: "Ronit",
    photo: "/photos/owner/a.jpg",
    role: "owner",
    namedRole: null,
    personal: false,
  };
  const manager = {
    userId: "manager",
    name: "Meir",
    photo: null,
    role: "manager",
    namedRole: null,
    personal: false,
  };
  const lead = {
    userId: "lead",
    name: "Noa",
    photo: "/photos/lead/b.jpg",
    role: "manager",
    namedRole: { id: SHIFT_LEAD, name: "Shift lead", nameEn: null },
    personal: true,
  };

  it("names the role the business named that each holds, by its names", async () => {
    expect(await getAccessPeople(BUSINESS)).toEqual([owner, manager, lead]);
    expect(db.selects).toEqual([
      "user_id, role, named_role, perms, profiles (full_name, avatar_path)",
    ]);
  });

  it("reads the same for the console, without photos", async () => {
    expect(await getPayAccessForTeam(BUSINESS)).toEqual({
      roles: ["manager"],
      people: [owner, manager, lead].map((person) => ({
        ...person,
        photo: null,
      })),
    });
  });

  it("reads everyone as before the named roles' migration, nobody in one", async () => {
    db.noNamed = true;
    expect(await getAccessPeople(BUSINESS)).toEqual([
      owner,
      manager,
      { ...lead, namedRole: null },
    ]);
    expect(db.selects).toEqual([
      "user_id, role, named_role, perms, profiles (full_name, avatar_path)",
      "user_id, role, perms, profiles (full_name, avatar_path)",
    ]);
  });

  it("names each by the business's name for them, else their own", async () => {
    db.names = [{ user_id: "manager", name: "Meir Levi" }];
    expect(await getAccessPeople(BUSINESS)).toEqual([
      owner,
      { ...manager, name: "Meir Levi" },
      lead,
    ]);
    // Before its migration, by their own names.
    db.noNames = true;
    expect(await getAccessPeople(BUSINESS)).toEqual([owner, manager, lead]);
  });
});
