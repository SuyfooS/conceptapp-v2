import { declaredPermissions } from "@domain/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The console's roles and permissions (the roles plan's R2) with the database
 * stood in for: `public.role_permission_matrix`'s rows, or its error, and
 * each call of `public.set_role_permissions` recorded, refused as the test
 * says. One area's change reads the rules again and writes what differs in
 * one call, denials first and what a key requires before it; the database
 * writes all of it or, refused, none of it.
 */
type Failure = { code?: string; hint?: string; message: string };

const db = vi.hoisted(() => ({
  matrix: { data: null as unknown, error: null as Failure | null },
  calls: [] as { perms: string[]; granted: boolean[]; role: string }[],
  refuse: null as ((perms: string[]) => Failure | null) | null,
  payRoles: [] as ("manager" | "worker")[],
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
          db.calls.push({ perms, granted, role: String(args.grant_role) });
        return { data: null, error };
      }
      throw new Error(`unexpected ${fn}`);
    },
  }),
}));
vi.mock("./payroll", () => ({
  getPayRolesForTeam: async () => db.payRoles,
}));

const { getRoleMatrixForTeam, setRoleArea } = await import("./roles");

const ACTOR = "93000000-0000-4000-a000-000000000005";
const BUSINESS = "93000000-0000-4000-b000-000000000001";

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
});

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
