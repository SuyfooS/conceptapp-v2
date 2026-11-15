import { declaredPermissions } from "@domain/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The signed-in person's own place (`getOwnPlace`, which `/chat-sync` asks
 * every few seconds) with the database stood in for: each read recorded, and
 * `public.my_permissions`'s answer, or its error, as the test sets it. What
 * they hold comes from the database (the roles plan's R1: the screens keep no
 * defaults of their own), read only when asked; while the function is
 * missing on a project, today's rules from the declarations instead.
 */
type Answer = { data: unknown; error: { code?: string } | null };

const db = vi.hoisted(() => ({
  user: "92000000-0000-4000-a000-000000000001",
  reads: [] as string[],
  tables: {} as Record<string, Answer>,
  rpc: { data: null, error: null } as Answer,
}));

/** A query that answers the table's rows however it is narrowed. */
function query(answer: Answer): Promise<Answer> {
  const narrowed = () => query(answer);
  return Object.assign(Promise.resolve(answer), {
    select: narrowed,
    eq: narrowed,
    is: narrowed,
    gt: narrowed,
    limit: narrowed,
  });
}

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: db.user } } }),
    },
    from: (table: string) => {
      db.reads.push(table);
      return query(db.tables[table] ?? { data: [], error: null });
    },
    rpc: async (fn: string) => {
      db.reads.push(`rpc:${fn}`);
      return db.rpc;
    },
  }),
}));

const { getOwnPlace } = await import("./session");

const BUSINESS = "92000000-0000-4000-b000-000000000001";
// The core permissions alone: managers hold the team's and the management
// page's by default.
const catalogue = declaredPermissions([]);

beforeEach(() => {
  db.reads = [];
  db.rpc = { data: null, error: null };
  db.tables = {
    memberships: {
      data: [
        {
          business_id: BUSINESS,
          role: "manager",
          perms: ["clock.payroll"],
          created_at: "2026-11-01T08:00:00Z",
          businesses: {
            business_modules: [{ module_key: "chat", enabled: true }],
          },
        },
      ],
      error: null,
    },
    view_sessions: { data: [], error: null },
  };
});

describe("getOwnPlace", () => {
  it("reads the place in one round, and what they hold only when asked", async () => {
    const own = await getOwnPlace();
    expect(own?.place).toMatchObject({
      businessId: BUSINESS,
      role: "manager",
      enabled: ["chat"],
    });
    expect(db.reads).toEqual(["memberships", "view_sessions"]);

    db.rpc = { data: ["chat.moderate", "team.view"], error: null };
    expect(await own?.place?.permissions(catalogue)).toEqual([
      "chat.moderate",
      "team.view",
    ]);
    expect(db.reads).toEqual([
      "memberships",
      "view_sessions",
      "rpc:my_permissions",
    ]);
  });

  it("takes the database's answer over the role's defaults", async () => {
    // A business that took a default from its managers: the database leaves
    // it out, and nothing here puts it back.
    db.rpc = { data: [], error: null };
    const own = await getOwnPlace();
    expect(await own?.place?.permissions(catalogue)).toEqual([]);
  });

  it("keeps today's rules while public.my_permissions is missing", async () => {
    for (const code of ["PGRST202", "42883"]) {
      db.rpc = { data: null, error: { code } };
      const own = await getOwnPlace();
      // The role's defaults, and what was given to them, as it was given.
      expect(await own?.place?.permissions(catalogue)).toEqual(
        [
          "clock.payroll",
          "manage.edit",
          "manage.view",
          "team.edit",
          "team.view",
        ].sort(),
      );
    }
  });

  it("throws any other error", async () => {
    db.rpc = { data: null, error: { code: "42501" } };
    const own = await getOwnPlace();
    await expect(own?.place?.permissions(catalogue)).rejects.toMatchObject({
      code: "42501",
    });
  });
});
