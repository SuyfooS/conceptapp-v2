"use server";

import {
  archiveBusinessRole,
  createBusinessRole,
  renameBusinessRole,
  restoreBusinessRole,
  setRoleArea,
  setRoleAreas,
} from "@db/roles";
import { enabledModules, ROLES } from "@domain/modules";
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
import { z } from "zod";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { translator } from "../../wording";
import { rolesAccess } from "./roles";
import type { NewRole, RolesFailure, RolesResult } from "./roles-types";

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
 * The owner puts one area of a role (managers, workers or one the business
 * named, by its id) where the screen says (a change, or the undo of one): its level, never under the area's floor, and
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

/**
 * The owner puts several areas of one role where the screen says, in one
 * write (the roles plan's R10): "חזרה להתחלה", every area of the role that
 * differs from where it started, as it starts, or its undo, each as it was
 * (`parseRoleAreasChange`), every one an area the business has. A view as
 * the owner writes nothing.
 */
export async function setRoleAreasAction(
  business: string,
  role: string,
  parts: AreaPart[],
): Promise<RolesResult> {
  const owner = await writingOwner(business);
  if (!owner.ok) return owner;
  const change = parseRoleAreasChange({ role, parts });
  if (!change) return { ok: false, failure: "failed" };
  const enabled = enabledModules(manifests, owner.rows);
  if (!change.parts.every((part) => areaShown(part.area, enabled))) {
    return { ok: false, failure: "closed" };
  }
  return setRoleAreas(
    owner.userId,
    owner.businessId,
    change.role,
    change.parts,
  );
}

/**
 * The owner of the business the screen was drawn for, able to write: the
 * session's person first, then the bound business, then not a view; with
 * the business's modules (`rows`), for the areas it has.
 */
async function writingOwner(business: string): Promise<
  | {
      ok: true;
      userId: string;
      businessId: string;
      rows: NonNullable<Awaited<ReturnType<typeof rolesAccess>>>["rows"];
    }
  | { ok: false; failure: RolesFailure }
> {
  const owner = await rolesAccess();
  if (!owner) return { ok: false, failure: await refusal(business) };
  const id = businessId.safeParse(business);
  if (!id.success) return { ok: false, failure: "failed" };
  if (owner.businessId !== id.data) {
    return { ok: false, failure: "businessChanged" };
  }
  if (owner.viewOnly) return { ok: false, failure: "viewOnly" };
  return {
    ok: true,
    userId: owner.userId,
    businessId: owner.businessId,
    rows: owner.rows,
  };
}

/**
 * The built-in roles' names in the business's words, which a role it names
 * may not take; the database refuses one another of its roles goes by.
 */
async function builtInNames(): Promise<string[]> {
  const tRoles = translator(await currentWording(), "app.team.roles");
  return ROLES.map((role) => tRoles(role));
}

/**
 * The owner adds a role the business names (the roles plan's R11a; Orel, 15
 * November 2026, answer 1): its name, what it is built on, and the role whose
 * permissions it starts with (`parseNewRole`). Its key is its id.
 */
export async function addRoleAction(
  business: string,
  input: NewRole,
): Promise<{ ok: true; key: string } | { ok: false; failure: RolesFailure }> {
  const owner = await writingOwner(business);
  if (!owner.ok) return owner;
  const role = parseNewRole(input, await builtInNames());
  if (!role.ok) {
    return {
      ok: false,
      failure: role.problem === "taken" ? "taken" : "failed",
    };
  }
  const made = await createBusinessRole(
    owner.userId,
    owner.businessId,
    role.role,
  );
  return made.ok ? { ok: true, key: made.id } : made;
}

/** The owner gives one of the business's named roles a new name. */
export async function renameRoleAction(
  business: string,
  role: string,
  name: string,
): Promise<RolesResult> {
  const owner = await writingOwner(business);
  if (!owner.ok) return owner;
  const renamed = parseRoleRename({ role, name }, await builtInNames());
  if (!renamed.ok) {
    return {
      ok: false,
      failure: renamed.problem === "taken" ? "taken" : "failed",
    };
  }
  return renameBusinessRole(
    owner.userId,
    owner.businessId,
    renamed.role,
    renamed.name,
  );
}

const roleId = z.uuid();

/**
 * The owner archives one of the business's named roles (also the undo of
 * adding it), refused while people hold it ("held").
 */
export async function archiveRoleAction(
  business: string,
  role: string,
): Promise<RolesResult> {
  const owner = await writingOwner(business);
  if (!owner.ok) return owner;
  const id = roleId.safeParse(role);
  if (!id.success) return { ok: false, failure: "failed" };
  return archiveBusinessRole(owner.userId, owner.businessId, id.data);
}

/** The owner brings an archived role back (the undo of archiving it). */
export async function restoreRoleAction(
  business: string,
  role: string,
): Promise<RolesResult> {
  const owner = await writingOwner(business);
  if (!owner.ok) return owner;
  const id = roleId.safeParse(role);
  if (!id.success) return { ok: false, failure: "failed" };
  return restoreBusinessRole(owner.userId, owner.businessId, id.data);
}
