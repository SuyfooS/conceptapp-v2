import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Who sees pay by role (`getPayRoles`, `getPayRolesForTeam`) with the
 * database stood in for: the rows of `public.role_permissions` each read
 * gets, narrowed as it narrows them. Only a row that gives pay counts (the
 * roles plan's R1 lets a row deny a key; R1's security review, note 2), and
 * before that migration, whose column is missing, every row gives.
 */
type Row = { role: string; perm: string; allowed: boolean };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  /** The project has no `allowed` column yet (before R1's migration). */
  noColumn: false,
  reads: [] as string[][],
}));

function client() {
  return {
    from: (table: string) => {
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

const { getPayRoles, getPayRolesForTeam } = await import("./payroll");

const BUSINESS = "93000000-0000-4000-b000-000000000001";

beforeEach(() => {
  db.rows = [
    { role: "manager", perm: "clock.payroll", allowed: true },
    { role: "worker", perm: "clock.payroll", allowed: false },
    { role: "worker", perm: "schedule.edit", allowed: true },
  ];
  db.noColumn = false;
  db.reads = [];
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
