import {
  ACCOUNTANT_PERMISSIONS,
  atLeast,
  isStaff,
  type ModuleKey,
  type ModuleManifest,
  type PermissionArea,
  type PermissionDeclaration,
  type PermissionKey,
  type Role,
  STAFF_ROLES,
} from "./modules";

/**
 * The permissions every business has, by area (roles and permissions, step
 * 4b; the roles plan's R1): those the modules' manifests declare, and the
 * app's own for the screens no module owns. The database holds the same in
 * `public.permission_keys` (`modules/permissions.db.test.ts` keeps the two
 * equal) and decides who holds what (`private.holds_perm`,
 * `public.my_permissions`); the screens ask it, not these.
 */

/**
 * The permissions no module declares: seeing and editing the team screen
 * (`/team`: invites, roles, removals) and the management page (`/manage`).
 * Managers hold them by default and owners always, as both screens opened
 * before the roles plan. The management page reads its two (`manageAccess`
 * opens /manage at view and saves at edit, the database's
 * `private.can_edit_settings` and the activity log's policies ask them: the
 * plan's R7), and owners switch them per role; the team screen's wait for
 * their phase (R6), which moves its checks onto them (`canSeeTeam` until
 * then).
 */
export const CORE_PERMISSIONS = [
  { key: "team.view", area: "team", defaultRole: "manager" },
  {
    key: "team.edit",
    area: "team",
    defaultRole: "manager",
    requires: "team.view",
  },
  {
    key: "manage.view",
    area: "manage",
    defaultRole: "manager",
    settable: true,
  },
  {
    key: "manage.edit",
    area: "manage",
    defaultRole: "manager",
    requires: "manage.view",
    settable: true,
  },
] as const satisfies readonly PermissionDeclaration[];

/** The staff roles other than the owner, which the database keeps defaults for. */
type DefaultRole = Exclude<(typeof STAFF_ROLES)[number], "owner">;

/** One permission as `public.permission_keys` holds it. */
export type PermissionEntry = {
  key: PermissionKey;
  /** The module that declares it; null for one of `CORE_PERMISSIONS`. */
  module: ModuleKey | null;
  area: PermissionArea;
  /**
   * The staff roles other than the owner that hold it by default: a
   * `defaultRole` is a minimum, so every such role at or above it ("worker" is
   * manager and worker), and none for one an owner gives.
   */
  defaultRoles: DefaultRole[];
  byOwner: boolean;
  requires: PermissionKey | null;
  settable: boolean;
};

function entryOf(
  permission: PermissionDeclaration,
  module: ModuleKey | null,
): PermissionEntry {
  return {
    key: permission.key,
    module,
    area: permission.area,
    defaultRoles: permission.byOwner
      ? []
      : STAFF_ROLES.filter(
          (role): role is DefaultRole =>
            role !== "owner" && atLeast(role, permission.defaultRole),
        ),
    byOwner: permission.byOwner === true,
    requires: permission.requires ?? null,
    settable: permission.settable === true,
  };
}

/** Every permission: the manifests' (in their order), then the core ones. */
export function declaredPermissions(
  manifests: readonly ModuleManifest[],
): PermissionEntry[] {
  return [
    ...manifests.flatMap((manifest) =>
      manifest.permissions.map((permission) =>
        entryOf(permission, manifest.key),
      ),
    ),
    ...CORE_PERMISSIONS.map((permission) => entryOf(permission, null)),
  ];
}

/**
 * Who `public.my_permissions` is asked about: their role, what was given to
 * them personally (`memberships.perms`), and whether it is a view session,
 * which holds nothing of its own.
 */
export type PermissionHolder = {
  role: Role;
  given: readonly string[];
  viewing: boolean;
};

/**
 * What `public.my_permissions` answers from the declarations alone, with no
 * business choosing anything for a role: for a project the database can't
 * answer yet (its function missing until a migration reaches it), so the
 * screens keep today's rules. An owner holds every key and an accountant
 * theirs; someone on the staff what was given to them, as it was given, and
 * each key whose default roles include theirs, while they also hold what it
 * requires. A view holds what its role holds by default (an owner's view
 * every key but one an owner gives), and pay only as an accountant.
 */
export function permissionsByDefault(
  catalogue: readonly PermissionEntry[],
  holder: PermissionHolder,
): string[] {
  const byKey = new Map<string, PermissionEntry>(
    catalogue.map((entry) => [entry.key, entry]),
  );
  const given = holder.viewing ? [] : holder.given;
  const byRole = (entry: PermissionEntry): boolean =>
    entry.defaultRoles.some((role) => role === holder.role);
  const holds = (key: string, seen: readonly string[]): boolean => {
    if (given.includes(key)) return true;
    const entry = byKey.get(key);
    if (!entry || !byRole(entry) || seen.includes(key)) return false;
    return entry.requires === null || holds(entry.requires, [...seen, key]);
  };

  const held: string[] = catalogue.flatMap((entry) => {
    if (holder.role === "owner") {
      return holder.viewing && entry.byOwner ? [] : [entry.key];
    }
    if (!isStaff(holder.role)) {
      return ACCOUNTANT_PERMISSIONS.includes(entry.key) ? [entry.key] : [];
    }
    return holds(entry.key, []) ? [entry.key] : [];
  });
  const own = isStaff(holder.role) && holder.role !== "owner" ? given : [];
  return [...new Set([...held, ...own])].sort();
}
