"use server";

import { getPlatformStaff } from "@db/admin";
import { setRoleArea } from "@db/roles";
import { consoleRolesAccess } from "@domain/platform";
import {
  ACCESS_AREAS,
  ACCESS_EXTRA_KEYS,
  ACCESS_FLOOR,
  ACCESS_LEVELS,
  type AccessArea,
  type AreaAccess,
  BASE_ROLES,
  levelAtLeast,
} from "@domain/role-access";
import { z } from "zod";
import type { RolesResult } from "@/app/(app)/manage/roles/roles-types";

const areaChange = z.object({
  business: z.uuid(),
  role: z.enum(BASE_ROLES),
  area: z.enum(ACCESS_AREAS),
  access: z.object({
    level: z.enum(ACCESS_LEVELS),
    extras: z.partialRecord(z.enum(ACCESS_EXTRA_KEYS), z.boolean()),
  }),
});

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
 * (permission_keys.settable).
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
 * floor, and its switches. An area not open for changes writes nothing.
 */
export async function setTeamRoleAreaAction(
  business: string,
  role: string,
  area: AccessArea,
  access: AreaAccess,
): Promise<RolesResult> {
  const parsed = areaChange.safeParse({ business, role, area, access });
  if (!parsed.success) return { ok: false, failure: "failed" };
  const change = parsed.data;
  if (!levelAtLeast(change.access.level, ACCESS_FLOOR[change.area])) {
    return { ok: false, failure: "failed" };
  }
  const staff = await rolesChanger();
  if (!staff.ok) return staff;
  return setRoleArea(
    staff.userId,
    change.business,
    change.role,
    change.area,
    change.access,
  );
}
