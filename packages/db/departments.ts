import "server-only";
import {
  type Department,
  type DepartmentInput,
  departments as departmentsSchema,
} from "@domain/departments";
import { isMissingFunction } from "./missing";
import { type Written, written } from "./module-settings";
import { isMissingTable } from "./notifications";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * A business's departments (supabase/migrations/20261109000600_lists.sql).
 * Reads run under RLS: every member reads them, and the team while viewing.
 * Writes run with the secret key for `actorId`, who the database checks is an
 * owner, a manager or on the team; callers check the actor is the signed-in
 * person and not viewing as someone else.
 */

/**
 * The business's departments with their people's ids: live ones first, in
 * their order, then the removed ones (old lists keep their names). "notYet"
 * before the migration reaches the project.
 */
export async function getDepartments(
  businessId: string,
): Promise<Department[] | "notYet"> {
  const supabase = await createClient();
  const [departments, members] = await Promise.all([
    supabase
      .from("departments")
      .select("id, key, name, position, archived_at")
      .eq("business_id", businessId)
      .order("position")
      .order("key"),
    supabase
      .from("department_members")
      .select("department_id, user_id")
      .eq("business_id", businessId),
  ]);
  for (const { error } of [departments, members]) {
    if (error) {
      if (isMissingTable(error)) return "notYet";
      throw error;
    }
  }
  const people = new Map<string, string[]>();
  for (const row of members.data ?? []) {
    people.set(row.department_id, [
      ...(people.get(row.department_id) ?? []),
      row.user_id,
    ]);
  }
  const all = (departments.data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    archivedAt: row.archived_at,
    members: (people.get(row.id) ?? []).sort(),
  }));
  return [
    ...all.filter((d) => d.archivedAt === null),
    ...all.filter((d) => d.archivedAt !== null),
  ];
}

/**
 * Saves the business's departments, in order (`public.set_departments`): a
 * key left out is removed (archived), one that comes back is restored, a new
 * one is added. Checked here first with the rules the database checks.
 */
export async function setDepartments(
  actorId: string,
  businessId: string,
  departments: readonly DepartmentInput[],
): Promise<Written> {
  const parsed = departmentsSchema.safeParse(departments);
  if (!parsed.success) return { ok: false, code: "22023" };
  const { error } = await createAdminClient().rpc("set_departments", {
    actor: actorId,
    business: businessId,
    departments: parsed.data,
  });
  if (isMissingFunction(error)) return { ok: false, code: "notYet" };
  return written(error);
}

/** Replaces a department's people (`public.set_department_members`). */
export async function setDepartmentMembers(
  actorId: string,
  businessId: string,
  departmentId: string,
  members: readonly string[],
): Promise<Written> {
  const { error } = await createAdminClient().rpc("set_department_members", {
    actor: actorId,
    business: businessId,
    department: departmentId,
    members: [...new Set(members)],
  });
  if (isMissingFunction(error)) return { ok: false, code: "notYet" };
  return written(error);
}
