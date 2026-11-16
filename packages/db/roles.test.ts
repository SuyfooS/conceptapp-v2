import { declaredPermissions } from "@domain/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The console's roles and permissions (the roles plan's R2) with the database
 * stood in for: `public.role_permission_matrix`'s rows, or its error, and
 * each call of `public.set_role_permissions` recorded, refused as the test
 * says. One area's change reads the rules again and writes what differs in
 * one call, denials first and what a key requires before it; the database
 * writes all of it or, refused, none of it. Roles a business names (R11a):
 * the matrix's rows for each, its rules written with its id, and adding,
 * renaming, archiving and restoring one, only in the business it is in; and
 * who is in each role, and the open invites to each named role (R11b), read
 * under RLS for the owner and with the secret key for the team.
 */
type Failure = { code?: string; hint?: string; message: string };

const db = vi.hoisted(() => ({
  matrix: { data: null as unknown, error: null as Failure | null },
  calls: [] as {
    perms: string[];
    granted: boolean[];
    role: string;
    named?: string;
  }[],
  refuse: null as ((perms: string[]) => Failure | null) | null,
  payRoles: [] as ("manager" | "worker")[],
  /** Each call of a role function, by its name. */
  roleCalls: [] as { fn: string; args: Record<string, unknown> }[],
  roleResult: { data: null as unknown, error: null as Failure | null },
  /** The business each role is in, as `public.business_roles` has it. */
  roles: new Map<string, string>(),
  /** The active members each read of `public.memberships` gets. */
  people: [] as unknown[],
  /** The project has no `named_role` column yet (before R11a's migration). */
  noNamedColumn: false,
  /** The invites have no `named_role` column yet (before R11b's migration). */
  noInviteNamedColumn: false,
  /** How many times the invites were asked whether they name roles. */
  inviteProbes: 0,
  /** The open invites each read of `public.invites` gets, by their named role. */
  invites: [] as { named_role: string | null }[],
  /** Each read of the invites: by which key, and how it was narrowed. */
  inviteReads: [] as {
    key: "publishable" | "secret";
    filters: Record<string, unknown>;
  }[],
  /** Each read of the people: by which key, what it selected and narrowed. */
  peopleReads: [] as {
    key: "publishable" | "secret";
    columns: string;
    filters: Record<string, unknown>;
  }[],
}));

/** `public.memberships` as each client reads it: under RLS, or with the secret key. */
function membershipsQuery(key: "publishable" | "secret") {
  const read = { key, columns: "", filters: {} as Record<string, unknown> };
  const answer = () => {
    db.peopleReads.push(read);
    if (db.noNamedColumn && read.columns.includes("named_role")) {
      return { data: null, error: { code: "42703", message: "no column" } };
    }
    return { data: db.people, error: null };
  };
  const query = {
    select: (columns: string) => {
      read.columns = columns;
      return query;
    },
    eq: (column: string, value: unknown) => {
      read.filters[column] = value;
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

/**
 * `public.invites` as each client reads it: whether they name roles (a read
 * of the column, no rows), or the open ones naming each.
 */
function invitesQuery(key: "publishable" | "secret") {
  const read = { key, filters: {} as Record<string, unknown> };
  const missing = {
    data: null,
    error: { code: "42703", message: "no column" },
  };
  const answer = () => {
    db.inviteReads.push(read);
    return db.noInviteNamedColumn ? missing : { data: db.invites, error: null };
  };
  const narrow =
    (name: string) =>
    (column: string, ...value: unknown[]) => {
      read.filters[`${column} ${name}`] = value.length === 1 ? value[0] : value;
      return query;
    };
  const query = {
    select: () => query,
    limit: async () => {
      db.inviteProbes += 1;
      return db.noInviteNamedColumn ? missing : { data: [], error: null };
    },
    eq: narrow("="),
    is: narrow("is"),
    gt: narrow(">"),
    not: narrow("not"),
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return query;
}

vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === "invites") return invitesQuery("publishable");
      if (table !== "memberships") throw new Error(`unexpected ${table}`);
      return membershipsQuery("publishable");
    },
  }),
}));

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "role_permission_matrix") return db.matrix;
      if (fn === "set_role_permissions") {
        const perms = args.perm_keys as string[];
        const granted = args.granted as boolean[];
        // One transaction: refused, nothing of it is written.
        const error = db.refuse?.(perms) ?? null;
        if (!error)
          db.calls.push({
            perms,
            granted,
            role: String(args.grant_role),
            ...(args.grant_named === undefined
              ? {}
              : { named: String(args.grant_named) }),
          });
        return { data: null, error };
      }
      if (fn.endsWith("_business_role")) {
        db.roleCalls.push({ fn, args });
        return db.roleResult;
      }
      throw new Error(`unexpected ${fn}`);
    },
    from: (table: string) => {
      if (table === "memberships") return membershipsQuery("secret");
      if (table === "invites") return invitesQuery("secret");
      if (table !== "business_roles") throw new Error(`unexpected ${table}`);
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => ({
          data:
            db.roles.get(String(filters.id)) === filters.business_id
              ? { id: filters.id }
              : null,
          error: null,
        }),
      };
      return query;
    },
  }),
}));
vi.mock("./payroll", () => ({
  getPayRolesForTeam: async () => db.payRoles,
}));

const {
  archiveBusinessRole,
  createBusinessRole,
  getGivableNamedRoles,
  getRoleInvitesForOwner,
  getRoleInvitesForTeam,
  getRoleMatrixForOwner,
  getRoleMatrixForTeam,
  getRolePeopleForOwner,
  getRolePeopleForTeam,
  renameBusinessRole,
  restoreBusinessRole,
  setRoleArea,
  setRoleAreas,
} = await import("./roles");

const ACTOR = "93000000-0000-4000-a000-000000000005";
const BUSINESS = "93000000-0000-4000-b000-000000000001";
const OTHER = "93000000-0000-4000-b000-000000000002";
const LEAD = "93000000-0000-4000-a000-0000000000c1";

type Row = {
  role: "manager" | "worker";
  perm: string;
  area: string;
  requires: string | null;
  settable: boolean;
  by_owner: boolean;
  by_default: boolean;
  given: boolean;
  held: boolean;
};

/**
 * The rows as the function answers them: managers hold every key but pay,
 * by default; workers what `workerGiven` gives them, by rows.
 */
function rows(
  settable: readonly string[],
  workerGiven: readonly string[] = [],
) {
  const keys = [
    { perm: "schedule.edit", area: "scheduling", requires: null },
    { perm: "schedule.publish", area: "scheduling", requires: "schedule.edit" },
    { perm: "clock.edit", area: "time_clock", requires: null },
    { perm: "clock.payroll", area: "time_clock", requires: null },
  ];
  return (["manager", "worker"] as const).flatMap((role) =>
    keys.map(
      (key): Row => ({
        role,
        ...key,
        settable: settable.includes(key.perm),
        by_owner: key.perm === "clock.payroll",
        by_default: role === "manager" && key.perm !== "clock.payroll",
        given:
          role === "manager"
            ? key.perm !== "clock.payroll"
            : workerGiven.includes(key.perm),
        held:
          role === "manager"
            ? key.perm !== "clock.payroll"
            : workerGiven.includes(key.perm) &&
              (key.requires === null || workerGiven.includes(key.requires)),
      }),
    ),
  );
}

const SCHEDULING = ["schedule.edit", "schedule.publish"];

beforeEach(() => {
  db.matrix = { data: rows(SCHEDULING), error: null };
  db.calls = [];
  db.refuse = null;
  db.payRoles = [];
  db.roleCalls = [];
  db.roleResult = { data: null, error: null };
  db.roles = new Map([[LEAD, BUSINESS]]);
  db.people = [];
  db.noNamedColumn = false;
  db.noInviteNamedColumn = false;
  db.inviteProbes = 0;
  db.invites = [];
  db.inviteReads = [];
  db.peopleReads = [];
});

/**
 * A named role's rows as the function answers them after the managers' and
 * workers': built on workers, by default it holds what they do (none of
 * these), and by its own rows `given`.
 */
function namedRows(given: readonly string[]) {
  return rows(SCHEDULING)
    .filter((row) => row.role === "worker")
    .map((row) => ({
      ...row,
      by_default: false,
      given: given.includes(row.perm),
      held:
        given.includes(row.perm) &&
        (row.requires === null || given.includes(row.requires)),
      named_role: LEAD,
      role_name: "Shift lead",
      role_name_en: null,
    }));
}

/** The rows of a project with named roles: every built-in row says it has none. */
function withNamed(given: readonly string[]) {
  return [
    ...rows(SCHEDULING).map((row) => ({
      ...row,
      named_role: null,
      role_name: null,
      role_name_en: null,
    })),
    ...namedRows(given),
  ];
}

describe("the console's matrix", () => {
  it("is the database's answer, by role", async () => {
    db.matrix = { data: rows(SCHEDULING, ["schedule.publish"]), error: null };
    const matrix = await getRoleMatrixForTeam(BUSINESS, []);
    expect([...matrix.held.manager].sort()).toEqual([
      "clock.edit",
      "schedule.edit",
      "schedule.publish",
    ]);
    // Given by its rule, not held without what it requires.
    expect([...matrix.given.worker]).toEqual(["schedule.publish"]);
    expect([...matrix.held.worker]).toEqual([]);
    // Its default apart: the managers' keys but pay, the workers' none.
    expect([...matrix.byDefault.manager].sort()).toEqual([
      "clock.edit",
      "schedule.edit",
      "schedule.publish",
    ]);
    expect(matrix.byDefault.worker.size).toBe(0);
    expect(matrix.keys.find((key) => key.perm === "schedule.publish")).toEqual({
      perm: "schedule.publish",
      area: "scheduling",
      requires: "schedule.edit",
      settable: true,
      byOwner: false,
    });
  });

  it("is today's rules while the function is missing, with the business's pay", async () => {
    db.matrix = { data: null, error: { code: "PGRST202", message: "missing" } };
    db.payRoles = ["manager"];
    const catalogue = declaredPermissions([]);
    const matrix = await getRoleMatrixForTeam(BUSINESS, catalogue);
    expect(matrix.keys.every((key) => !key.settable)).toBe(true);
    expect(matrix.held.manager.has("team.edit")).toBe(true);
    expect(matrix.held.worker.size).toBe(0);
  });

  it("throws any other failure", async () => {
    db.matrix = { data: null, error: { code: "XX000", message: "down" } };
    await expect(getRoleMatrixForTeam(BUSINESS, [])).rejects.toMatchObject({
      code: "XX000",
    });
  });
});

describe("the owner's matrix (R9)", () => {
  it("is the same answer the console reads", async () => {
    db.matrix = { data: rows(SCHEDULING, ["schedule.edit"]), error: null };
    const owner = await getRoleMatrixForOwner(BUSINESS, []);
    const team = await getRoleMatrixForTeam(BUSINESS, []);
    expect(owner).toEqual(team);
    expect([...owner.held.worker]).toEqual(["schedule.edit"]);
  });

  it("is today's rules while the function is missing", async () => {
    db.matrix = { data: null, error: { code: "PGRST202", message: "missing" } };
    const matrix = await getRoleMatrixForOwner(
      BUSINESS,
      declaredPermissions([]),
    );
    expect(matrix.keys.every((key) => !key.settable)).toBe(true);
    expect(matrix.held.manager.has("team.edit")).toBe(true);
  });
});

describe("changing one area of a role", () => {
  it("writes what differs in one call, what a key requires first", async () => {
    const result = await setRoleArea(ACTOR, BUSINESS, "worker", "scheduling", {
      level: "edit",
      extras: { "schedule.publish": true },
    });
    expect(result).toEqual({ ok: true });
    expect(db.calls).toEqual([
      {
        perms: ["schedule.edit", "schedule.publish"],
        granted: [true, true],
        role: "worker",
      },
    ]);
  });

  it("undoes raising workers without leaving a grant behind", async () => {
    db.matrix = {
      data: rows(SCHEDULING, ["schedule.edit", "schedule.publish"]),
      error: null,
    };
    const result = await setRoleArea(ACTOR, BUSINESS, "worker", "scheduling", {
      level: "view",
      extras: { "schedule.publish": false },
    });
    expect(result).toEqual({ ok: true });
    // Publishing too, though it holds nothing without building: its row goes.
    expect(db.calls).toEqual([
      {
        perms: ["schedule.publish", "schedule.edit"],
        granted: [false, false],
        role: "worker",
      },
    ]);
  });

  it("calls nothing when the area is already so", async () => {
    const result = await setRoleArea(ACTOR, BUSINESS, "manager", "scheduling", {
      level: "edit",
      extras: { "schedule.publish": true },
    });
    expect(result).toEqual({ ok: true });
    expect(db.calls).toEqual([]);
  });

  it("writes nothing in an area not open for changes", async () => {
    const result = await setRoleArea(ACTOR, BUSINESS, "worker", "time_clock", {
      level: "edit",
      extras: {},
    });
    expect(result).toEqual({ ok: false, failure: "closed" });
    expect(db.calls).toEqual([]);
  });

  it("writes nothing before its migration, whose areas are all closed", async () => {
    db.matrix = { data: null, error: { code: "PGRST202", message: "missing" } };
    const result = await setRoleArea(ACTOR, BUSINESS, "worker", "scheduling", {
      level: "edit",
      extras: { "schedule.publish": true },
    });
    expect(result).toEqual({ ok: false, failure: "closed" });
    expect(db.calls).toEqual([]);
  });

  it("says why a refused change wrote nothing", async () => {
    db.refuse = (perms) =>
      perms.includes("schedule.publish")
        ? { code: "22023", hint: "requires", message: "needs" }
        : null;
    const result = await setRoleArea(ACTOR, BUSINESS, "worker", "scheduling", {
      level: "edit",
      extras: { "schedule.publish": true },
    });
    expect(result).toEqual({ ok: false, failure: "requires" });
    expect(db.calls).toEqual([]);
  });

  it.each([
    [{ code: "42501", message: "no" }, "noAccess"],
    [{ code: "22023", message: "not settable" }, "closed"],
    [{ code: "PGRST202", message: "missing" }, "closed"],
    [{ code: "P0002", message: "unknown" }, "failed"],
  ] as const)("says %o as %s", async (error, failure) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.refuse = () => ({ ...error });
    const result = await setRoleArea(ACTOR, BUSINESS, "manager", "scheduling", {
      level: "view",
      extras: {},
    });
    expect(result).toEqual({ ok: false, failure });
    expect(db.calls).toEqual([]);
    spy.mockRestore();
  });
});

describe("named roles the team's screens give (R11b)", () => {
  it("are the live ones, each with the settable keys it holds by role", async () => {
    db.matrix = {
      data: withNamed(["schedule.edit", "schedule.publish", "clock.edit"]),
      error: null,
    };
    expect(await getGivableNamedRoles(BUSINESS)).toEqual([
      {
        id: LEAD,
        name: "Shift lead",
        nameEn: null,
        base: "worker",
        // Not the clock's edit: no owner switches it per role here.
        holds: ["schedule.edit", "schedule.publish"],
      },
    ]);
    expect(db.inviteProbes).toBe(1);
  });

  it("are none before the database gives them, nor where the business named none", async () => {
    db.matrix = { data: withNamed(["schedule.edit"]), error: null };
    db.noInviteNamedColumn = true;
    expect(await getGivableNamedRoles(BUSINESS)).toEqual([]);
    db.matrix = { data: rows(SCHEDULING), error: null };
    db.inviteProbes = 0;
    expect(await getGivableNamedRoles(BUSINESS)).toEqual([]);
    // Nothing to give: the invites aren't asked.
    expect(db.inviteProbes).toBe(0);
    db.matrix = {
      data: null,
      error: { code: "PGRST202", message: "missing" },
    };
    expect(await getGivableNamedRoles(BUSINESS)).toEqual([]);
  });
});

describe("putting a role back where it started (R10)", () => {
  it("writes every area in one call, each area's own order", async () => {
    // Workers raised in scheduling (building and publishing) and the clock.
    db.matrix = {
      data: rows(
        [...SCHEDULING, "clock.edit"],
        ["schedule.edit", "schedule.publish", "clock.edit"],
      ),
      error: null,
    };
    const result = await setRoleAreas(ACTOR, BUSINESS, "worker", [
      {
        area: "scheduling",
        access: { level: "view", extras: { "schedule.publish": false } },
      },
      { area: "time_clock", access: { level: "view", extras: {} } },
    ]);
    expect(result).toEqual({ ok: true });
    // One transaction, so nobody holds a step between.
    expect(db.calls).toEqual([
      {
        perms: ["schedule.publish", "schedule.edit", "clock.edit"],
        granted: [false, false, false],
        role: "worker",
      },
    ]);
  });

  it("writes a named role's way back to its base with its id, removing its rows", async () => {
    db.matrix = { data: withNamed(["schedule.edit"]), error: null };
    const result = await setRoleAreas(ACTOR, BUSINESS, LEAD, [
      {
        area: "scheduling",
        access: { level: "view", extras: { "schedule.publish": false } },
      },
    ]);
    expect(result).toEqual({ ok: true });
    expect(db.calls).toEqual([
      {
        perms: ["schedule.edit"],
        granted: [false],
        role: "worker",
        named: LEAD,
      },
    ]);
  });

  it("writes nothing while any of its areas is closed", async () => {
    const result = await setRoleAreas(ACTOR, BUSINESS, "worker", [
      {
        area: "scheduling",
        access: { level: "edit", extras: { "schedule.publish": true } },
      },
      { area: "time_clock", access: { level: "edit", extras: {} } },
    ]);
    expect(result).toEqual({ ok: false, failure: "closed" });
    expect(db.calls).toEqual([]);
  });
});

describe("roles a business names (R11a)", () => {
  it("are in the matrix after managers and workers, each with its rules", async () => {
    db.matrix = { data: withNamed(["schedule.edit"]), error: null };
    const matrix = await getRoleMatrixForTeam(BUSINESS, []);
    expect(matrix.addsRoles).toBe(true);
    expect(matrix.named).toHaveLength(1);
    const [lead] = matrix.named;
    expect(lead).toMatchObject({
      id: LEAD,
      name: "Shift lead",
      nameEn: null,
      base: "worker",
    });
    expect([...(lead?.given ?? [])]).toEqual(["schedule.edit"]);
    expect([...(lead?.held ?? [])]).toEqual(["schedule.edit"]);
    // Its rows are its own: the workers' are as before.
    expect(matrix.held.worker.size).toBe(0);
    expect(matrix.held.manager.has("schedule.edit")).toBe(true);
  });

  it("can't be added while the function has no named roles' columns", async () => {
    const matrix = await getRoleMatrixForTeam(BUSINESS, []);
    expect(matrix.addsRoles).toBe(false);
    expect(matrix.named).toEqual([]);
  });

  it("have their areas written with their id, on their base, against their own default", async () => {
    db.matrix = { data: withNamed([]), error: null };
    const result = await setRoleArea(ACTOR, BUSINESS, LEAD, "scheduling", {
      level: "edit",
      extras: { "schedule.publish": false },
    });
    expect(result).toEqual({ ok: true });
    expect(db.calls).toEqual([
      {
        perms: ["schedule.edit"],
        granted: [true],
        role: "worker",
        named: LEAD,
      },
    ]);
  });

  it("write nothing for one gone from the matrix (archived since)", async () => {
    db.matrix = { data: withNamed([]), error: null };
    const gone = "93000000-0000-4000-a000-0000000000c9";
    await expect(
      setRoleArea(ACTOR, BUSINESS, gone, "scheduling", {
        level: "edit",
        extras: {},
      }),
    ).resolves.toEqual({ ok: false, failure: "gone" });
    db.refuse = () => ({ code: "P0002", message: "No such role" });
    await expect(
      setRoleArea(ACTOR, BUSINESS, LEAD, "scheduling", {
        level: "edit",
        extras: {},
      }),
    ).resolves.toEqual({ ok: false, failure: "gone" });
    expect(db.calls).toEqual([]);
  });

  it("are added with the role they copy, built-in or named", async () => {
    db.roleResult = { data: LEAD, error: null };
    await expect(
      createBusinessRole(ACTOR, BUSINESS, {
        name: "Shift lead",
        base: "worker",
        copyFrom: "manager",
      }),
    ).resolves.toEqual({ ok: true, id: LEAD });
    await createBusinessRole(ACTOR, BUSINESS, {
      name: "Bar lead",
      base: "manager",
      copyFrom: LEAD,
    });
    expect(db.roleCalls).toEqual([
      {
        fn: "create_business_role",
        args: {
          actor: ACTOR,
          business: BUSINESS,
          base_role: "worker",
          role_name: "Shift lead",
          copy_role: "manager",
        },
      },
      {
        fn: "create_business_role",
        args: {
          actor: ACTOR,
          business: BUSINESS,
          base_role: "manager",
          role_name: "Bar lead",
          copy_from: LEAD,
        },
      },
    ]);
  });

  it.each([
    [{ code: "23505", hint: "taken", message: "taken" }, "taken"],
    [{ code: "54000", hint: "limit", message: "twenty" }, "limit"],
    [{ code: "42501", message: "no" }, "noAccess"],
    [{ code: "P0002", message: "gone" }, "gone"],
    [{ code: "PGRST202", message: "missing" }, "closed"],
  ] as const)("say %o as %s", async (error, failure) => {
    db.roleResult = { data: null, error: { ...error } };
    await expect(
      createBusinessRole(ACTOR, BUSINESS, {
        name: "Shift lead",
        base: "worker",
        copyFrom: "worker",
      }),
    ).resolves.toEqual({ ok: false, failure });
  });

  it("are renamed, archived and restored in the business they are in", async () => {
    await expect(
      renameBusinessRole(ACTOR, BUSINESS, LEAD, "Shift leader"),
    ).resolves.toEqual({ ok: true });
    await expect(archiveBusinessRole(ACTOR, BUSINESS, LEAD)).resolves.toEqual({
      ok: true,
    });
    await expect(restoreBusinessRole(ACTOR, BUSINESS, LEAD)).resolves.toEqual({
      ok: true,
    });
    expect(db.roleCalls).toEqual([
      {
        fn: "rename_business_role",
        args: { actor: ACTOR, role_id: LEAD, role_name: "Shift leader" },
      },
      { fn: "archive_business_role", args: { actor: ACTOR, role_id: LEAD } },
      { fn: "restore_business_role", args: { actor: ACTOR, role_id: LEAD } },
    ]);
  });

  it("are never changed from another business, even one the actor owns", async () => {
    await expect(archiveBusinessRole(ACTOR, OTHER, LEAD)).resolves.toEqual({
      ok: false,
      failure: "gone",
    });
    expect(db.roleCalls).toEqual([]);
  });

  it("say that people hold one being archived", async () => {
    db.roleResult = {
      data: null,
      error: { code: "55000", hint: "held", message: "People hold the role" },
    };
    await expect(archiveBusinessRole(ACTOR, BUSINESS, LEAD)).resolves.toEqual({
      ok: false,
      failure: "held",
    });
  });
});

describe("who is in each role (R11a)", () => {
  const people = [
    {
      user_id: ACTOR,
      role: "worker",
      named_role: LEAD,
      profiles: { full_name: " Noa ", avatar_path: "noa/1.jpg" },
    },
    {
      user_id: "93000000-0000-4000-a000-000000000006",
      role: "manager",
      named_role: null,
      profiles: { full_name: "", avatar_path: null },
    },
  ];

  it("is read for the owner under RLS, with photos", async () => {
    db.people = people;
    await expect(getRolePeopleForOwner(BUSINESS)).resolves.toEqual([
      {
        userId: ACTOR,
        name: "Noa",
        photo: "/photos/noa/1.jpg",
        role: "worker",
        namedRole: LEAD,
      },
      {
        userId: "93000000-0000-4000-a000-000000000006",
        name: null,
        photo: null,
        role: "manager",
        namedRole: null,
      },
    ]);
    expect(db.peopleReads).toEqual([
      {
        key: "publishable",
        columns: "user_id, role, named_role, profiles (full_name, avatar_path)",
        filters: { business_id: BUSINESS, active: true },
      },
    ]);
  });

  it("is read for the team with the secret key, by initials", async () => {
    db.people = people;
    const read = await getRolePeopleForTeam(BUSINESS);
    expect(read.map((person) => [person.photo, person.namedRole])).toEqual([
      [null, LEAD],
      [null, null],
    ]);
    expect(db.peopleReads.map((one) => one.key)).toEqual(["secret"]);
  });

  it("reads nobody in a named role before its migration", async () => {
    db.people = people.map(({ named_role: _, ...person }) => person);
    db.noNamedColumn = true;
    const read = await getRolePeopleForOwner(BUSINESS);
    expect(read.map((person) => person.namedRole)).toEqual([null, null]);
    expect(db.peopleReads.map((one) => one.columns)).toEqual([
      "user_id, role, named_role, profiles (full_name, avatar_path)",
      "user_id, role, profiles (full_name, avatar_path)",
    ]);
  });
});

describe("open invites to each named role (R11b)", () => {
  const BAR = "93000000-0000-4000-a000-0000000000c2";
  const now = new Date("2026-11-16T10:00:00Z");

  it("are counted by role for the owner under RLS, open ones only", async () => {
    db.invites = [
      { named_role: LEAD },
      { named_role: BAR },
      { named_role: LEAD },
    ];
    const counts = await getRoleInvitesForOwner(BUSINESS, now);
    expect([...counts]).toEqual([
      [LEAD, 2],
      [BAR, 1],
    ]);
    expect(db.inviteReads).toEqual([
      {
        key: "publishable",
        filters: {
          "business_id =": BUSINESS,
          "claimed_at is": null,
          "expires_at >": now.toISOString(),
          "named_role not": ["is", null],
        },
      },
    ]);
  });

  it("are read for the team with the secret key", async () => {
    db.invites = [{ named_role: LEAD }];
    const counts = await getRoleInvitesForTeam(BUSINESS, now);
    expect(counts.get(LEAD)).toBe(1);
    expect(db.inviteReads.map((one) => one.key)).toEqual(["secret"]);
  });

  it("are none before invites name roles", async () => {
    db.noInviteNamedColumn = true;
    expect((await getRoleInvitesForOwner(BUSINESS, now)).size).toBe(0);
  });
});
