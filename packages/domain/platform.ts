/**
 * The ConceptApp team's roles in the admin console (`platform_staff` in the
 * database). Separate from business roles: a platform role never gives a
 * place inside a business.
 */
export const PLATFORM_ROLES = ["platform_admin", "onboarder"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** What a console screen or server action may do. */
export const PLATFORM_ACTIONS = [
  "businesses.read",
  "businesses.create",
  "businesses.edit",
  "businesses.view_as",
  "businesses.delete",
  "staff.invite",
  "templates.edit",
  "billing.manage",
] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];

/**
 * Onboarders set businesses up, invite their staff and view the app as a
 * role to check it; deleting, templates and billing stay with platform
 * admins.
 */
const ONBOARDER: ReadonlySet<PlatformAction> = new Set([
  "businesses.read",
  "businesses.create",
  "businesses.edit",
  "businesses.view_as",
  "staff.invite",
]);

/** True when the role may perform the action. No role (null) may do nothing. */
export function platformCan(
  role: PlatformRole | null,
  action: PlatformAction,
): boolean {
  if (role === "platform_admin") return true;
  if (role === "onboarder") return ONBOARDER.has(action);
  return false;
}

/**
 * What the console's "מי רואה שכר" lets a team role do in a business (Orel's
 * payroll decision 1, 9 November 2026: the owner, and the ConceptApp team from
 * the console). Changing it takes `staff.invite`: the console's add-person
 * page lets a role holding it invite anyone in any role, an accountant
 * included, and an accountant always sees pay, so switching a role's or a
 * person's access gives no power the role lacks. A role that only reads
 * businesses would see the screen without changing it ("read"); none does
 * today, so both platform admins and onboarders change it. Off the team:
 * nothing (null), and the page is not found.
 */
export function consolePayAccess(
  role: PlatformRole | null,
): "change" | "read" | null {
  if (!platformCan(role, "businesses.read")) return null;
  return platformCan(role, "staff.invite") ? "change" : "read";
}
