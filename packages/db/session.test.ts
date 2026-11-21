import { declaredPermissions } from "@domain/permissions";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The signed-in person's own place (`getOwnPlace`, which `/chat-sync` asks
 * every few seconds) with the database stood in for: each read recorded, and
 * `public.my_permissions`'s answer, or its error, as the test sets it. What
 * they hold comes from the database (the roles plan's R1: the screens keep no
 * defaults of their own), read only when asked; while the function is
 * missing on a project, today's rules from the declarations instead. And
 * the signed-in member (`getCurrentMember`), for the names it keeps: the
 * business's for them, and their own beside it for the console.
 */
type Answer = { data: unknown; error: { code?: string } | null };

const db = vi.hoisted(() => ({
  user: "92000000-0000-4000-a000-000000000001",
  reads: [] as string[],
  /** Each `.eq` a query was narrowed by, as [column, value]. */
  eqs: [] as unknown[][],
  tables: {} as Record<string, Answer>,
  rpc: { data: null, error: null } as Answer,
  /** A function's own answer, over `rpc`'s. */
  functions: {} as Record<string, Answer>,
}));

/** A query that answers the table's rows however it is narrowed. */
function query(answer: Answer): Promise<Answer> {
  const narrowed = () => query(answer);
  return Object.assign(Promise.resolve(answer), {
    select: narrowed,
    eq: (...args: unknown[]) => {
      db.eqs.push(args);
      return query(answer);
    },
    in: narrowed,
    is: narrowed,
    gt: narrowed,
    limit: narrowed,
    order: narrowed,
    maybeSingle: narrowed,
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
      return db.functions[fn] ?? db.rpc;
    },
  }),
}));

const { getCurrentMember, getOwnPlace } = await import("./session");

const BUSINESS = "92000000-0000-4000-b000-000000000001";
// The core permissions alone: managers hold the team's and the management
// page's by default.
const catalogue = declaredPermissions([]);

beforeEach(() => {
  db.reads = [];
  db.eqs = [];
  db.rpc = { data: null, error: null };
  db.functions = {};
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
    expect(own?.memberOf).toEqual([BUSINESS]);

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

  it("names every business they are an active member of, in lower case (P7)", async () => {
    // The read asks for active memberships alone: what the database
    // answers is what they are in.
    const other = "92000000-0000-4000-B000-000000000002";
    db.tables.memberships = {
      data: [
        {
          business_id: BUSINESS,
          role: "worker",
          perms: [],
          created_at: "2026-11-01T08:00:00Z",
          businesses: { business_modules: [] },
        },
        {
          business_id: other,
          role: "worker",
          perms: [],
          created_at: "2026-11-02T08:00:00Z",
          businesses: null,
        },
      ],
      error: null,
    };
    const own = await getOwnPlace();
    expect(own?.memberOf).toEqual([BUSINESS, other.toLowerCase()]);
    expect(db.eqs).toContainEqual(["active", true]);
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

describe("getCurrentMember", () => {
  const business = {
    id: BUSINESS,
    name: "Names X",
    accent: "#0d9488",
    slug: "names-x",
    address: null,
    shabbat_city: null,
    timezone: "Asia/Jerusalem",
    template_key: null,
    business_modules: [],
  };

  beforeEach(() => {
    db.functions = {
      own_phone: { data: "+972500009206", error: null },
      my_permissions: { data: ["clock.payroll"], error: null },
    };
    db.tables = {
      profiles: {
        data: {
          full_name: "Galit Books",
          avatar_path: null,
          bio: null,
          cover: null,
          address_form: null,
        },
        error: null,
      },
      memberships: {
        data: [
          {
            role: "accountant",
            perms: [],
            created_at: "2026-11-01T08:00:00Z",
            named_role: null,
            businesses: business,
          },
        ],
        error: null,
      },
      view_sessions: { data: null, error: null },
      // The name the business gave them, as `public.member_names` keeps it.
      member_names: {
        data: [{ user_id: db.user.toUpperCase(), name: "Galit X" }],
        error: null,
      },
    };
  });

  it("names them as the business does, and keeps their own beside it", async () => {
    const member = await getCurrentMember(catalogue);
    expect(member?.membership?.business.id).toBe(BUSINESS);
    expect(member?.name).toBe("Galit X");
    // The console's, the same in every business.
    expect(member?.ownName).toBe("Galit Books");
  });

  it("has their own name twice where the business gave none", async () => {
    db.tables.member_names = { data: [], error: null };
    const member = await getCurrentMember(catalogue);
    expect(member?.name).toBe("Galit Books");
    expect(member?.ownName).toBe("Galit Books");
  });

  it("has their own name twice while viewing a business as a role", async () => {
    db.tables.view_sessions = {
      data: { role: "worker", named_role: null, businesses: business },
      error: null,
    };
    const member = await getCurrentMember(catalogue);
    expect(member?.viewing).toMatchObject({ role: "worker" });
    expect(member?.name).toBe("Galit Books");
    expect(member?.ownName).toBe("Galit Books");
  });
});
