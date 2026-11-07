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
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

/** The module a piece of text names, if it names one. */
export function moduleKeyOf(value: unknown): ModuleKey | null {
  return MODULE_KEYS.find((key) => key === value) ?? null;
}

export const ROLES = ["owner", "manager", "worker"] as const;

export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { owner: 3, manager: 2, worker: 1 };

/** The role is `min` or above (owner > manager > worker). */
export function atLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** Icon names; the app maps each to a drawn icon. */
export const MODULE_ICONS = [
  "calendar",
  "clock",
  "utensils",
  "store",
  "bell",
] as const;

export type ModuleIcon = (typeof MODULE_ICONS)[number];

/** The home tab plus at most this many module tabs fit the phone tab bar. */
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
   * (`modules.<key>.nav`), so the manifest holds no copy.
   */
  nav: {
    href: `/${string}`;
    icon: ModuleIcon;
    /** Lowest role that sees the item (and may open the module's screens). */
    minRole: Role;
    /** Position among module items; lower comes first. */
    order: number;
  } | null;
  /**
   * The module's part of the Today screen. Until it has one of its own, one
   * row linking to `nav.href`.
   */
  homeWidget: { minRole: Role } | null;
  /** Permissions the module checks, with the lowest role that holds each by default. */
  permissions: readonly { key: `${string}.${string}`; defaultRole: Role }[];
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
};

/** Navigation items for `role`, from the enabled modules, in order. */
export function moduleNav(
  manifests: readonly ModuleManifest[],
  enabled: readonly ModuleKey[],
  role: Role,
): ModuleNavEntry[] {
  return manifests
    .filter((m) => enabled.includes(m.key))
    .flatMap((m) =>
      m.nav && atLeast(role, m.nav.minRole)
        ? [
            {
              key: m.key,
              href: m.nav.href,
              icon: m.nav.icon,
              order: m.nav.order,
            },
          ]
        : [],
    )
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_MODULE_NAV)
    .map(({ key, href, icon }) => ({ key, href, icon }));
}

/** What the Today screen shows for `role`, from the enabled modules, in nav order. */
export function moduleWidgets(
  manifests: readonly ModuleManifest[],
  enabled: readonly ModuleKey[],
  role: Role,
): ModuleNavEntry[] {
  const visible = new Set(
    manifests
      .filter((m) => m.homeWidget && atLeast(role, m.homeWidget.minRole))
      .map((m) => m.key),
  );
  return moduleNav(manifests, enabled, role).filter((entry) =>
    visible.has(entry.key),
  );
}

/**
 * Whether `role` may open the module's screens: the module is on and the
 * role reaches its nav item.
 */
export function canOpenModule(
  manifest: ModuleManifest,
  enabled: readonly ModuleKey[],
  role: Role,
): boolean {
  return (
    enabled.includes(manifest.key) &&
    manifest.nav !== null &&
    atLeast(role, manifest.nav.minRole)
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
