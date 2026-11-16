"use server";

import { setRoleArea } from "@db/roles";
import { enabledModules } from "@domain/modules";
import {
  type AccessArea,
  type AreaAccess,
  areaShown,
  parseRoleAreaChange,
} from "@domain/role-access";
import { manifests } from "@modules/registry";
import { z } from "zod";
import { currentMember } from "../../member";
import { rolesAccess } from "./roles";
import type { RolesFailure, RolesResult } from "./roles-types";

const businessId = z.uuid();

/*
 * Roles and permissions, the owner's (the roles plan's R9; Orel, 15 November
 * 2026, Q5). The screen keeps what it shows itself, so nothing here reads the
 * page again; its undo is one more change, putting the area back as it was.
 * The action is bound on the page to the business the screen was drawn for
 * (payroll P3b, as "מי רואה שכר"): the business the app opens is one cookie
 * for the whole browser, so a change sent from a tab left open after a switch
 * is refused ("businessChanged"), never written in the other business. The
 * owner is checked again from the session before anything is written with
 * the secret key, and the write names them as its actor, so the database
 * checks again that they own the business (private.check_permission_giver)
 * and that the area is open (permission_keys.settable), and the log says who.
 * An area whose module is off is not on the screen, and is written no more
 * than it is drawn ("closed"): the team may have turned it off since.
 */

/**
 * Why someone the session doesn't know as the owner of the business it opens
 * is refused: they moved to another business since the screen was drawn (its
 * owner, say, who is the accountant of the one open now: P3b), so the screen
 * is stale; or they never could change it. Says nothing of any business but
 * the one it opens.
 */
async function refusal(business: string): Promise<RolesFailure> {
  const open = (await currentMember())?.membership?.business.id;
  return open !== undefined && open !== business
    ? "businessChanged"
    : "noAccess";
}

/**
 * The owner puts one area of managers or workers where the screen says (a
 * change, or the undo of one): its level, never under the area's floor, and
 * its switches (`parseRoleAreaChange`), in an area the business has
 * (`areaShown`). A view as the owner writes nothing.
 */
export async function setRoleAreaAction(
  business: string,
  role: string,
  area: AccessArea,
  access: AreaAccess,
): Promise<RolesResult> {
  // The session's person first: an owner of the business it opens.
  const owner = await rolesAccess();
  if (!owner) return { ok: false, failure: await refusal(business) };
  const id = businessId.safeParse(business);
  const change = parseRoleAreaChange({ role, area, access });
  if (!id.success || !change) return { ok: false, failure: "failed" };
  if (owner.businessId !== id.data) {
    return { ok: false, failure: "businessChanged" };
  }
  if (owner.viewOnly) return { ok: false, failure: "viewOnly" };
  if (!areaShown(change.area, enabledModules(manifests, owner.rows))) {
    return { ok: false, failure: "closed" };
  }
  return setRoleArea(
    owner.userId,
    owner.businessId,
    change.role,
    change.area,
    change.access,
  );
}
