import {
  ACCOUNTANT_PERMISSIONS,
  atLeast,
  type Role,
  STAFF_ROLES,
} from "@domain/modules";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifests } from "./registry";

/**
 * The permissions the database knows (public.permission_keys, which
 * private.holds_perm and public.my_permissions read) are the ones the
 * manifests declare. A manifest's `defaultRole` is a minimum, so a key's
 * `default_roles` is every staff role at or above it other than the owner
 * (who holds every permission): "manager" is {manager}, "worker" is {manager,
 * worker}, never an accountant. pgTAP can't read the manifests, so this asks
 * SQL. Needs the local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

type Row = {
  key: string;
  module_key: string;
  default_roles: string[];
  by_owner: boolean;
};

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

const defaultRoles = (min: Role) =>
  STAFF_ROLES.filter((role) => role !== "owner" && atLeast(role, min));

describe("permissions", () => {
  it("are the manifests', with their module, default roles and who gives them", async () => {
    const rows = await sql<Row[]>`
      select k.key, k.module_key::text as module_key,
        k.default_roles::text[] as default_roles, k.by_owner
      from public.permission_keys k`;
    const expected = manifests.flatMap((manifest) =>
      manifest.permissions.map((permission) => ({
        key: permission.key,
        module_key: manifest.key,
        default_roles: defaultRoles(permission.defaultRole),
        by_owner: permission.byOwner === true,
      })),
    );
    expect(rows.map((row) => ({ ...row })).sort(byKey)).toEqual(
      expected.sort(byKey),
    );
  });

  it("give an accountant what the app says they hold", async () => {
    const [row] = await sql<{ perms: string[] }[]>`
      select private.accountant_perms() as perms`;
    expect(row?.perms).toEqual([...ACCOUNTANT_PERMISSIONS]);
  });
});
