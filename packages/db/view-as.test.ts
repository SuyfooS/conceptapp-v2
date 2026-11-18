import type { NamedRole } from "@domain/role-access";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * "View as" from the console (the roles plan's R11c) with the database stood
 * in for: each call of `public.start_view_session` recorded with its
 * arguments and refused as the test says, and the business's live named
 * roles, read with the secret key, only once `view_sessions.named_role`
 * exists.
 */
type Failure = { code?: string; hint?: string; message: string };

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  refusal: null as Failure | null,
  /** The project has no `view_sessions.named_role` yet (before R11c's migration). */
  noNamedColumn: false,
  /** The project has no `business_roles` yet (before R11a's migration). */
  noRolesTable: false,
  roles: [] as unknown[],
  /** How each read of `business_roles` was narrowed and ordered. */
  roleReads: [] as string[][],
}));

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.calls.push({ fn, args });
      return { data: null, error: db.refusal };
    },
    from: (table: string) => {
      if (table === "view_sessions") {
        return {
          select: () => ({
            limit: async () =>
              db.noNamedColumn
                ? { data: null, error: { code: "42703", message: "no column" } }
                : { data: [], error: null },
          }),
        };
      }
      const steps: string[] = [];
      db.roleReads.push(steps);
      const query = {
        select: (columns: string) => {
          steps.push(`select ${columns}`);
          return query;
        },
        eq: (column: string, value: unknown) => {
          steps.push(`${column} = ${String(value)}`);
          return query;
        },
        is: (column: string, value: unknown) => {
          steps.push(`${column} is ${String(value)}`);
          return query;
        },
        order: (column: string) => {
          steps.push(`order ${column}`);
          return query;
        },
        // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve(
            db.noRolesTable
              ? { data: null, error: { code: "PGRST205", message: "no table" } }
              : { data: db.roles, error: null },
          ).then(resolve, reject),
      };
      return query;
    },
  }),
}));

const { getViewableNamedRoles, startViewing } = await import("./view-as");

const ACTOR = "a3000000-0000-4000-a000-000000000010";
const BUSINESS = "a3000000-0000-4000-b000-000000000001";
const shiftLead: NamedRole = {
  id: "a3000000-0000-4000-8000-000000000001",
  name: "Shift lead",
  nameEn: null,
  base: "worker",
};

beforeEach(() => {
  db.calls = [];
  db.refusal = null;
  db.noNamedColumn = false;
  db.noRolesTable = false;
  db.roles = [];
  db.roleReads = [];
});

describe("startViewing", () => {
  it("opens a built-in role as before, with no named role", async () => {
    expect(
      await startViewing(ACTOR, BUSINESS, { role: "manager", namedRole: null }),
    ).toEqual({ ok: true });
    expect(db.calls).toEqual([
      {
        fn: "start_view_session",
        args: { actor: ACTOR, business: BUSINESS, view_role: "manager" },
      },
    ]);
  });

  it("opens a named role on its base", async () => {
    expect(
      await startViewing(ACTOR, BUSINESS, {
        role: "worker",
        namedRole: shiftLead,
      }),
    ).toEqual({ ok: true });
    expect(db.calls[0]?.args).toEqual({
      actor: ACTOR,
      business: BUSINESS,
      view_role: "worker",
      view_named: shiftLead.id,
    });
  });

  it("says a named role archived since is gone", async () => {
    db.refusal = { code: "22023", hint: "archived", message: "archived" };
    expect(
      await startViewing(ACTOR, BUSINESS, {
        role: "worker",
        namedRole: shiftLead,
      }),
    ).toEqual({ ok: false, failure: "roleGone" });
  });

  it("throws anything else", async () => {
    db.refusal = { code: "42501", message: "Platform staff only" };
    await expect(
      startViewing(ACTOR, BUSINESS, { role: "worker", namedRole: shiftLead }),
    ).rejects.toThrow("Platform staff only");
    db.refusal = { code: "22023", hint: "base", message: "built on manager" };
    await expect(
      startViewing(ACTOR, BUSINESS, { role: "worker", namedRole: shiftLead }),
    ).rejects.toThrow("built on manager");
    db.refusal = { code: "22023", message: "A role to view as is required" };
    await expect(
      startViewing(ACTOR, BUSINESS, { role: "worker", namedRole: null }),
    ).rejects.toThrow("required");
  });
});

describe("getViewableNamedRoles", () => {
  it("reads the business's live roles in their order, by their names", async () => {
    db.roles = [
      {
        id: shiftLead.id,
        base: "worker",
        name: "Shift lead",
        name_en: null,
      },
      {
        id: "a3000000-0000-4000-8000-000000000002",
        base: "manager",
        name: "Floor manager",
        name_en: "Floor manager",
      },
    ];
    expect(await getViewableNamedRoles(BUSINESS)).toEqual([
      shiftLead,
      {
        id: "a3000000-0000-4000-8000-000000000002",
        name: "Floor manager",
        nameEn: "Floor manager",
        base: "manager",
      },
    ]);
    expect(db.roleReads).toEqual([
      [
        "select id, base, name, name_en",
        `business_id = ${BUSINESS}`,
        "archived_at is null",
        "order sort",
        "order created_at",
      ],
    ]);
  });

  it("offers none before the database views them", async () => {
    db.roles = [{ id: shiftLead.id, base: "worker", name: "x", name_en: null }];
    db.noNamedColumn = true;
    expect(await getViewableNamedRoles(BUSINESS)).toEqual([]);
  });

  it("offers none before the roles exist", async () => {
    db.noRolesTable = true;
    expect(await getViewableNamedRoles(BUSINESS)).toEqual([]);
  });
});
