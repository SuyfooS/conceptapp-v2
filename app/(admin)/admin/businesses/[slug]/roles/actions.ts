"use server";

import { getPlatformStaff } from "@db/admin";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { setRoleArea } from "@db/roles";
import { enabledModules } from "@domain/modules";
import { consoleRolesAccess } from "@domain/platform";
import {
  type AccessArea,
  type AreaAccess,
  areaShown,
  parseRoleAreaChange,
} from "@domain/role-access";
import { manifests } from "@modules/registry";
import { z } from "zod";
import type { RolesResult } from "@/app/(app)/manage/roles/roles-types";

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
 * Someone on the team puts one area of managers or workers where the screen
 * says (a change, or the undo of one): its level, never under the area's
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
