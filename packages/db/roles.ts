import "server-only";
import { ROLES, type Role } from "@domain/modules";
import type { PermissionEntry } from "@domain/permissions";
import { profilePhotoSrc } from "@domain/profile-photos";
import {
  type AccessArea,
  type AreaAccess,
  type AreaPart,
  areaOpen,
  areasWrites,
  BASE_ROLES,
  isBaseRole,
  type MatrixKey,
  matrixByDefault,
  type NamedRoleRules,
  type NewRoleInput,
  type RoleKey,
  type RoleMatrix,
  rulesOf,
} from "@domain/role-access";
import type { GivableNamedRole } from "@domain/team";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { memberNames, nameIn } from "./member-names";
import { isMissingColumn, isMissingFunction } from "./missing";
import { readAllPages } from "./pages";
import { getPayRolesForTeam } from "./payroll";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Roles and permissions by module (the roles plan's R2, R9, R10 and R11a).
 * What a business's managers, workers and named roles hold, read with the
 * secret key (`public.role_permission_matrix`), the per-role switches of one
 * area, or of several at once ("חזרה להתחלה", R10)
 * (`public.set_role_permissions`, each as `public.set_role_permission`), and
 * the roles a business names itself (`public.create_business_role`,
 * `rename_business_role`, `archive_business_role`, `restore_business_role`),
 * written for `actor`, whom the database checks is an owner of the business
 * or on the ConceptApp team. Callers check that person first: the console
 * that they are on the team (`consoleRolesAccess`), as its "מי רואה שכר"
 * does; the owner's screen in the app (/manage/roles) that the session's
 * person is an owner of the business (`changesPermissions`), or the team
 * viewing it as one, which reads and never writes.
 */

// Generated types lose nullability for function results, so the rows are
// checked here. Before 20261115001500_named_roles.sql reaches a project the
// function has no named roles' columns: every row is a manager's or a
// worker's, and no role can be added.
const MatrixRow = z.object({
  role: z.enum(BASE_ROLES),
  perm: z.string(),
  area: z.string(),
  requires: z.string().nullable(),
  settable: z.boolean(),
  by_owner: z.boolean(),
  by_default: z.boolean(),
  given: z.boolean(),
  held: z.boolean(),
  named_role: z.uuid().nullable().optional(),
  role_name: z.string().nullable().optional(),
  role_name_en: z.string().nullable().optional(),
});

type MatrixRowOf = z.output<typeof MatrixRow>;

function matrixOf(rows: readonly MatrixRowOf[]): RoleMatrix {
  const keys = new Map<string, MatrixKey>();
  const byDefault = { manager: new Set<string>(), worker: new Set<string>() };
  const given = { manager: new Set<string>(), worker: new Set<string>() };
  const held = { manager: new Set<string>(), worker: new Set<string>() };
  // In the function's order: the business's own order of its roles.
  const named = new Map<
    string,
    NamedRoleRules & {
      byDefault: Set<string>;
      given: Set<string>;
      held: Set<string>;
    }
  >();
  for (const row of rows) {
    keys.set(row.perm, {
      perm: row.perm,
      area: row.area,
      requires: row.requires,
      settable: row.settable,
      byOwner: row.by_owner,
    });
    if (row.named_role) {
      let role = named.get(row.named_role);
      if (!role) {
        role = {
          id: row.named_role,
          name: row.role_name ?? "",
          nameEn: row.role_name_en ?? null,
          base: row.role,
          byDefault: new Set(),
          given: new Set(),
          held: new Set(),
        };
        named.set(row.named_role, role);
      }
      if (row.by_default) role.byDefault.add(row.perm);
      if (row.given) role.given.add(row.perm);
      if (row.held) role.held.add(row.perm);
      continue;
    }
    if (row.by_default) byDefault[row.role].add(row.perm);
    if (row.given) given[row.role].add(row.perm);
    if (row.held) held[row.role].add(row.perm);
  }
  return {
    keys: [...keys.values()],
    byDefault,
    given,
    held,
    named: [...named.values()],
    addsRoles: rows.some((row) => row.named_role !== undefined),
  };
}

/**
 * The business's matrix as the database answers it, or null while the
 * function is missing on the project (before 20261115000800_roles_setter.sql
 * reaches it). An admin read: callers check the team member first.
 */
async function readMatrix(businessId: string): Promise<RoleMatrix | null> {
  // bounded: 22 roles at most (20 named) times the keys, about 20.
  const { data, error } = await createAdminClient().rpc(
    "role_permission_matrix",
    { business: businessId },
  );
  if (isMissingFunction(error)) return null;
  if (error) throw error;
  return matrixOf(z.array(MatrixRow).parse(data));
}

/**
 * What the business's managers, workers and named roles hold: the
 * database's answer, or, before its migration, the declarations' defaults
 * with the business's pay rows, nothing open for changes
 * (`matrixByDefault`). Read with the secret key, as the function is the
 * service role's alone.
 */
async function roleMatrix(
  businessId: string,
  catalogue: readonly PermissionEntry[],
): Promise<RoleMatrix> {
  const matrix = await readMatrix(businessId);
  if (matrix) return matrix;
  return matrixByDefault(catalogue, await getPayRolesForTeam(businessId));
}

/**
 * The matrix for the console's "תפקידים והרשאות". Callers check first that
 * the person is on the ConceptApp team (`consoleRolesAccess`).
 */
export async function getRoleMatrixForTeam(
  businessId: string,
  catalogue: readonly PermissionEntry[],
): Promise<RoleMatrix> {
  return roleMatrix(businessId, catalogue);
}

/**
 * The same, for the owner's own "תפקידים והרשאות" (/manage/roles, the roles
 * plan's R9): what the business's roles hold says nothing about any person,
 * and the owner already reads the rules it comes from (the
 * `public.role_permissions` policy) and the names of its roles (members
 * read `public.business_roles`), so no policy is widened for it. Callers
 * check first, from the session, that the person is an owner of this
 * business, or the team viewing it as one (`changesPermissions`).
 */
export async function getRoleMatrixForOwner(
  businessId: string,
  catalogue: readonly PermissionEntry[],
): Promise<RoleMatrix> {
  return roleMatrix(businessId, catalogue);
}

/**
 * The business's live named roles as the team's screens give them (the
 * roles plan's R11b): each with the permissions owners switch per role that
 * it holds by its role, so `givesNamedRole` can say who else gives it, as
 * `private.role_holds_beyond` does. None until the database gives them
 * (20261115001600_named_roles_give.sql: `invites.named_role`), so a screen
 * never offers what it can't write. What a role holds says nothing about any
 * person: read with the secret key, as the matrix is the service role's.
 * Callers check first that the session's person edits the business's team
 * (`canEditTeam`).
 */
export async function getGivableNamedRoles(
  businessId: string,
): Promise<GivableNamedRole[]> {
  const matrix = await readMatrix(businessId);
  if (!matrix || matrix.named.length === 0) return [];
  const { error } = await createAdminClient()
    .from("invites")
    .select("named_role")
    .limit(0);
  if (isMissingColumn(error)) return [];
  if (error) throw error;
  const settable = new Set(
    matrix.keys.filter((key) => key.settable).map((key) => key.perm),
  );
  return matrix.named.map((role) => ({
    id: role.id,
    name: role.name,
    nameEn: role.nameEn,
    base: role.base,
    holds: [...role.held].filter((perm) => settable.has(perm)).sort(),
  }));
}

/** Someone active in the business, by their role and the named role they hold. */
export type RolePeopleRow = {
  userId: string;
  name: string | null;
  photo: string | null;
  role: Role;
  /** The role the business named that they hold (from R11b); null for none. */
  namedRole: string | null;
};

const RolePersonRow = z.object({
  user_id: z.string(),
  role: z.enum(ROLES),
  named_role: z.uuid().nullable().optional(),
  profiles: z
    .object({
      full_name: z.string().nullable(),
      avatar_path: z.string().nullable(),
    })
    .nullable(),
});

/**
 * The business's active people with their roles and named roles, read with
 * `supabase`: with their photos for the owner, whose browser may load their
 * colleagues' (Storage), and without for the team, who may not. Each by the
 * business's name for them. Before 20261115001500_named_roles.sql there is
 * no named role to read, and nobody holds one.
 */
async function readRolePeople(
  supabase: SupabaseClient<Database>,
  businessId: string,
  photos: boolean,
): Promise<RolePeopleRow[]> {
  // One row a person on the staff, and nothing caps how many: page by page.
  const people = (named: boolean) =>
    readAllPages((first, last) =>
      supabase
        .from("memberships")
        .select(
          named
            ? "user_id, role, named_role, profiles (full_name, avatar_path)"
            : "user_id, role, profiles (full_name, avatar_path)",
        )
        .eq("business_id", businessId)
        .eq("active", true)
        .order("user_id")
        .range(first, last),
    );
  const [first, names] = await Promise.all([
    people(true),
    memberNames(supabase, businessId),
  ]);
  let { data, error } = first;
  if (isMissingColumn(error)) ({ data, error } = await people(false));
  if (error) throw error;
  return z
    .array(RolePersonRow)
    .parse(data ?? [])
    .map((row) => ({
      userId: row.user_id,
      name: nameIn(names, row.user_id, row.profiles?.full_name),
      photo: photos ? profilePhotoSrc(row.profiles?.avatar_path) : null,
      role: row.role,
      namedRole: row.named_role ?? null,
    }));
}

/**
 * Who is in each role, for the owner's "תפקידים והרשאות", with their photos,
 * under RLS as the signed-in person, as "מי רואה שכר" reads them
 * (`getAccessPeople`): a member reads their business's team and its
 * `named_role`, and the team viewing it as its owner reads it too, so no
 * policy is widened and a business the person isn't in reads as nobody.
 * Callers check first that the session's person is the business's owner.
 */
export async function getRolePeopleForOwner(
  businessId: string,
): Promise<RolePeopleRow[]> {
  return readRolePeople(await createClient(), businessId, true);
}

/**
 * Who is in each role, for the console's, by initials. Read with the secret
 * key: the team isn't a member, so RLS has nothing to show it. Callers check
 * first that the person is on the ConceptApp team.
 */
export async function getRolePeopleForTeam(
  businessId: string,
): Promise<RolePeopleRow[]> {
  return readRolePeople(createAdminClient(), businessId, false);
}

/** How many open invites name each of a business's named roles, by its id. */
export type RoleInvites = ReadonlyMap<string, number>;

/**
 * How many invites nobody claimed, and that still wait, name each of the
 * business's named roles (the roles plan's R11b), read with `supabase`: an
 * open invite holds a role as a person does, so it can't be archived
 * (`public.archive_business_role`, 55000 `held`), and the screen says so
 * before it is tried. One waits while its link is open, or, with no link made
 * yet (`link_pending`, a list's or the wizard's), whatever its date, as the
 * archive counts it since 20261128000300_people_import.sql. Before
 * 20261128000200_invite_links_pending.sql reaches a project there is no
 * `link_pending`, and the open links alone are counted; none before
 * 20261115001600_named_roles_give.sql, when no invite names one.
 */
async function readRoleInvites(
  supabase: SupabaseClient<Database>,
  businessId: string,
  now: Date,
): Promise<RoleInvites> {
  const at = now.toISOString();
  let read = await readAllPages((first, last) =>
    supabase
      .from("invites")
      .select("named_role")
      .eq("business_id", businessId)
      .is("claimed_at", null)
      .or(`link_pending.is.true,expires_at.gt.${at}`)
      .not("named_role", "is", null)
      .order("id")
      .range(first, last),
  );
  if (isMissingColumn(read.error)) {
    // Before link_pending: every invite got its link, so its date says.
    read = await readAllPages((first, last) =>
      supabase
        .from("invites")
        .select("named_role")
        .eq("business_id", businessId)
        .is("claimed_at", null)
        .gt("expires_at", at)
        .not("named_role", "is", null)
        .order("id")
        .range(first, last),
    );
  }
  const { data, error } = read;
  if (isMissingColumn(error)) return new Map();
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data) {
    if (row.named_role) {
      counts.set(row.named_role, (counts.get(row.named_role) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The same, for the owner's "תפקידים והרשאות", under RLS as the signed-in
 * person: whoever sees the team reads its invites (an owner always), and
 * the team viewing the business as its owner reads them too, so no policy is
 * widened. Callers check first that the session's person is its owner.
 */
export async function getRoleInvitesForOwner(
  businessId: string,
  now: Date = new Date(),
): Promise<RoleInvites> {
  return readRoleInvites(await createClient(), businessId, now);
}

/**
 * The same, for the console's, with the secret key: the team isn't a member.
 * Callers check first that the person is on the ConceptApp team.
 */
export async function getRoleInvitesForTeam(
  businessId: string,
  now: Date = new Date(),
): Promise<RoleInvites> {
  return readRoleInvites(createAdminClient(), businessId, now);
}

/** How many of a business's live lists go to each of its named roles, by its id. */
export type RoleLists = ReadonlyMap<string, number>;

/**
 * How many of the business's live templates send lists to each of its named
 * roles (the roles plan's R11d): one that goes to it when nobody chooses, or
 * has a time, on or paused, that sends to it, each counted once. They hold
 * the role back from the archive as its people do
 * (`public.archive_business_role`, 55000 `lists`), so the screen says so
 * before it is tried. Read with the secret key, as the matrix is, so the
 * count is the database's whether lists are on or not: where a template
 * goes says nothing about any person, and an owner reads these templates
 * and times anyway while lists are on. None before
 * 20261115001900_named_roles_lists.sql reaches a project, when no list goes
 * to one.
 */
async function readRoleLists(businessId: string): Promise<RoleLists> {
  const admin = createAdminClient();
  // Archived templates keep their times, so both page by page.
  const [templates, times] = await Promise.all([
    readAllPages((first, last) =>
      admin
        .from("list_templates")
        .select("id, recipient_named_role")
        .eq("business_id", businessId)
        .is("archived_at", null)
        .order("id")
        .range(first, last),
    ),
    readAllPages((first, last) =>
      admin
        .from("list_schedules")
        .select("template_id, recipient_named_role")
        .eq("business_id", businessId)
        .not("recipient_named_role", "is", null)
        .order("id")
        .range(first, last),
    ),
  ]);
  for (const { error } of [templates, times]) {
    if (isMissingColumn(error)) return new Map();
    if (error) throw error;
  }
  // Each live template's roles: its own, and its times'.
  const rolesOf = new Map<string, Set<string>>(
    (templates.data ?? []).map((row) => [
      row.id,
      new Set(row.recipient_named_role ? [row.recipient_named_role] : []),
    ]),
  );
  for (const row of times.data ?? []) {
    if (row.recipient_named_role) {
      rolesOf.get(row.template_id)?.add(row.recipient_named_role);
    }
  }
  const counts = new Map<string, number>();
  for (const roles of rolesOf.values()) {
    for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return counts;
}

/**
 * The same, for the owner's "תפקידים והרשאות". Callers check first, from the
 * session, that the person is an owner of this business, or the team viewing
 * it as one (`changesPermissions`).
 */
export async function getRoleListsForOwner(
  businessId: string,
): Promise<RoleLists> {
  return readRoleLists(businessId);
}

/**
 * The same, for the console's. Callers check first that the person is on
 * the ConceptApp team (`consoleRolesAccess`).
 */
export async function getRoleListsForTeam(
  businessId: string,
): Promise<RoleLists> {
  return readRoleLists(businessId);
}

export type RoleWriteFailure =
  | "noAccess"
  | "closed"
  | "requires"
  /** A role the business named that is archived, or gone, since the screen was drawn. */
  | "gone"
  /** Another live role of the business goes by the name. */
  | "taken"
  /** The business has as many live roles as it may (`ROLE_LIMIT`). */
  | "limit"
  /** People hold the role: it can't be archived. */
  | "held"
  /**
   * A live template, or a time of one, sends lists to the role (the roles
   * plan's R11d): it can't be archived until they go to someone else.
   */
  | "lists"
  | "failed";

export type RoleWriteResult =
  | { ok: true }
  | { ok: false; failure: RoleWriteFailure };

function writeFailure(error: {
  code?: string;
  hint?: string;
  message: string;
}): RoleWriteFailure {
  if (error.code === "42501") return "noAccess";
  // A grant whose requirement the role doesn't hold, or a key nobody
  // switches per role yet (its area's phase hasn't opened it).
  if (error.code === "22023") {
    return error.hint === "requires" ? "requires" : "closed";
  }
  if (isMissingFunction(error)) return "closed";
  console.error("changing a role's permission failed", error.message);
  return "failed";
}

/**
 * Why adding, renaming, archiving or restoring a role was refused: by whom
 * it may be done, a name taken, the business's twenty roles, people in it,
 * lists that go to it, a role gone meanwhile, or, before its migration,
 * nothing to do it with.
 */
function roleFailure(error: {
  code?: string;
  hint?: string;
  message: string;
}): RoleWriteFailure {
  if (error.code === "42501") return "noAccess";
  if (error.code === "23505") return "taken";
  if (error.code === "54000") return "limit";
  if (error.code === "55000" && error.hint === "held") return "held";
  if (error.code === "55000" && error.hint === "lists") return "lists";
  if (error.code === "P0002") return "gone";
  if (isMissingFunction(error)) return "closed";
  console.error("changing a business's role failed", error.message);
  return "failed";
}

/**
 * `actor` puts one area of a role at `part` (a change on "תפקידים והרשאות",
 * or its undo): managers, workers, or a role the business named, by its id.
 * The business's rules for the role are read again, and the permissions of
 * the area whose rule differs are written in one call, one transaction
 * (`public.set_role_permissions`), in the order `areaWrites` gives, so a
 * refusal of any of them leaves the area as it was and nobody holds a step
 * between. A named role's rule without a row of its own is its base's
 * (`byDefault`), so putting a key back on it removes the row. An area not
 * open for changes writes nothing ("closed"), and one already so writes
 * nothing either; a named role archived meanwhile, nothing ("gone"). A
 * switch the matrix doesn't list yet (its migration hasn't reached the
 * project) neither closes its area (`areaOpen`) nor is written.
 */
export async function setRoleArea(
  actorId: string,
  businessId: string,
  role: RoleKey,
  area: AccessArea,
  part: AreaAccess,
): Promise<RoleWriteResult> {
  return setRoleAreas(actorId, businessId, role, [{ area, access: part }]);
}

/**
 * `actor` puts several areas of a role at their parts in one go: "חזרה
 * להתחלה" on "תפקידים והרשאות" (the roles plan's R10: every area of the role
 * that differs from where it started, as it starts) and its undo (each as
 * it was). As `setRoleArea`, area after area (`areasWrites`), in one call,
 * one transaction, so a refusal of any of them leaves the role as it was;
 * nothing is written while any of the areas isn't open for changes.
 */
export async function setRoleAreas(
  actorId: string,
  businessId: string,
  role: RoleKey,
  parts: readonly AreaPart[],
): Promise<RoleWriteResult> {
  const matrix = await readMatrix(businessId);
  if (!matrix) return { ok: false, failure: "closed" };
  const rules = rulesOf(matrix, role);
  if (!rules)
    return { ok: false, failure: isBaseRole(role) ? "closed" : "gone" };
  const keys = new Map(matrix.keys.map((key) => [key.perm, key]));
  if (!parts.every((part) => areaOpen(part.area, matrix.keys))) {
    return { ok: false, failure: "closed" };
  }
  const writes = areasWrites(parts, {
    given: (perm) => rules.given.has(perm),
    byDefault: (perm) => rules.byDefault.has(perm),
    requires: (perm) => keys.get(perm)?.requires ?? null,
    // A switch the app has before its migration reaches the project: never
    // written, as the screen doesn't draw it (`knownExtras`).
    known: (perm) => keys.has(perm),
  });
  if (writes.length === 0) return { ok: true };
  const { error } = await createAdminClient().rpc("set_role_permissions", {
    actor: actorId,
    business: businessId,
    grant_role: rules.base,
    perm_keys: writes.map((write) => write.perm),
    granted: writes.map((write) => write.granted),
    // Only for a named role: a project before its migration takes the rest.
    ...(rules.named ? { grant_named: rules.named.id } : {}),
  });
  if (error) {
    if (rules.named && error.code === "P0002") {
      return { ok: false, failure: "gone" };
    }
    return { ok: false, failure: writeFailure(error) };
  }
  return { ok: true };
}

/**
 * `actor` adds a role to the business (R11a): its name, what it is built on,
 * and the role whose permissions it starts with, managers, workers or
 * another named role (`copyFrom`), pay never among them. Its id.
 */
export async function createBusinessRole(
  actorId: string,
  businessId: string,
  role: NewRoleInput,
): Promise<
  { ok: true; id: string } | { ok: false; failure: RoleWriteFailure }
> {
  const copy = isBaseRole(role.copyFrom)
    ? { copy_role: role.copyFrom }
    : { copy_from: role.copyFrom };
  const { data, error } = await createAdminClient().rpc(
    "create_business_role",
    {
      actor: actorId,
      business: businessId,
      base_role: role.base,
      role_name: role.name,
      ...copy,
    },
  );
  if (error) return { ok: false, failure: roleFailure(error) };
  const id = z.uuid().safeParse(data);
  if (!id.success) return { ok: false, failure: "failed" };
  return { ok: true, id: id.data };
}

type RoleCallError = { code?: string; hint?: string; message: string };

/**
 * One of the business's roles, archived or not, is `roleId`: a change is
 * written only in the business the screen was drawn for, never in another
 * the actor may also own. Before its migration there are no roles to change.
 */
async function roleOfBusiness(
  businessId: string,
  roleId: string,
): Promise<RoleWriteFailure | null> {
  const { data, error } = await createAdminClient()
    .from("business_roles")
    .select("id")
    .eq("id", roleId)
    .eq("business_id", businessId)
    .maybeSingle();
  // PostgREST's and Postgres's "no such table".
  if (error?.code === "PGRST205" || error?.code === "42P01") return "closed";
  if (error) throw error;
  return data ? null : "gone";
}

/** `write` for a role of the business, refused in words. */
async function roleCall(
  businessId: string,
  roleId: string,
  write: () => PromiseLike<{ error: RoleCallError | null }>,
): Promise<RoleWriteResult> {
  const elsewhere = await roleOfBusiness(businessId, roleId);
  if (elsewhere) return { ok: false, failure: elsewhere };
  const { error } = await write();
  if (error) return { ok: false, failure: roleFailure(error) };
  return { ok: true };
}

/** `actor` gives a named role of the business a new name; its English name stays as it is. */
export async function renameBusinessRole(
  actorId: string,
  businessId: string,
  roleId: string,
  name: string,
): Promise<RoleWriteResult> {
  return roleCall(businessId, roleId, () =>
    createAdminClient().rpc("rename_business_role", {
      actor: actorId,
      role_id: roleId,
      role_name: name,
    }),
  );
}

/**
 * `actor` archives a named role of the business, which nobody may hold
 * ("held") and no live template or time may send lists to ("lists").
 */
export async function archiveBusinessRole(
  actorId: string,
  businessId: string,
  roleId: string,
): Promise<RoleWriteResult> {
  return roleCall(businessId, roleId, () =>
    createAdminClient().rpc("archive_business_role", {
      actor: actorId,
      role_id: roleId,
    }),
  );
}

/** `actor` brings an archived role of the business back, with its rules (the archive's undo). */
export async function restoreBusinessRole(
  actorId: string,
  businessId: string,
  roleId: string,
): Promise<RoleWriteResult> {
  return roleCall(businessId, roleId, () =>
    createAdminClient().rpc("restore_business_role", {
      actor: actorId,
      role_id: roleId,
    }),
  );
}
