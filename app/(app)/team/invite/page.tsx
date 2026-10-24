import { invitableRoles } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentMember } from "../../member";
import { inviteAction } from "../actions";
import { TeamInviteView } from "./invite-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.team.invite");
  return { title: t("title") };
}

// Invite someone to the business by phone, for owners and managers.
export default async function TeamInvitePage() {
  const member = await currentMember();
  const role = member?.membership?.role;
  const roles = role ? invitableRoles(role) : [];
  if (roles.length === 0) notFound();
  return (
    <TeamInviteView roles={roles} teamHref="/team" invite={inviteAction} />
  );
}
