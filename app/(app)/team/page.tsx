import { invitesOpen } from "@db/invites";
import { canEditTeam, canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { currentOwnerOnlyRoles, currentTeam } from "../team";
import { baseWording, translator } from "../wording";
import { cancelInviteAction, resendInviteAction } from "./actions";
import { TeamFreshness } from "./team-freshness";
import { TeamView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team");
  return { title: t("title") };
}

// The people in the business, for whoever sees the team (team.view, the
// roles plan's R6: owners and managers by default). Anyone else, a manager
// lowered to none included, gets the not-found screen, as for a module out
// of their reach. Someone who sees it without editing it reads it, and
// changes nothing. A business closed to invites (a demo one) offers no
// invite, no new link and no deleting one (#80). Someone other than an owner
// gets no new link for an invite to a role that holds pay. Deleting is bound
// to this business: one held past a switch is refused.
export default async function TeamPage() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership)) notFound();
  const [team, open, ownerOnly] = await Promise.all([
    currentTeam(),
    invitesOpen(membership.business.id),
    currentOwnerOnlyRoles(),
  ]);
  if (!team) notFound();
  return (
    <>
      {/* Read again when shown after someone was taken off the team. */}
      <TeamFreshness />
      <TeamView
        team={team}
        viewer={membership}
        inviteHref={open ? "/team/invite" : undefined}
        peopleHref="/team"
        resend={resendInviteAction}
        cancel={
          canWrite(member.viewing) && canEditTeam(membership)
            ? cancelInviteAction.bind(null, membership.business.id)
            : undefined
        }
        ownerOnly={ownerOnly}
        wording={await currentWording()}
      />
    </>
  );
}
