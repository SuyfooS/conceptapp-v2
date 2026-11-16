import { z } from "zod";
import { ROLES, type Role } from "./modules";
import type { NamedRole } from "./role-access";

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
 * A role to view a business as: a built-in one (`namedRole` null), or a role
 * the business named itself (the roles plan's R11c), viewed on its base,
 * which is then the view's rank, reading what the named role holds.
 */
export type ViewAsChoice = { role: Role; namedRole: NamedRole | null };

/**
 * The console's buttons: every built-in role, each followed by the
 * business's live named roles built on it, in `named`'s order, as the team's
 * screens list them.
 */
export function viewAsChoices(named: readonly NamedRole[]): ViewAsChoice[] {
  return VIEW_AS_ROLES.flatMap((role): ViewAsChoice[] => [
    { role, namedRole: null },
    ...named
      .filter((namedRole) => namedRole.base === role)
      .map((namedRole) => ({ role, namedRole })),
  ]);
}

/** A choice as its button submits it: the built-in role, or the named role's id. */
export function viewAsKey(choice: ViewAsChoice): string {
  return choice.namedRole?.id ?? choice.role;
}

/**
 * The choice a submitted form names among the built-in roles and `named`,
 * the business's live named roles; null for anything else.
 */
export function parseViewAsChoice(
  value: unknown,
  named: readonly NamedRole[],
): ViewAsChoice | null {
  if (typeof value !== "string" || value === "") return null;
  return (
    viewAsChoices(named).find((choice) => viewAsKey(choice) === value) ?? null
  );
}

/**
 * What the console's form asks to view the business as: the choice it names
 * among the built-in roles and `named`, the business's live named roles;
 * `"gone"` for a role's id that is none of them, as one archived since the
 * page was drawn is, which the page then says (`?view=roleGone`); null for
 * anything else.
 */
export function readViewAsChoice(
  value: unknown,
  named: readonly NamedRole[],
): ViewAsChoice | "gone" | null {
  const choice = parseViewAsChoice(value, named);
  if (choice) return choice;
  return z.uuid().safeParse(value).success ? "gone" : null;
}

/**
 * Why the console could not open a view: the role the business named is no
 * longer among its live ones, archived since the page was drawn or as the
 * view started (`roleGone`); anything else (`failed`).
 */
export const VIEW_AS_FAILURES = ["failed", "roleGone"] as const;

export type ViewAsFailure = (typeof VIEW_AS_FAILURES)[number];

/** The failure a console address names (`?view=`), or null for none. */
export function viewAsFailureOf(value: unknown): ViewAsFailure | null {
  return VIEW_AS_FAILURES.find((failure) => failure === value) ?? null;
}

/**
 * A view session as the app reads it. Writes are refused while one is
 * open; `businessSlug` leads back to the console page it started from.
 * `namedRole` is the role the business named that it views as, on `role`
 * (R11c), or null for the role itself.
 */
export type ViewSession = {
  role: Role;
  namedRole: NamedRole | null;
  businessSlug: string;
};

/** True when the person may change anything: never while viewing. */
export function canWrite(viewing: ViewSession | null): boolean {
  return viewing === null;
}
