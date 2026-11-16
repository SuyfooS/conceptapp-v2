import { z } from "zod";
import type { ModuleKey, PermissionKey, Role } from "./modules";
import type { PermissionEntry } from "./permissions";

/**
 * What a role may do in each area of the business, as the owner's screen
 * "תפקידים והרשאות" draws it (roles plan, step 4b; Orel's answers of 15
 * November 2026, issue #1): edit, view or none per area, and under edit the
 * switches that belong there, on by default. In the four modules the least
 * is view, since every member of the staff sees the published schedule,
 * punches, fills their own lists and chats; the team screen and the
 * management page can go down to none. Owners hold everything and an
 * accountant only pay, outside these choices, and pay stays the owner's
 * switch ("מי רואה שכר"). Pure: the database decides (from R1), and this
 * says what the screen shows and offers.
 */

/** From least to most. */
export const ACCESS_LEVELS = ["none", "view", "edit"] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** The modules' areas: the least there is view, so each is edit or not. */
export const MODULE_AREAS = [
  "scheduling",
  "time_clock",
  "lists",
  "chat",
] as const;

export type ModuleArea = (typeof MODULE_AREAS)[number];

/** The team screen and the management page, which go down to none. */
export const PLACE_AREAS = ["team", "manage"] as const;

export type PlaceArea = (typeof PLACE_AREAS)[number];

/** The areas in the order the screen shows them: the modules, then team and manage. */
export const ACCESS_AREAS = [...MODULE_AREAS, ...PLACE_AREAS] as const;

export type AccessArea = (typeof ACCESS_AREAS)[number];

/** The module an area belongs to: shown only while it is on. Team and manage always are. */
export const AREA_MODULE: Record<AccessArea, ModuleKey | null> = {
  scheduling: "scheduling",
  time_clock: "time_clock",
  lists: "lists",
  chat: "chat",
  team: null,
  manage: null,
};

/**
 * Whether a business has an area, from the modules on in it: the four
 * modules while they are on, team and manage always. What the screen shows,
 * and all a change may reach: an area whose module is off is neither drawn
 * nor written.
 */
export function areaShown(
  area: AccessArea,
  enabled: readonly ModuleKey[],
): boolean {
  const module = AREA_MODULE[area];
  return module === null || enabled.includes(module);
}

/** The least a manager or a worker holds in each area (Orel, 15 November 2026, Q2). */
export const ACCESS_FLOOR: Record<AccessArea, AccessLevel> = {
  scheduling: "view",
  time_clock: "view",
  lists: "view",
  chat: "view",
  team: "none",
  manage: "none",
};

/**
 * The switches under edit, each one a permission its module declares, on by
 * default whenever the area is raised to edit (Q3). Someone who builds the
 * schedule without publishing can't change a published week: every change
 * there is a publish.
 */
export const ACCESS_EXTRAS = {
  scheduling: ["schedule.publish"],
  time_clock: [],
  lists: ["lists.send"],
  chat: ["chat.announce", "chat.send_documents"],
  team: [],
  manage: [],
} as const satisfies Record<AccessArea, readonly `${string}.${string}`[]>;

export type AccessExtra = (typeof ACCESS_EXTRAS)[AccessArea][number];

/** Every switch, in the order the screen shows them. */
export const ACCESS_EXTRA_KEYS: readonly AccessExtra[] = ACCESS_AREAS.flatMap(
  (area): readonly AccessExtra[] => ACCESS_EXTRAS[area],
);

/** What one role may do. */
export type RoleAccess = {
  levels: Record<AccessArea, AccessLevel>;
  extras: Record<AccessExtra, boolean>;
};

/** What a role a business names itself is built on, and the two roles the screen changes. */
export const BASE_ROLES = ["manager", "worker"] as const;

export type BaseRole = (typeof BASE_ROLES)[number];

function allExtras(on: boolean): Record<AccessExtra, boolean> {
  return Object.fromEntries(
    ACCESS_EXTRA_KEYS.map((extra) => [extra, on]),
  ) as Record<AccessExtra, boolean>;
}

/**
 * Today's rules, where every business starts: a manager edits everything and
 * holds every switch; a worker sees the four modules and has neither the
 * team screen nor the management page.
 */
export function defaultAccess(base: BaseRole): RoleAccess {
  if (base === "manager") {
    return {
      levels: {
        scheduling: "edit",
        time_clock: "edit",
        lists: "edit",
        chat: "edit",
        team: "edit",
        manage: "edit",
      },
      extras: allExtras(true),
    };
  }
  return { levels: { ...ACCESS_FLOOR }, extras: allExtras(false) };
}

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

/** The level is `min` or above. */
export function levelAtLeast(level: AccessLevel, min: AccessLevel): boolean {
  return RANK[level] >= RANK[min];
}

/** What an area offers, most first: edit and view, and none where it may go that low. */
export function levelChoices(area: AccessArea): AccessLevel[] {
  return [...ACCESS_LEVELS]
    .reverse()
    .filter((level) => levelAtLeast(level, ACCESS_FLOOR[area]));
}

/** A module's area, whose least is view: the screen draws it as edit on or off. */
export function editOrView(area: AccessArea): area is ModuleArea {
  return (MODULE_AREAS as readonly AccessArea[]).includes(area);
}

/** The switches under an area's edit. */
export function extrasOf(area: AccessArea): readonly AccessExtra[] {
  return ACCESS_EXTRAS[area];
}

/** The area a switch sits in. */
export function areaOfExtra(extra: AccessExtra): AccessArea {
  const area = ACCESS_AREAS.find((key) =>
    (ACCESS_EXTRAS[key] as readonly AccessExtra[]).includes(extra),
  );
  if (!area) throw new Error(`No area for ${extra}`);
  return area;
}

/** A switch can change only while its area is at edit; otherwise it is off. */
export function extraOpen(access: RoleAccess, extra: AccessExtra): boolean {
  return access.levels[areaOfExtra(extra)] === "edit";
}

/** Whether the role holds a switch: on, and its area at edit. */
export function holdsExtra(access: RoleAccess, extra: AccessExtra): boolean {
  return extraOpen(access, extra) && access.extras[extra];
}

/**
 * The role with an area at a level. Raising it to edit turns its switches
 * on, their default there; leaving edit turns them off. A level under the
 * area's floor changes nothing.
 */
export function withLevel(
  access: RoleAccess,
  area: AccessArea,
  level: AccessLevel,
): RoleAccess {
  const before = access.levels[area];
  if (!levelAtLeast(level, ACCESS_FLOOR[area]) || before === level) {
    return access;
  }
  const extras = { ...access.extras };
  if (level === "edit" || before === "edit") {
    for (const extra of extrasOf(area)) extras[extra] = level === "edit";
  }
  return { levels: { ...access.levels, [area]: level }, extras };
}

/** The role with a switch on or off; nothing changes while its area isn't at edit. */
export function withExtra(
  access: RoleAccess,
  extra: AccessExtra,
  on: boolean,
): RoleAccess {
  if (!extraOpen(access, extra) || access.extras[extra] === on) return access;
  return { ...access, extras: { ...access.extras, [extra]: on } };
}

/** One area of a role: its level and its switches, as one change writes it and its undo puts it back. */
export type AreaAccess = {
  level: AccessLevel;
  extras: Partial<Record<AccessExtra, boolean>>;
};

export function areaAccess(access: RoleAccess, area: AccessArea): AreaAccess {
  return {
    level: access.levels[area],
    extras: Object.fromEntries(
      extrasOf(area).map((extra) => [extra, access.extras[extra]]),
    ),
  };
}

/** The role with one area as it was (an undo), its floor kept and other areas' switches left alone. */
export function withAreaAccess(
  access: RoleAccess,
  area: AccessArea,
  part: AreaAccess,
): RoleAccess {
  const level = levelAtLeast(part.level, ACCESS_FLOOR[area])
    ? part.level
    : ACCESS_FLOOR[area];
  const extras = { ...access.extras };
  for (const extra of extrasOf(area)) {
    extras[extra] = level === "edit" && part.extras[extra] === true;
  }
  return { levels: { ...access.levels, [area]: level }, extras };
}

/**
 * Who changes what each role does in the app: the business's owners alone
 * (Orel, 15 November 2026, Q5, as "מי רואה שכר"), and from the console the
 * ConceptApp team. A view as the owner reads it and changes nothing.
 */
export function changesPermissions(role: Role): boolean {
  return role === "owner";
}

const areaChange = z.object({
  role: z.enum(BASE_ROLES),
  area: z.enum(ACCESS_AREAS),
  access: z.object({
    level: z.enum(ACCESS_LEVELS),
    extras: z.partialRecord(z.enum(ACCESS_EXTRA_KEYS), z.boolean()),
  }),
});

/** One area of managers or workers, as a change on "תפקידים והרשאות" asks for it. */
export type RoleAreaChange = {
  role: BaseRole;
  area: AccessArea;
  access: AreaAccess;
};

/**
 * A change of one area as it reaches the server (the owner's screen, or the
 * console's): managers or workers, an area, its level never under the area's
 * floor, and only the area's own switches. Null for anything else, which
 * writes nothing.
 */
export function parseRoleAreaChange(input: unknown): RoleAreaChange | null {
  const parsed = areaChange.safeParse(input);
  if (!parsed.success) return null;
  const { role, area, access } = parsed.data;
  if (!levelAtLeast(access.level, ACCESS_FLOOR[area])) return null;
  const own: readonly string[] = extrasOf(area);
  if (Object.keys(access.extras).some((extra) => !own.includes(extra))) {
    return null;
  }
  return { role, area, access };
}

/** The areas, of those shown, that a role edits. */
export function editedAreas(
  access: RoleAccess,
  areas: readonly AccessArea[],
): AccessArea[] {
  return areas.filter((area) => access.levels[area] === "edit");
}

/** The switches that came on or went off between two states of a role. */
export function extrasTurned(
  before: RoleAccess,
  after: RoleAccess,
  on: boolean,
): AccessExtra[] {
  return ACCESS_EXTRA_KEYS.filter(
    (extra) =>
      holdsExtra(after, extra) === on && holdsExtra(before, extra) !== on,
  );
}

/**
 * The permission behind each area's edit (`public.permission_keys`; the
 * roles plan's R1): building the schedule, correcting hours, running the
 * lists, moderating chat, editing the team and the management page. Pay
 * (`clock.payroll`) is none of an area's: it keeps its own switch.
 */
export const AREA_EDIT: Record<AccessArea, PermissionKey> = {
  scheduling: "schedule.edit",
  time_clock: "clock.edit",
  lists: "lists.manage",
  chat: "chat.moderate",
  team: "team.edit",
  manage: "manage.edit",
};

/** The permission behind view where an area can go down to none. */
export const AREA_VIEW: Record<PlaceArea, PermissionKey> = {
  team: "team.view",
  manage: "manage.view",
};

function isPlaceArea(area: AccessArea): area is PlaceArea {
  return (PLACE_AREAS as readonly AccessArea[]).includes(area);
}

/** An area's permissions: its view (team and manage), its edit, then its switches. */
export function areaPermissions(area: AccessArea): PermissionKey[] {
  return [
    ...(isPlaceArea(area) ? [AREA_VIEW[area]] : []),
    AREA_EDIT[area],
    ...extrasOf(area),
  ];
}

/**
 * What a role may do, as the screen draws it, from what the database says it
 * holds by its role (`held`: `private.role_holds`, which counts what each key
 * requires): an area at edit while it holds the area's edit, else at view
 * while it holds its view (always, in the four modules), else none; a switch
 * on while it holds it.
 */
export function accessFromHeld(held: (key: string) => boolean): RoleAccess {
  const level = (area: AccessArea): AccessLevel => {
    if (held(AREA_EDIT[area])) return "edit";
    if (!isPlaceArea(area) || held(AREA_VIEW[area])) return "view";
    return "none";
  };
  return {
    levels: Object.fromEntries(
      ACCESS_AREAS.map((area) => [area, level(area)]),
    ) as Record<AccessArea, AccessLevel>,
    extras: Object.fromEntries(
      ACCESS_EXTRA_KEYS.map((extra) => [extra, held(extra)]),
    ) as Record<AccessExtra, boolean>,
  };
}

/**
 * What one area at `part` gives the role, key by key, in `areaPermissions`
 * order: the view at view or above, the edit at edit, and a switch at edit
 * while it is on.
 */
export function areaGrants(
  area: AccessArea,
  part: AreaAccess,
): { perm: PermissionKey; granted: boolean }[] {
  const edit = part.level === "edit";
  return areaPermissions(area).map((perm) => {
    if (perm === AREA_EDIT[area]) return { perm, granted: edit };
    if (isPlaceArea(area) && perm === AREA_VIEW[area]) {
      return { perm, granted: levelAtLeast(part.level, "view") };
    }
    return {
      perm,
      granted: edit && part.extras[perm as AccessExtra] === true,
    };
  });
}

/**
 * The areas, of those shown, where `below` holds a permission or a switch
 * that `above` doesn't (`areaGrants`), in their order. For managers above
 * and workers below: only owners and the team give a role that holds what
 * its giver doesn't (`private.role_holds_beyond`, hint 'held'), so while
 * this isn't empty no manager invites a worker or makes someone one. By
 * default it is empty: managers hold all that workers do.
 */
export function heldBeyond(
  above: RoleAccess,
  below: RoleAccess,
  areas: readonly AccessArea[],
): AccessArea[] {
  return areas.filter((area) => {
    const held = new Set(
      areaGrants(area, areaAccess(above, area))
        .filter((grant) => grant.granted)
        .map((grant) => grant.perm),
    );
    return areaGrants(area, areaAccess(below, area)).some(
      (grant) => grant.granted && !held.has(grant.perm),
    );
  });
}

/** A role's rules for keys, before a change. */
export type RoleRules = {
  /** Its rule for the key: its row, else its default. */
  given: (key: string) => boolean;
  /** Its rule without a row: the key's default roles include it. */
  byDefault: (key: string) => boolean;
  /** The key it needs (`public.permission_keys.requires`), or null. */
  requires: (key: string) => string | null;
};

/**
 * The writes (`public.set_role_permissions`, in one go) that bring a role's
 * rules for an area to `part`: those whose rule differs, the denials first,
 * each before the keys it requires (none is refused for what it requires),
 * then the grants, each after the keys it requires, so a grant never meets
 * its requirement missing, and nobody holds more on the way than before or
 * after. A key whose requirement this leaves off holds nothing either way:
 * it keeps a denial or its default as it is, and loses only a grant its
 * default doesn't make, so the rows stay few and an undo (the writes for
 * the area as it was) leaves none behind.
 */
export function areaWrites(
  area: AccessArea,
  part: AreaAccess,
  rules: RoleRules,
): { perm: PermissionKey; granted: boolean }[] {
  const grants = areaGrants(area, part);
  const target = new Map<string, boolean>(
    grants.map(({ perm, granted }) => [perm, granted]),
  );
  // How far down the area's chain a key is: what it requires comes first.
  const depth = (key: string, seen: readonly string[] = []): number => {
    const needs = rules.requires(key);
    if (needs === null || !target.has(needs) || seen.includes(needs)) return 0;
    return 1 + depth(needs, [...seen, key]);
  };
  // Off: a key this leaves off, or one whose requirement it does.
  const off = (key: string, seen: readonly string[] = []): boolean => {
    if (target.get(key) === false) return true;
    const needs = rules.requires(key);
    if (needs === null || !target.has(needs) || seen.includes(needs)) {
      return false;
    }
    return off(needs, [...seen, key]);
  };
  const leftOff = (key: string): boolean => {
    const needs = rules.requires(key);
    return needs !== null && target.has(needs) && off(needs, [key]);
  };
  const differs = ({ perm, granted }: { perm: string; granted: boolean }) =>
    leftOff(perm)
      ? !granted && rules.given(perm) && !rules.byDefault(perm)
      : rules.given(perm) !== granted;
  return grants
    .map((grant, index) => ({ grant, index, depth: depth(grant.perm) }))
    .filter(({ grant }) => differs(grant))
    .sort((a, b) => {
      if (a.grant.granted !== b.grant.granted) return a.grant.granted ? 1 : -1;
      const byDepth = a.grant.granted ? a.depth - b.depth : b.depth - a.depth;
      return byDepth || a.index - b.index;
    })
    .map(({ grant }) => grant);
}

/**
 * Whether an area's choices change: owners switch each of its permissions per
 * role (`public.permission_keys.settable`), which its phase turns on once
 * every check in the area reads them. Until then the screen shows the area
 * as it is, closed.
 */
export function areaOpen(
  area: AccessArea,
  settable: (key: string) => boolean,
): boolean {
  return areaPermissions(area).every(settable);
}

/** One permission as the console's matrix has it (`public.role_permission_matrix`). */
export type MatrixKey = {
  perm: string;
  area: string;
  requires: string | null;
  /** Owners switch it per role (`public.set_role_permission`). */
  settable: boolean;
  /** An owner gives it, on "מי רואה שכר" (pay). */
  byOwner: boolean;
};

/** What a business's managers and workers hold, as the database says. */
export type RoleMatrix = {
  keys: MatrixKey[];
  /** The keys whose default roles include each role: its rule without a row. */
  byDefault: Record<BaseRole, ReadonlySet<string>>;
  /** Each role's own rule for each key: its row, else its default (`private.role_gives`). */
  given: Record<BaseRole, ReadonlySet<string>>;
  /** What each role holds by that rule, with what each key requires (`private.role_holds`). */
  held: Record<BaseRole, ReadonlySet<string>>;
};

/**
 * The matrix from the declarations alone, for a project whose database can't
 * answer yet (its function missing until the migration reaches it): each
 * key's default roles, pay for the roles given it (`payRoles`, the
 * business's rows), and nothing settable, so every area shows today's rules,
 * closed.
 */
export function matrixByDefault(
  catalogue: readonly PermissionEntry[],
  payRoles: readonly BaseRole[],
): RoleMatrix {
  const byKey = new Map<string, PermissionEntry>(
    catalogue.map((entry) => [entry.key, entry]),
  );
  const byDefault = (role: BaseRole, entry: PermissionEntry) =>
    entry.defaultRoles.some((r) => r === role);
  const gives = (role: BaseRole, entry: PermissionEntry) =>
    entry.byOwner ? payRoles.includes(role) : byDefault(role, entry);
  const holds = (
    role: BaseRole,
    key: string,
    seen: readonly string[],
  ): boolean => {
    const entry = byKey.get(key);
    if (!entry || seen.includes(key) || !gives(role, entry)) return false;
    return (
      entry.requires === null || holds(role, entry.requires, [...seen, key])
    );
  };
  const setOf = (
    keep: (role: BaseRole, entry: PermissionEntry) => boolean,
  ): Record<BaseRole, ReadonlySet<string>> => {
    const of = (role: BaseRole): ReadonlySet<string> =>
      new Set<string>(
        catalogue
          .filter((entry) => keep(role, entry))
          .map((entry) => entry.key),
      );
    return { manager: of("manager"), worker: of("worker") };
  };
  return {
    keys: catalogue.map((entry) => ({
      perm: entry.key,
      area: entry.area,
      requires: entry.requires,
      settable: false,
      byOwner: entry.byOwner,
    })),
    byDefault: setOf(byDefault),
    given: setOf(gives),
    held: setOf((role, entry) => holds(role, entry.key, [])),
  };
}

/** How long a name a business gives a role may be. */
export const ROLE_NAME_MAX = 40;

export type RoleNameProblem = "empty" | "long" | "taken";

/**
 * A name for a role a business names itself: trimmed, its spaces single, not
 * empty, at most `ROLE_NAME_MAX` characters, and not one another role
 * already goes by (`taken`, as shown, the built-in roles' names among them).
 */
export function checkRoleName(
  input: string,
  taken: readonly string[],
): { ok: true; name: string } | { ok: false; problem: RoleNameProblem } {
  const name = input.trim().replace(/\s+/g, " ");
  if (name === "") return { ok: false, problem: "empty" };
  if ([...name].length > ROLE_NAME_MAX) return { ok: false, problem: "long" };
  const folded = name.toLocaleLowerCase();
  if (taken.some((other) => other.trim().toLocaleLowerCase() === folded)) {
    return { ok: false, problem: "taken" };
  }
  return { ok: true, name };
}
