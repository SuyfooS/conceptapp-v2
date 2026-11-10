import { invitesOpen } from "@db/invites";
import { canSeeTeam } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { currentTeam } from "../team";
import { baseWording, translator } from "../wording";
import { resendInviteAction } from "./actions";
import { TeamView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team");
  return { title: t("title") };
}

// The people in the business, for owners and managers only. Workers get
// the not-found screen, as for a module out of their reach. A business
// closed to invites (a demo one) offers no invite and no new link (#80).
export default async function TeamPage() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!membership || !canSeeTeam(membership.role)) notFound();
  const [team, open] = await Promise.all([
    currentTeam(),
    invitesOpen(membership.business.id),
  ]);
  if (!team) notFound();
  return (
    <TeamView
      team={team}
      viewerRole={membership.role}
      inviteHref={open ? "/team/invite" : undefined}
      peopleHref="/team"
      resend={resendInviteAction}
      wording={await currentWording()}
    />
  );
}
