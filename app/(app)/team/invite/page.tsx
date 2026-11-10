import { invitesOpen } from "@db/invites";
import { invitableRoles } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import { inviteAction } from "../actions";
import { TeamInviteView } from "./invite-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team.invite");
  return { title: t("title") };
}

// Invite someone to the business by phone, for owners and managers. Not
// found in a business closed to invites (a demo one, #80), as the Team
// screen offers none there.
export default async function TeamInvitePage() {
  const membership = (await currentMember())?.membership;
  const roles = membership ? invitableRoles(membership.role) : [];
  if (!membership || roles.length === 0) notFound();
  if (!(await invitesOpen(membership.business.id))) notFound();
  return (
    <TeamInviteView
      roles={roles}
      teamHref="/team"
      invite={inviteAction}
      wording={await currentWording()}
    />
  );
}
