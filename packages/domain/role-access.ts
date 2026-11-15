import type { ModuleKey } from "./modules";

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
