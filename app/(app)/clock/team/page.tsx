import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { clockPaths } from "../clock";
import { currentTeamHours } from "./team-hours";
import { TeamHoursView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.clock.team");
  return { title: t("title") };
}

export default async function ClockTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const data = await currentTeamHours(month);
  if (!data) notFound();
  return (
    <TeamHoursView
      data={data}
      paths={clockPaths}
      wording={await currentWording()}
    />
  );
}
