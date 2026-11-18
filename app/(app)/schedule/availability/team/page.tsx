import { AVAILABILITY_PATH, availabilityLate } from "@domain/share";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { currentMember } from "../../../member";
import { baseWording, translator } from "../../../wording";
import { currentNextWeekPublished, currentTeamAvailability } from "../../week";
import { TeamAvailabilityView } from "./team-availability-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.availability.team");
  return { title: t("title") };
}

// Next week's availability for the whole team, for owners and managers.
// Workers get the not-found screen, as on the Team screen. Until next week is
// published, a reminder for the team, worded for after the due moment once it
// has passed (late answers are still taken); none while viewing as a role.
export default async function TeamAvailabilityPage() {
  const [data, member, published, wording] = await Promise.all([
    currentTeamAvailability(),
    currentMember(),
    currentNextWeekPublished(),
    currentWording(),
  ]);
  if (!data) notFound();
  const membership = member?.membership;
  return (
    <TeamAvailabilityView
      data={data}
      backHref="/schedule"
      remind={
        member && membership && canWrite(member.viewing) && !published
          ? {
              business: membership.business.name,
              late: availabilityLate(data.week.dueAt, new Date()),
              path: AVAILABILITY_PATH,
            }
          : null
      }
      wording={wording}
    />
  );
}
