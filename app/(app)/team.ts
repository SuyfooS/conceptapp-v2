import { getTeam } from "@db/team";
import { buildsSchedule } from "@domain/schedule";
import { buildTeam, canSeeTeam, type Team } from "@domain/team";
import { cache } from "react";
import { currentMember } from "./member";

/**
 * The signed-in person's team, read once per request: null unless they
 * are an owner or manager in a business.
 */
export const currentTeam = cache(async (): Promise<Team | null> => {
  const member = await currentMember();
  const membership = member?.membership;
  if (!membership || !canSeeTeam(membership.role)) return null;
  const { members, invites } = await getTeam(membership.business.id);
  return buildTeam(members, invites, new Date());
});

/**
 * The team as whoever builds the schedule reads it (`buildsSchedule`:
 * `schedule.edit` as the database answers it, the roles plan's R3), once per
 * request: everyone in the business, to put on shifts and to read the
 * availability of. For an owner or manager it is the team screen's own; for
 * anyone else who builds it, the same people without the invites, which stay
 * with the team screen (and its numbers, which the database gives them none
 * of). Null for someone who doesn't build the schedule.
 */
export const currentScheduleTeam = cache(async (): Promise<Team | null> => {
  const member = await currentMember();
  const membership = member?.membership;
  if (!membership || !buildsSchedule(membership)) return null;
  if (canSeeTeam(membership.role)) return currentTeam();
  const { members } = await getTeam(membership.business.id);
  return buildTeam(members, [], new Date());
});
