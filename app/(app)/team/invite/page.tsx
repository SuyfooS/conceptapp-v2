import { invitesOpen } from "@db/invites";
import { invitableRoles, namedRoleShown } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { currentGivableNamedRoles, currentOwnerOnlyRoles } from "../../team";
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
// screen says so. The business's named roles follow the role each is built
// on, those the person gives (the roles plan's R11b: an owner any; anyone
// else one holding nothing they don't, and none holds pay). Not found for
// anyone else, and in a business closed to invites (a demo one, #80), as the
// Team screen offers none there.
export default async function TeamInvitePage() {
  const membership = (await currentMember())?.membership;
  if (!membership || invitableRoles(membership).length === 0) notFound();
  if (!(await invitesOpen(membership.business.id))) notFound();
  const [ownerOnly, named] = await Promise.all([
    currentOwnerOnlyRoles(),
    currentGivableNamedRoles(),
  ]);
  const roles = invitableRoles(membership, named).filter(
    (choice) => choice.namedRole !== null || !ownerOnly.includes(choice.role),
  );
  return (
    <TeamInviteView
      roles={roles}
      // Their names only: what each holds stays here, for the giver's rule.
      namedRoles={named.map(namedRoleShown)}
      teamHref="/team"
      invite={inviteAction}
      wording={await currentWording()}
    />
  );
}
