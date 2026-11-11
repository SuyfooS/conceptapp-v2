import { getTeamYouth } from "@db/payroll-details";
import { getTeamPerson } from "@db/team";
import { isUuid } from "@domain/activity";
import { isStaff } from "@domain/modules";
import { mayClearBio } from "@domain/profile";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { chatAccess } from "../../chat/chat-access";
import { chatPaths } from "../../chat/chat-paths";
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
  const [data, youth, wording, chat] = await Promise.all([
    getTeamPerson(membership.business.id, person),
    // Who is a minor, and until when: the schedule needs it (payroll P5).
    getTeamYouth(membership.business.id),
    currentWording(),
    chatAccess(),
  ]);
  if (!data) notFound();
  // A message to someone on the staff, from someone in chat; never while
  // viewing as someone, who reads no chat.
  const messageHref =
    chat && !chat.viewing && isStaff(data.role)
      ? chatPaths.withPerson(data.userId)
      : null;
  return (
    <PersonView
      data={data}
      youthUntil={youth.get(data.userId) ?? null}
      timeZone={membership.business.place.timeZone}
      canClear={
        canWrite(member.viewing) && mayClearBio(membership.role, data.role)
      }
      // For this business only: a delete held past a switch is refused.
      clearBio={clearBioAction.bind(null, membership.business.id)}
      teamHref="/team"
      messageHref={messageHref}
      wording={wording}
    />
  );
}
