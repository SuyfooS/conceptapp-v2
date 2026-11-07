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
