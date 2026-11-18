import { settingsPermission } from "@domain/manage-access";
import { ACCOUNTANT_PERMISSIONS, MODULE_KEYS } from "@domain/modules";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { permissions } from "./registry";

/**
 * The permissions the database knows (public.permission_keys, which
 * private.holds_perm and public.my_permissions read) are the ones the app
 * declares: the manifests' and the core ones of the team screen and the
 * management page (CORE_PERMISSIONS in @domain/permissions), each with its
 * module (none for a core one), its area, what it requires, whether owners
 * switch it per role, its default roles and who gives it. A manifest's
 * `defaultRole` is a minimum, so a key's `default_roles` is every staff role
 * at or above it other than the owner (who holds every permission):
 * "manager" is {manager}, "worker" is {manager, worker}, never an
 * accountant. pgTAP can't read the manifests, so this asks SQL. Needs the
 * local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

type Row = {
  key: string;
  module_key: string | null;
  area: string;
  requires: string | null;
  settable: boolean;
  default_roles: string[];
  by_owner: boolean;
};

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

describe("permissions", () => {
  it("are the app's, with their module, area, what they require, who switches them, default roles and who gives them", async () => {
    const rows = await sql<Row[]>`
      select k.key, k.module_key::text as module_key, k.area, k.requires,
        k.settable, k.default_roles::text[] as default_roles, k.by_owner
      from public.permission_keys k`;
    const expected: Row[] = permissions.map((permission) => ({
      key: permission.key,
      module_key: permission.module,
      area: permission.area,
      requires: permission.requires,
      settable: permission.settable,
      default_roles: [...permission.defaultRoles],
      by_owner: permission.byOwner,
    }));
    expect(rows.map((row) => ({ ...row })).sort(byKey)).toEqual(
      expected.sort(byKey),
    );
  });

  it("give an accountant what the app says they hold", async () => {
    const [row] = await sql<{ perms: string[] }[]>`
      select private.accountant_perms() as perms`;
    expect(row?.perms).toEqual([...ACCOUNTANT_PERMISSIONS]);
  });

  it("ask, to save a module's settings, the module's own edit the app asks (R7)", async () => {
    // public.set_module_settings asks private.settings_perm besides
    // manage.edit; /manage draws the screen read only by settingsPermission.
    const rows = await sql<{ module: string; perm: string | null }[]>`
      select m::text as module, private.settings_perm(m) as perm
      from unnest(enum_range(null::public.module_key)) as m`;
    expect(
      Object.fromEntries(rows.map((row) => [row.module, row.perm])),
    ).toEqual(
      Object.fromEntries(
        MODULE_KEYS.map((module) => [module, settingsPermission(module)]),
      ),
    );
  });
});
