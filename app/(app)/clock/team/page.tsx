import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { clockPaths } from "../clock";
import { currentTeamHours } from "./team-hours";
import { TeamHoursView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.clock.team");
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
  return <TeamHoursView data={data} paths={clockPaths} />;
}
