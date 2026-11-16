import { getRoleMatrixForOwner, getRolePeopleForOwner } from "@db/roles";
import { enabledModules } from "@domain/modules";
import { accessOrder } from "@domain/payroll-access";
import { changesPermissions } from "@domain/role-access";
import { canWrite } from "@domain/view-as";
import { manifests, permissions } from "@modules/registry";
import { currentMember } from "../../member";
import { payAccessInUse } from "../manage";
import { rolesData } from "./roles-data";
import type { RolesData } from "./roles-types";

/**
 * The owner, and their business, for roles and permissions (the roles plan's
 * R9; Orel, 15 November 2026, Q5): an owner of it, or the team viewing it as
 * one, read only, as on "מי רואה שכר" (`accessAccess`). Null for anyone else,
 * managers included at any level, who gets the not-found screen: what each
 * role does is the owner's to decide, and the console's.
 */
export async function rolesAccess() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !changesPermissions(membership.role)) {
    return null;
  }
  return {
    userId: member.userId,
    businessId: membership.business.id,
    rows: membership.business.modules,
    viewOnly: !canWrite(member.viewing),
  };
}

/**
 * What the owner's screen draws: the business's rules as its database
 * answers them, its named roles among them (both read with the secret key
 * once the session's person is known to be its owner), its active people by
 * role and named role with their photos (under RLS, as "מי רואה שכר" reads
 * them), by name as that screen lists them, whether pay opens anything
 * there, for the way to it, and whether the
 * database takes roles the business names (`addsRoles`: "הוספת תפקיד").
 * Null for anyone but an owner. `noName` names someone who gave none.
 */
export async function currentRoles(
  noName: string,
): Promise<{ data: RolesData; payAccess: boolean; addsRoles: boolean } | null> {
  const access = await rolesAccess();
  if (!access) return null;
  const [matrix, people] = await Promise.all([
    getRoleMatrixForOwner(access.businessId, permissions),
    getRolePeopleForOwner(access.businessId),
  ]);
  const enabled = enabledModules(manifests, access.rows);
  return {
    data: rolesData({
      matrix,
      enabled,
      // By name, as "מי רואה שכר" lists them: each role's faces in that order.
      people: people.sort(accessOrder).map((person) => ({
        name: person.name ?? noName,
        photo: person.photo,
        role: person.role,
        namedRole: person.namedRole,
      })),
      viewOnly: access.viewOnly,
      // Documents are on wherever chat is (private.documents_on).
      documents: enabled.includes("chat"),
    }),
    payAccess: payAccessInUse(access.rows),
    addsRoles: matrix.addsRoles,
  };
}
