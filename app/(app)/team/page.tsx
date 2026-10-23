import { canSeeTeam } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentMember } from "../member";
import { currentTeam } from "../team";
import { TeamView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.team");
  return { title: t("title") };
}

// The people in the business, for owners and managers only. Workers get
// the not-found screen, as for a module out of their reach.
export default async function TeamPage() {
  const member = await currentMember();
  const role = member?.membership?.role;
  if (!role || !canSeeTeam(role)) notFound();
  const team = await currentTeam();
  if (!team) notFound();
  return <TeamView team={team} />;
}
