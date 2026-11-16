import type { ModuleKey, Role } from "@domain/modules";
import { PAY_PERMISSION } from "@domain/payroll-access";
import {
  ACCESS_AREAS,
  AREA_MODULE,
  accessFromHeld,
  areaOpen,
  areaShown,
  BASE_ROLES,
  type RoleMatrix,
} from "@domain/role-access";
import { manifestFor } from "@modules/registry";
import type { RolePerson, RolesData } from "./roles-types";

/** Someone active in the business, by their role, as the screen counts them. */
export type RolesMember = RolePerson & {
  role: Role;
  /** The role the business named that they hold (R11b gives them), else null. */
  namedRole?: string | null;
};

/**
 * "תפקידים והרשאות" for a business, from what its database answers
 * (`RoleMatrix`): the areas it has (the four modules while they are on, team
 * and manage always), each open for changes once every permission of the
 * area is settable (`areaOpen`); managers and workers, each as they hold it
 * by role (`accessFromHeld`), pay as its row gives it, and who is in them
 * (those in a role the business named are in that one); then the business's
 * named roles in their order (R11a), each as it holds it, never pay, which
 * its people are given one by one; and the fixed owners and accountants. The
 * owner's screen (/manage/roles, the roles plan's R9) and the console's (R2,
 * by initials) both draw it.
 */
export function rolesData({
  matrix,
  enabled,
  people,
  viewOnly,
  documents,
}: {
  matrix: RoleMatrix;
  /** The modules on in the business. */
  enabled: readonly ModuleKey[];
  /** The business's active members (an invite is in no role until claimed). */
  people: readonly RolesMember[];
  viewOnly: boolean;
  /** Documents are on (wherever chat is): whoever sees pay reads them too. */
  documents: boolean;
}): RolesData {
  const settable = new Set(
    matrix.keys.filter((key) => key.settable).map((key) => key.perm),
  );
  const face = (person: RolesMember): RolePerson => ({
    name: person.name,
    photo: person.photo,
  });
  const inRole = (role: Role): RolePerson[] =>
    people
      .filter((person) => person.role === role && !person.namedRole)
      .map(face);
  const inNamed = (id: string): RolePerson[] =>
    people.filter((person) => person.namedRole === id).map(face);
  return {
    areas: ACCESS_AREAS.flatMap((key) => {
      if (!areaShown(key, enabled)) return [];
      const module = AREA_MODULE[key];
      return [
        {
          key,
          icon: module ? (manifestFor(module).nav?.icon ?? null) : null,
          open: areaOpen(key, (perm) => settable.has(perm)),
        },
      ];
    }),
    roles: [
      ...BASE_ROLES.map((base) => {
        const held = matrix.held[base];
        return {
          key: base,
          base,
          name: null,
          nameEn: null,
          people: inRole(base),
          access: accessFromHeld((perm) => held.has(perm)),
          seesPay: held.has(PAY_PERMISSION),
        };
      }),
      ...matrix.named.map((role) => ({
        key: role.id,
        base: role.base,
        name: role.name,
        nameEn: role.nameEn,
        people: inNamed(role.id),
        access: accessFromHeld((perm) => role.held.has(perm)),
        // Never by role: given to each of its people on "מי רואה שכר".
        seesPay: false,
      })),
    ],
    owners: inRole("owner"),
    accountants: inRole("accountant"),
    viewOnly,
    documents,
  };
}
