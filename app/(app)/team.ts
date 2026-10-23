import { getTeam } from "@db/team";
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
