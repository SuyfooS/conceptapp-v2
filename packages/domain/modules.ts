import { z } from "zod";

/**
 * The module system's rules, free of React and the database: what a module
 * declares (its manifest), which modules are on for a business, and what a
 * person in a given role sees. Manifests live in `modules/<key>/manifest.ts`;
 * the registry in `modules/registry.ts` lists them.
 */

/** Same keys and order as the `module_key` enum in the database. */
export const MODULE_KEYS = [
  "scheduling",
  "time_clock",
  "reservations",
  "storefront",
  "notifications",
  "lists",
  "chat",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** The module a piece of text names, if it names one. */
export function moduleKeyOf(value: unknown): ModuleKey | null {
  return MODULE_KEYS.find((key) => key === value) ?? null;
}

/**
 * Same values and order as the `member_role` enum in the database. An
 * accountant does the books from outside the staff (payroll P2): they read
 * what any member reads, at a worker's rank, and always hold `clock.payroll`.
 */
export const ROLES = ["owner", "manager", "worker", "accountant"] as const;

export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = {
  owner: 3,
  manager: 2,
  worker: 1,
  accountant: 1,
};

/** The role is `min` or above (owner > manager > worker, accountant). */
export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/**
 * On the staff: scheduled, punching, owing availability. Everyone but an
 * accountant (`private.is_staff_role` in the database says the same).
 */
export function isStaff(role: Role): boolean {
  return role !== "accountant";
}

/** The roles on the staff, in order: those a shift, a list or a department takes. */
export const STAFF_ROLES = [
  "owner",
  "manager",
  "worker",
] as const satisfies readonly Role[];

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Icon names; the app maps each to a drawn icon. */
export const MODULE_ICONS = [
  "calendar",
  "clock",
  "utensils",
  "store",
  "bell",
  "list",
  "chat",
  "documents",
] as const;

export type ModuleIcon = (typeof MODULE_ICONS)[number];

/**
 * The home tab plus at most this many module tabs fit the phone tab bar. The
 * limit is on what a business has on, not on every module there is: a
 * template that switches on more is refused (`validateTemplate`), and so is
 * switching one on that wouldn't fit (`fitsTabBar`).
 */
export const MAX_MODULE_NAV = 4;

export type ModuleManifest<
  Settings extends z.ZodType = z.ZodType,
  Key extends ModuleKey = ModuleKey,
> = {
  key: Key;
  /** Modules that must be on for this one to work. */
  requires: readonly ModuleKey[];
  /**
   * The module's place in the navigation. Labels come from messages
   * (`modules.<key>.name`), so the manifest holds no copy.
   */
  nav: {
    href: `/${string}`;
    icon: ModuleIcon;
    /** Lowest role that sees the item (and may open the module's screens). */
    minRole: Role;
    /** Position among module items; lower comes first. */
    order: number;
    /**
     * The tab someone off the staff (an accountant) gets, when they hold
     * `perm`: it leads to `href`, labelled `modules.<key>.outsideNav`. The
     * module's own screens stay closed to them (`canOpenModule`). `perm` is
     * one the module declares, or, with `from`, one that module declares and
     * the database asks for the same thing (chat's documents are the office's,
     * and the office is who holds time_clock's `clock.payroll`).
     */
    outsideStaff?: {
      perm: `${string}.${string}`;
      href: `/${string}`;
      from?: ModuleKey;
      /** Its own icon, for a tab that leads elsewhere than the module's (chat's documents). */
      icon?: ModuleIcon;
    };
  } | null;
  /**
   * The module's part of the Today screen. Until it has one of its own, one
   * row linking to `nav.href`.
   */
  homeWidget: { minRole: Role } | null;
  /**
   * Permissions the module checks, with the lowest role that holds each by
   * default. With `byOwner`, an owner gives it to a role or a person (the
   * database's `role_permissions` and `memberships.perms`), and nobody holds it
   * by role alone but owners, and accountants for what they always hold
   * (`clock.payroll`): such a permission's `defaultRole` is "owner".
   */
  permissions: readonly {
    key: `${string}.${string}`;
    defaultRole: Role;
    byOwner?: true;
  }[];
  /** Every field has a default, so `settings.parse({})` gives a full set. */
  settings: Settings;
};

/** Identity function that keeps a manifest's settings type precise. */
export function defineManifest<
  Settings extends z.ZodType,
  Key extends ModuleKey,
>(manifest: ModuleManifest<Settings, Key>): ModuleManifest<Settings, Key> {
  return manifest;
}

/** A `business_modules` row as the app reads it. */
export type ModuleRow = { key: ModuleKey; enabled: boolean; settings: unknown };

/**
 * Keys of the modules that are on: switched on in their row and with every
 * module they require on too (transitively). Order follows `manifests`.
 */
export function enabledModules(
  manifests: readonly ModuleManifest[],
  rows: readonly ModuleRow[],
): ModuleKey[] {
  const switchedOn = new Set(
    rows.filter((row) => row.enabled).map((row) => row.key),
  );
  const byKey = new Map(manifests.map((m) => [m.key, m]));
  const memo = new Map<ModuleKey, boolean>();

  const isOn = (key: ModuleKey, path: ModuleKey[]): boolean => {
    const known = memo.get(key);
    if (known !== undefined) return known;
    const manifest = byKey.get(key);
    // Unknown keys and dependency cycles count as off.
    const on =
      manifest !== undefined &&
      switchedOn.has(key) &&
      !path.includes(key) &&
      manifest.requires.every((dep) => isOn(dep, [...path, key]));
    memo.set(key, on);
    return on;
  };

  return manifests.map((m) => m.key).filter((key) => isOn(key, []));
}

export type ModuleNavEntry = {
  key: ModuleKey;
  href: `/${string}`;
  icon: ModuleIcon;
  /**
   * The tab of someone off the staff (`outsideStaff`): labelled
   * `modules.<key>.outsideNav` instead of the module's name.
   */
  outside: boolean;
};

/**
 * Who is looking: their role, and the permissions they hold in the business
 * (`public.my_permissions`, which is the database's own answer, view sessions
 * included).
 */
export type Viewer = { role: Role; perms: readonly string[] };

/**
 * Whether `role` reaches a nav item or home card for `minRole`. Someone off
 * the staff (an accountant) reaches none of the staff's: they get a module's
 * `outsideStaff` tab instead, when they hold its permission.
 */
function reaches(role: Role, minRole: Role): boolean {
  return isStaff(role) && atLeast(role, minRole);
}

/**
 * Navigation items for the viewer, from the enabled modules, in order. Someone
 * on the staff gets each module their role reaches; someone off it, each
 * module's `outsideStaff` tab whose permission they hold.
 */
export function moduleNav(
  manifests: readonly ModuleManifest[],
  enabled: readonly ModuleKey[],
  viewer: Viewer,
): ModuleNavEntry[] {
  const staff = isStaff(viewer.role);
  return manifests
    .filter((m) => enabled.includes(m.key))
    .flatMap((m) => {
      const nav = m.nav;
      if (!nav) return [];
      if (staff) {
        return reaches(viewer.role, nav.minRole)
          ? [
              {
                key: m.key,
                href: nav.href,
                icon: nav.icon,
                order: nav.order,
                outside: false,
              },
            ]
          : [];
      }
      const outside = nav.outsideStaff;
      return outside && viewer.perms.includes(outside.perm)
        ? [
            {
              key: m.key,
              href: outside.href,
              icon: outside.icon ?? nav.icon,
              order: nav.order,
              outside: true,
            },
          ]
        : [];
    })
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_MODULE_NAV)
    .map(({ key, href, icon, outside }) => ({ key, href, icon, outside }));
}

/**
 * Whether these modules' tabs fit the tab bar for the role that sees them all
 * (an owner). `moduleNav` still cuts at the limit, so a business that got past
 * this check loses its last tab rather than its layout.
 */
export function fitsTabBar(
  manifests: readonly ModuleManifest[],
  enabled: readonly ModuleKey[],
): boolean {
  const tabs = manifests.filter(
    (m) => enabled.includes(m.key) && m.nav !== null,
  );
  return tabs.length <= MAX_MODULE_NAV;
}

/**
 * What the Today screen shows for the viewer, from the enabled modules, in nav
 * order. Nothing for someone off the staff: their Home is their own.
 */
export function moduleWidgets(
  manifests: readonly ModuleManifest[],
  enabled: readonly ModuleKey[],
  viewer: Viewer,
): ModuleNavEntry[] {
  const visible = new Set(
    manifests
      .filter((m) => m.homeWidget && reaches(viewer.role, m.homeWidget.minRole))
      .map((m) => m.key),
  );
  return moduleNav(manifests, enabled, viewer).filter(
    (entry) => !entry.outside && visible.has(entry.key),
  );
}

/**
 * Whether the viewer may open the module's own screens: the module is on and
 * their role reaches its nav item. Never for someone off the staff, whose
 * `outsideStaff` screen checks its own permission: an accountant's
 * `/clock/pay` opens, `/clock` doesn't.
 */
export function canOpenModule(
  manifest: ModuleManifest,
  enabled: readonly ModuleKey[],
  viewer: Viewer,
): boolean {
  return (
    enabled.includes(manifest.key) &&
    manifest.nav !== null &&
    reaches(viewer.role, manifest.nav.minRole)
  );
}

/**
 * Whether a permission opens anything in a business with these modules on: a
 * module that is on declares it, or opens its tab for someone off the staff
 * by it (chat's documents open by time_clock's `clock.payroll`). Where none
 * does, giving it changes nothing anyone sees, so the console doesn't offer
 * it (who sees pay).
 */
export function permissionInUse(
  manifests: readonly ModuleManifest[],
  enabled: readonly ModuleKey[],
  key: string,
): boolean {
  return manifests.some(
    (manifest) =>
      enabled.includes(manifest.key) &&
      (manifest.permissions.some((permission) => permission.key === key) ||
        manifest.nav?.outsideStaff?.perm === key),
  );
}

/**
 * What an accountant always holds, and nothing else (`private.accountant_perms`
 * in the database; `modules/permissions.db.test.ts` keeps the two the same).
 */
export const ACCOUNTANT_PERMISSIONS: readonly string[] = ["clock.payroll"];

/**
 * Whether someone holds one of a module's permissions: owners hold them all,
 * an accountant what accountants always hold, and someone on the staff a
 * permission given to them (`perms`) or one whose `defaultRole` they reach,
 * unless an owner gives it (`byOwner`). A key the manifest doesn't declare is
 * held by owners and those given it. The database's helpers say the same
 * (`private.holds_perm`, `private.can_manage_lists` and their kind). Without
 * the staff check an accountant, at a worker's rank, would hold every
 * permission whose default is "worker".
 */
export function holdsPermission(
  manifest: ModuleManifest,
  role: Role,
  perms: readonly string[],
  key: string,
): boolean {
  if (role === "owner") return true;
  if (!isStaff(role)) return ACCOUNTANT_PERMISSIONS.includes(key);
  if (perms.includes(key)) return true;
  const permission = manifest.permissions.find((p) => p.key === key);
  return (
    permission !== undefined &&
    !permission.byOwner &&
    atLeast(role, permission.defaultRole)
  );
}

/**
 * Settings as stored, read leniently: fields that are missing or no longer
 * valid fall back to their defaults one by one, so a stale row never takes a
 * screen down. Writes use `validateModuleSettings` instead.
 */
export function readModuleSettings<Settings extends z.ZodType>(
  manifest: ModuleManifest<Settings>,
  stored: unknown,
): z.output<Settings> {
  const whole = manifest.settings.safeParse(stored ?? {});
  if (whole.success) return whole.data;

  const defaults = manifest.settings.parse({});
  if (!isRecord(stored) || !isRecord(defaults)) return defaults;
  const merged: Record<string, unknown> = { ...defaults };
  for (const [field, value] of Object.entries(stored)) {
    if (!(field in defaults)) continue;
    const attempt = manifest.settings.safeParse({ ...merged, [field]: value });
    if (attempt.success) merged[field] = value;
  }
  return manifest.settings.parse(merged);
}

/** Settings about to be saved: invalid input throws with a readable message. */
export function validateModuleSettings<Settings extends z.ZodType>(
  manifest: ModuleManifest<Settings>,
  input: unknown,
): z.output<Settings> {
  const result = manifest.settings.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid settings for module ${manifest.key}: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
