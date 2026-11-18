import {
  holdsPermission,
  type ModuleKey,
  type PermissionKey,
  type Viewer,
} from "./modules";
import { AREA_EDIT, AREA_VIEW, MODULE_AREAS } from "./role-access";

/**
 * Who manages the business on /manage (roles and permissions, the roles
 * plan's R7; Orel's answers of 15 November 2026, issue #1): its settings, its
 * details, its departments and the activity log. `manage.view` opens the
 * page and everything on it, read only; `manage.edit`, which needs it,
 * saves; a module's own settings save only with that module's edit too
 * (`settingsPermission`, critique 16). Managers hold both by default,
 * workers neither, owners always, and owners and the ConceptApp team switch
 * them per role: edit, view or none. The database decides every read and
 * write (`private.can_edit_settings`, `public.set_module_settings`, the
 * activity log's policies, each row also by its own area); these say what
 * the screens offer.
 */

/** Opens the management page, read only. */
export const MANAGE_VIEW = "manage.view";

/** Saves on it; needs `MANAGE_VIEW` (`public.permission_keys.requires`). */
export const MANAGE_EDIT = "manage.edit";

/** How far someone reaches the management page: they save there, they only see it, or neither. */
export type ManageReach = "edit" | "view" | null;

/**
 * The viewer's reach, from what the database says they hold
 * (`public.my_permissions`): an owner always edits; an accountant, who holds
 * only pay, reaches nothing; a view as a role reaches what the role holds.
 */
export function manageReach(viewer: Viewer): ManageReach {
  if (holdsPermission(viewer, MANAGE_EDIT)) return "edit";
  if (holdsPermission(viewer, MANAGE_VIEW)) return "view";
  return null;
}

/**
 * The permission a module's settings need besides `manage.edit`: the
 * module's own edit, as the roles screen draws its area (`AREA_EDIT`), so
 * someone who doesn't build the schedule doesn't reshape its positions and
 * regular shifts either. Null for a module without an area of its own
 * (notifications, reservations, storefront), whose settings need
 * `manage.edit` alone. The database's `private.settings_perm` says the same
 * (`modules/permissions.db.test.ts`).
 */
export function settingsPermission(module: ModuleKey): PermissionKey | null {
  const area = MODULE_AREAS.find((key) => key === module);
  return area ? AREA_EDIT[area] : null;
}

/**
 * The permissions the activity log reads its rows with besides
 * `manage.view`, each row by its own area (the database's
 * `private.log_perm`; `tooling/log-families.test.ts` keeps the two equal):
 * the modules' edit, and the team's view.
 */
export const LOG_AREA_PERMISSIONS: readonly PermissionKey[] = [
  ...MODULE_AREAS.map((area) => AREA_EDIT[area]),
  AREA_VIEW.team,
];

/**
 * Whether the viewer reads every area's rows of the activity log, so its
 * words may promise the settings', the team's and the schedule's changes
 * alike; someone without one of them reads only their own areas' rows.
 */
export function readsEveryLogArea(viewer: Viewer): boolean {
  return LOG_AREA_PERMISSIONS.every((key) => holdsPermission(viewer, key));
}

/**
 * Why a screen of the management page shows without saving, or null when
 * it saves: a view session (the team looking as a role, which never writes),
 * the role at view on the management page, or, for a module's settings, the
 * module's own edit missing. Each says so in its own words.
 */
export type ManageReadOnly = "viewing" | "manage" | "module" | null;

/** What a screen of the management page says about saving; `module` for a module's settings. */
export function manageReadOnly(
  viewer: Viewer,
  viewing: boolean,
  module?: ModuleKey,
): ManageReadOnly {
  if (viewing) return "viewing";
  if (manageReach(viewer) !== "edit") return "manage";
  const needed = module ? settingsPermission(module) : null;
  if (needed !== null && !holdsPermission(viewer, needed)) return "module";
  return null;
}
