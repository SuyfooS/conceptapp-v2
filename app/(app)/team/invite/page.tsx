import { invitesOpen } from "@db/invites";
import { invitableRoles } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { currentOwnerOnlyRoles } from "../../team";
import { baseWording, translator } from "../../wording";
import { inviteAction } from "../actions";
import { TeamInviteView } from "./invite-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team.invite");
  return { title: t("title") };
}

// Invite someone to the business by phone, for whoever edits the team
// (team.edit, the roles plan's R6), to the roles they give by the rank rule,
// but for one that holds pay, which only an owner gives: with none left, the
// screen says so. Not found for anyone else, and in a business closed to
// invites (a demo one, #80), as the Team screen offers none there.
export default async function TeamInvitePage() {
  const membership = (await currentMember())?.membership;
  const invitable = membership ? invitableRoles(membership) : [];
  if (!membership || invitable.length === 0) notFound();
  if (!(await invitesOpen(membership.business.id))) notFound();
  const ownerOnly = await currentOwnerOnlyRoles();
  const roles = invitable.filter((role) => !ownerOnly.includes(role));
  return (
    <TeamInviteView
      roles={roles}
      teamHref="/team"
      invite={inviteAction}
      wording={await currentWording()}
    />
  );
}
