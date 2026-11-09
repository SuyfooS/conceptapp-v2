import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import { clockPaths } from "../../clock";
import { addEntryAction, correctEntryAction } from "../actions";
import { PersonHoursView } from "../person-view";
import { currentPersonHours } from "../team-hours";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.clock.team");
  return { title: t("title") };
}

export default async function ClockPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ person }, { month }] = await Promise.all([params, searchParams]);
  const data = await currentPersonHours(person, month);
  if (!data) notFound();
  return (
    <PersonHoursView
      data={data}
      actions={{ correct: correctEntryAction, add: addEntryAction }}
      paths={clockPaths}
    />
  );
}
