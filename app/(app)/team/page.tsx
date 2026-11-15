import { invitesOpen } from "@db/invites";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { currentTeam } from "../team";
import { baseWording, translator } from "../wording";
import { cancelInviteAction, resendInviteAction } from "./actions";
import { TeamFreshness } from "./team-freshness";
import { TeamView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team");
  return { title: t("title") };
}

// The people in the business, for owners and managers only. Workers get
// the not-found screen, as for a module out of their reach. A business
// closed to invites (a demo one) offers no invite, no new link and no
// deleting one (#80). Deleting is bound to this business: one held past a
// switch is refused.
export default async function TeamPage() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) notFound();
  const [team, open] = await Promise.all([
    currentTeam(),
    invitesOpen(membership.business.id),
  ]);
  if (!team) notFound();
  return (
    <>
      {/* Read again when shown after someone was taken off the team. */}
      <TeamFreshness />
      <TeamView
        team={team}
        viewerRole={membership.role}
        inviteHref={open ? "/team/invite" : undefined}
        peopleHref="/team"
        resend={resendInviteAction}
        cancel={
          canWrite(member.viewing)
            ? cancelInviteAction.bind(null, membership.business.id)
            : undefined
        }
        wording={await currentWording()}
      />
    </>
  );
}
