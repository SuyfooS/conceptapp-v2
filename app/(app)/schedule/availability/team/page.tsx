import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { baseWording, translator } from "../../../wording";
import { currentTeamAvailability } from "../../week";
import { TeamAvailabilityView } from "./team-availability-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.availability.team");
  return { title: t("title") };
}

// Next week's availability for the whole team, for owners and managers.
// Workers get the not-found screen, as on the Team screen.
export default async function TeamAvailabilityPage() {
  const data = await currentTeamAvailability();
  if (!data) notFound();
  return (
    <TeamAvailabilityView
      data={data}
      backHref="/schedule"
      wording={await currentWording()}
    />
  );
}
