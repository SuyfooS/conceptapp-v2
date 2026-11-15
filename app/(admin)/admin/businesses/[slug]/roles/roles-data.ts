import type { ModuleKey, Role } from "@domain/modules";
import { PAY_PERMISSION } from "@domain/payroll-access";
import {
  ACCESS_AREAS,
  AREA_MODULE,
  accessFromHeld,
  areaOpen,
  BASE_ROLES,
  type RoleMatrix,
} from "@domain/role-access";
import { manifestFor } from "@modules/registry";
import type {
  RolePerson,
  RolesData,
} from "@/app/(app)/manage/roles/roles-types";

/** Someone active in the business, as the console lists them. */
export type ConsoleRolePerson = { name: string; role: Role };

/**
 * The console's "תפקידים והרשאות" for a business, from what its database
 * answers (`RoleMatrix`): the areas it has (the four modules while they are
 * on, team and manage always), each open for changes once every permission
 * of the area is settable (`areaOpen`); managers and workers, each as they
 * hold it by role (`accessFromHeld`), pay as its row gives it, and who is in
 * them; and the fixed owners and accountants. The team reads nobody's photo
 * (Storage lets people read only their own and their colleagues'), so each
 * is drawn by initials, as on the console's "מי רואה שכר". Named roles come
 * with the roles plan's R11. Shared with the page's twin
 * (/design/console/businesses/[slug]/roles).
 */
export function consoleRolesData({
  matrix,
  enabled,
  people,
  viewOnly,
  documents,
}: {
  matrix: RoleMatrix;
  /** The modules on in the business. */
  enabled: readonly ModuleKey[];
  people: readonly ConsoleRolePerson[];
  viewOnly: boolean;
  /** Documents are on (wherever chat is): whoever sees pay reads them too. */
  documents: boolean;
}): RolesData {
  const settable = new Set(
    matrix.keys.filter((key) => key.settable).map((key) => key.perm),
  );
  const inRole = (role: Role): RolePerson[] =>
    people
      .filter((person) => person.role === role)
      .map((person) => ({ name: person.name, photo: null }));
  return {
    areas: ACCESS_AREAS.flatMap((key) => {
      const module = AREA_MODULE[key];
      if (module && !enabled.includes(module)) return [];
      return [
        {
          key,
          icon: module ? (manifestFor(module).nav?.icon ?? null) : null,
          open: areaOpen(key, (perm) => settable.has(perm)),
        },
      ];
    }),
    roles: BASE_ROLES.map((base) => {
      const held = matrix.held[base];
      return {
        key: base,
        base,
        name: null,
        people: inRole(base),
        access: accessFromHeld((perm) => held.has(perm)),
        seesPay: held.has(PAY_PERMISSION),
      };
    }),
    owners: inRole("owner"),
    accountants: inRole("accountant"),
    viewOnly,
    documents,
  };
}
