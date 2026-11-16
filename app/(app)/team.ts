import { getPayRolesForTeam } from "@db/payroll";
import { getTeam } from "@db/team";
import type { Role } from "@domain/modules";
import { buildsSchedule } from "@domain/schedule";
import {
  buildTeam,
  canEditTeam,
  canSeeTeam,
  ownerOnlyRoles,
  type Team,
} from "@domain/team";
import { cache } from "react";
import { currentMember } from "./member";

/**
 * The signed-in person's team, read once per request: null unless they see
 * the team screen (`canSeeTeam`: team.view as the database answers it, the
 * roles plan's R6; owners and managers by default). The database reads
 * them the numbers and the invites by the same rule.
 */
export const currentTeam = cache(async (): Promise<Team | null> => {
  const member = await currentMember();
  const membership = member?.membership;
  if (!membership || !canSeeTeam(membership)) return null;
  const { members, invites } = await getTeam(membership.business.id);
  return buildTeam(members, invites, new Date());
});

/**
 * The team as whoever builds the schedule reads it (`buildsSchedule`:
 * `schedule.edit` as the database answers it, the roles plan's R3), once per
 * request: everyone in the business, to put on shifts and to read the
 * availability of. For someone who sees the team it is the team screen's
 * own; for anyone else who builds it, the same people without the invites,
 * which stay with the team screen (and its numbers, which the database gives
 * them none of). Null for someone who doesn't build the schedule.
 */
export const currentScheduleTeam = cache(async (): Promise<Team | null> => {
  const member = await currentMember();
  const membership = member?.membership;
  if (!membership || !buildsSchedule(membership)) return null;
  if (canSeeTeam(membership)) return currentTeam();
  const { members } = await getTeam(membership.business.id);
  return buildTeam(members, [], new Date());
});

/**
 * The roles only an owner gives in the signed-in person's business, for
 * someone who edits the team without being one (`ownerOnlyRoles`: those that
 * hold pay by a row, the roles plan's R6), once per request, so the screens
 * offer none of them. Read with the secret key (`getPayRolesForTeam`): only
 * an owner reads the rows. Empty for an owner, and for anyone who changes
 * nothing on the team.
 */
export const currentOwnerOnlyRoles = cache(async (): Promise<Role[]> => {
  const membership = (await currentMember())?.membership;
  if (!membership || membership.role === "owner" || !canEditTeam(membership)) {
    return [];
  }
  return ownerOnlyRoles(
    membership,
    await getPayRolesForTeam(membership.business.id),
  );
});
