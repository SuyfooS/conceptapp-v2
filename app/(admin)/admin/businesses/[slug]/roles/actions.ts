"use server";

import { getPlatformStaff } from "@db/admin";
import { getBusinessModulesForTeam } from "@db/module-settings";
import {
  archiveBusinessRole,
  createBusinessRole,
  renameBusinessRole,
  restoreBusinessRole,
  setRoleArea,
  setRoleAreas,
} from "@db/roles";
import { enabledModules, ROLES } from "@domain/modules";
import { consoleRolesAccess } from "@domain/platform";
import {
  type AccessArea,
  type AreaAccess,
  type AreaPart,
  areaShown,
  parseNewRole,
  parseRoleAreaChange,
  parseRoleAreasChange,
  parseRoleRename,
} from "@domain/role-access";
import { manifests } from "@modules/registry";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type {
  NewRole,
  RolesFailure,
  RolesResult,
} from "@/app/(app)/manage/roles/roles-types";

const businessId = z.uuid();

/*
 * Roles and permissions, from the console (the roles plan's R2; Orel, 15
 * November 2026, Q5: the owner, and the ConceptApp team from the console).
 * The screen keeps what it shows itself, so nothing here reads the page
 * again; its undo is one more change, putting the area back. The action is
 * bound on the page to the business it was drawn for, and checks the team
 * member again: the page's checks are never trusted. The writes name the
 * team member as their actor, so the business's log says the ConceptApp team
 * did it, and the database checks again that they are on the team
 * (private.check_permission_giver) and that the area is open
 * (permission_keys.settable). An area whose module is off is not on the
 * screen, and is written no more than it is drawn ("closed"). The owner's own
 * screen does the same from the app (/manage/roles, R9).
 */

/**
 * The team member signed in, when their role may change roles' permissions
 * (`consoleRolesAccess`): its failure otherwise, "viewOnly" for a role that
 * only reads businesses.
 */
async function rolesChanger(): Promise<
  { ok: true; userId: string } | { ok: false; failure: "noAccess" | "viewOnly" }
> {
  const staff = await getPlatformStaff();
  const may = consoleRolesAccess(staff?.role ?? null);
  if (!staff || may === null) return { ok: false, failure: "noAccess" };
  if (may !== "change") return { ok: false, failure: "viewOnly" };
  return { ok: true, userId: staff.userId };
}

/**
 * Someone on the team puts one area of a role (managers, workers or one the
 * business named, by its id) where the screen says (a change, or the undo of
 * one): its level, never under the area's
 * floor, and its switches (`parseRoleAreaChange`). An area not open for
 * changes writes nothing, nor one the business hasn't (`areaShown`).
 */
export async function setTeamRoleAreaAction(
  business: string,
  role: string,
  area: AccessArea,
  access: AreaAccess,
): Promise<RolesResult> {
  const id = businessId.safeParse(business);
  const change = parseRoleAreaChange({ role, area, access });
  if (!id.success || !change) return { ok: false, failure: "failed" };
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  // Read with the secret key, only now that they are on the team.
  const modules = await getBusinessModulesForTeam(id.data);
  if (!areaShown(change.area, enabledModules(manifests, modules))) {
    return { ok: false, failure: "closed" };
  }
  return setRoleArea(
    staff.userId,
    id.data,
    change.role,
    change.area,
    change.access,
  );
}

/**
 * Someone on the team puts several areas of one role where the screen says,
 * in one write (the roles plan's R10): "חזרה להתחלה", or its undo
 * (`parseRoleAreasChange`), every one an area the business has.
 */
export async function setTeamRoleAreasAction(
  business: string,
  role: string,
  parts: AreaPart[],
): Promise<RolesResult> {
  const id = businessId.safeParse(business);
  const change = parseRoleAreasChange({ role, parts });
  if (!id.success || !change) return { ok: false, failure: "failed" };
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  // Read with the secret key, only now that they are on the team.
  const enabled = enabledModules(
    manifests,
    await getBusinessModulesForTeam(id.data),
  );
  if (!change.parts.every((part) => areaShown(part.area, enabled))) {
    return { ok: false, failure: "closed" };
  }
  return setRoleAreas(staff.userId, id.data, change.role, change.parts);
}

/**
 * The built-in roles' names as the console shows them, which a role the
 * business names may not take; the database refuses one another of its roles
 * goes by.
 */
async function builtInNames(): Promise<string[]> {
  const tRoles = await getTranslations("app.team.roles");
  return ROLES.map((role) => tRoles(role));
}

/**
 * Someone on the team adds a role the business names (the roles plan's
 * R11a; Orel, 15 November 2026, answers 1 and 5): its name, what it is built
 * on, and the role whose permissions it starts with (`parseNewRole`). In a
 * demo business too, whose reset takes it away. Its key is its id.
 */
export async function addTeamRoleAction(
  business: string,
  input: NewRole,
): Promise<{ ok: true; key: string } | { ok: false; failure: RolesFailure }> {
  const id = businessId.safeParse(business);
  if (!id.success) return { ok: false, failure: "failed" };
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  const role = parseNewRole(input, await builtInNames());
  if (!role.ok) {
    return {
      ok: false,
      failure: role.problem === "taken" ? "taken" : "failed",
    };
  }
  const made = await createBusinessRole(staff.userId, id.data, role.role);
  return made.ok ? { ok: true, key: made.id } : made;
}

/** Someone on the team gives one of the business's named roles a new name. */
export async function renameTeamRoleAction(
  business: string,
  role: string,
  name: string,
): Promise<RolesResult> {
  const id = businessId.safeParse(business);
  if (!id.success) return { ok: false, failure: "failed" };
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  const renamed = parseRoleRename({ role, name }, await builtInNames());
  if (!renamed.ok) {
    return {
      ok: false,
      failure: renamed.problem === "taken" ? "taken" : "failed",
    };
  }
  return renameBusinessRole(staff.userId, id.data, renamed.role, renamed.name);
}

const roleId = z.uuid();

/**
 * Someone on the team archives one of the business's named roles (also the
 * undo of adding it), refused while people hold it ("held").
 */
export async function archiveTeamRoleAction(
  business: string,
  role: string,
): Promise<RolesResult> {
  const id = businessId.safeParse(business);
  const named = roleId.safeParse(role);
  if (!id.success || !named.success) return { ok: false, failure: "failed" };
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  return archiveBusinessRole(staff.userId, id.data, named.data);
}

/** Someone on the team brings an archived role back (the undo of archiving it). */
export async function restoreTeamRoleAction(
  business: string,
  role: string,
): Promise<RolesResult> {
  const id = businessId.safeParse(business);
  const named = roleId.safeParse(role);
  if (!id.success || !named.success) return { ok: false, failure: "failed" };
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  return restoreBusinessRole(staff.userId, id.data, named.data);
}
