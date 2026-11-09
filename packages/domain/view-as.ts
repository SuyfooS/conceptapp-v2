import { ROLES, type Role } from "./modules";

/**
 * "View as": someone on the ConceptApp team opens a business's app as one
 * of its roles, read only. The database keeps the session (two hours at
 * most) and the audit log; these are the rules the app needs around it.
 */

/**
 * Roles the team can view a business as: every business role. A view as an
 * accountant is the one that reads pay (`private.viewing_payroll`).
 */
export const VIEW_AS_ROLES: readonly Role[] = ROLES;

/** The role in a submitted form, or null for anything else. */
export function parseViewAsRole(value: unknown): Role | null {
  return VIEW_AS_ROLES.find((role) => role === value) ?? null;
}

/**
 * A view session as the app reads it. Writes are refused while one is
 * open; `businessSlug` leads back to the console page it started from.
 */
export type ViewSession = { role: Role; businessSlug: string };

/** True when the person may change anything: never while viewing. */
export function canWrite(viewing: ViewSession | null): boolean {
  return viewing === null;
}
