import "server-only";
import type { PermissionEntry } from "@domain/permissions";
import {
  type AccessArea,
  type AreaAccess,
  areaOpen,
  areaWrites,
  BASE_ROLES,
  type BaseRole,
  type MatrixKey,
  matrixByDefault,
  type RoleMatrix,
} from "@domain/role-access";
import { z } from "zod";
import { isMissingFunction } from "./missing";
import { getPayRolesForTeam } from "./payroll";
import { createAdminClient } from "./supabase/admin";

/*
 * Roles and permissions by module (the roles plan's R2). What a business's
 * managers and workers hold, read with the secret key for the console
 * (`public.role_permission_matrix`), and the per-role switches of one area
 * (`public.set_role_permissions`, each as `public.set_role_permission`),
 * written for `actor`, whom the database checks is an owner of the business
 * or on the ConceptApp team. Callers check first that the person is on the
 * team (`consoleRolesAccess`), as the console's "מי רואה שכר" does.
 */

// Generated types lose nullability for function results, so the rows are
// checked here.
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
});

function matrixOf(rows: readonly z.output<typeof MatrixRow>[]): RoleMatrix {
  const keys = new Map<string, MatrixKey>();
  const byDefault = { manager: new Set<string>(), worker: new Set<string>() };
  const given = { manager: new Set<string>(), worker: new Set<string>() };
  const held = { manager: new Set<string>(), worker: new Set<string>() };
  for (const row of rows) {
    keys.set(row.perm, {
      perm: row.perm,
      area: row.area,
      requires: row.requires,
      settable: row.settable,
      byOwner: row.by_owner,
    });
    if (row.by_default) byDefault[row.role].add(row.perm);
    if (row.given) given[row.role].add(row.perm);
    if (row.held) held[row.role].add(row.perm);
  }
  return { keys: [...keys.values()], byDefault, given, held };
}

/**
 * The business's matrix as the database answers it, or null while the
 * function is missing on the project (before 20261115000800_roles_setter.sql
 * reaches it). An admin read: callers check the team member first.
 */
async function readMatrix(businessId: string): Promise<RoleMatrix | null> {
  const { data, error } = await createAdminClient().rpc(
    "role_permission_matrix",
    { business: businessId },
  );
  if (isMissingFunction(error)) return null;
  if (error) throw error;
  return matrixOf(z.array(MatrixRow).parse(data));
}

/**
 * What the business's managers and workers hold, for the console's
 * "תפקידים והרשאות": the database's answer, or, before its migration, the
 * declarations' defaults with the business's pay rows, nothing open for
 * changes (`matrixByDefault`).
 */
export async function getRoleMatrixForTeam(
  businessId: string,
  catalogue: readonly PermissionEntry[],
): Promise<RoleMatrix> {
  const matrix = await readMatrix(businessId);
  if (matrix) return matrix;
  return matrixByDefault(catalogue, await getPayRolesForTeam(businessId));
}

export type RoleWriteFailure = "noAccess" | "closed" | "requires" | "failed";

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
 * `actor` puts one area of a role at `part` (a change on "תפקידים והרשאות",
 * or its undo): the business's rules for the role are read again, and the
 * permissions of the area whose rule differs are written in one call, one
 * transaction (`public.set_role_permissions`), in the order `areaWrites`
 * gives, so a refusal of any of them leaves the area as it was and nobody
 * holds a step between. An area not open for changes writes nothing
 * ("closed"), and one already so writes nothing either.
 */
export async function setRoleArea(
  actorId: string,
  businessId: string,
  role: BaseRole,
  area: AccessArea,
  part: AreaAccess,
): Promise<RoleWriteResult> {
  const matrix = await readMatrix(businessId);
  if (!matrix) return { ok: false, failure: "closed" };
  const keys = new Map(matrix.keys.map((key) => [key.perm, key]));
  if (!areaOpen(area, (perm) => keys.get(perm)?.settable === true)) {
    return { ok: false, failure: "closed" };
  }
  const given = matrix.given[role];
  const byDefault = matrix.byDefault[role];
  const writes = areaWrites(area, part, {
    given: (perm) => given.has(perm),
    byDefault: (perm) => byDefault.has(perm),
    requires: (perm) => keys.get(perm)?.requires ?? null,
  });
  if (writes.length === 0) return { ok: true };
  const { error } = await createAdminClient().rpc("set_role_permissions", {
    actor: actorId,
    business: businessId,
    grant_role: role,
    perm_keys: writes.map((write) => write.perm),
    granted: writes.map((write) => write.granted),
  });
  if (error) return { ok: false, failure: writeFailure(error) };
  return { ok: true };
}
