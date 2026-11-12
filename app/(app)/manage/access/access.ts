import { getAccessPeople, getPayRoles } from "@db/payroll";
import { canGrantPay } from "@domain/payroll-access";
import { canWrite } from "@domain/view-as";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";
import type { AccessData } from "./access-types";

/**
 * The owner, and their business, for who sees pay: an owner of it (or the
 * team viewing it as one, read only). Null for anyone else, who gets the
 * not-found screen. Managers never change who sees pay (Orel, 8 November 2026).
 */
export async function accessAccess() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canGrantPay(membership.role)) return null;
  return {
    userId: member.userId,
    businessId: membership.business.id,
    viewOnly: !canWrite(member.viewing),
  };
}

/** Who sees pay in the business: the roles given it, and everyone in it. */
export async function currentAccess(): Promise<AccessData | null> {
  const access = await accessAccess();
  if (!access) return null;
  const [roles, people, enabled] = await Promise.all([
    getPayRoles(access.businessId),
    getAccessPeople(access.businessId),
    currentModules(),
  ]);
  return {
    roles,
    people: people.sort(
      (a, b) =>
        (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
        (a.name ?? "").localeCompare(b.name ?? "", "he"),
    ),
    me: access.userId,
    viewOnly: access.viewOnly,
    // Documents are on wherever chat is (private.documents_on).
    documents: enabled.includes("chat"),
  };
}
