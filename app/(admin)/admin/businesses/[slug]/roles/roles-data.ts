import type { ModuleKey, Role } from "@domain/modules";
import type { RoleMatrix } from "@domain/role-access";
import { rolesData } from "@/app/(app)/manage/roles/roles-data";
import type { RolesData } from "@/app/(app)/manage/roles/roles-types";

/** Someone active in the business, as the console lists them. */
export type ConsoleRolePerson = {
  name: string;
  role: Role;
  /** The role the business named that they hold, else null. */
  namedRole?: string | null;
};

/**
 * The console's "תפקידים והרשאות" for a business, from what its database
 * answers (`RoleMatrix`), as the owner's own screen draws it (`rolesData`).
 * The team reads nobody's photo (Storage lets people read only their own and
 * their colleagues'), so each is drawn by initials, as on the console's "מי
 * רואה שכר". Shared with the page's twin
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
  return rolesData({
    matrix,
    enabled,
    people: people.map((person) => ({ ...person, photo: null })),
    viewOnly,
    documents,
  });
}
