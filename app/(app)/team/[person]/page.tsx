import { getTeamPerson } from "@db/team";
import { isUuid } from "@domain/activity";
import { mayClearBio } from "@domain/profile";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import { clearBioAction } from "../actions";
import { PersonView } from "./person-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team");
  return { title: t("title") };
}

// One colleague's profile, for owners and managers, like the Team screen it
// is reached from. Workers get the not-found screen; the signed-in person's
// own profile is /me.
export default async function TeamPersonPage({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const [{ person }, member] = await Promise.all([params, currentMember()]);
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) notFound();
  if (person === member.userId) redirect("/me");
  if (!isUuid(person)) notFound();
  const [data, wording] = await Promise.all([
    getTeamPerson(membership.business.id, person),
    currentWording(),
  ]);
  if (!data) notFound();
  return (
    <PersonView
      data={data}
      timeZone={membership.business.place.timeZone}
      canClear={
        canWrite(member.viewing) && mayClearBio(membership.role, data.role)
      }
      clearBio={clearBioAction}
      teamHref="/team"
      wording={wording}
    />
  );
}
