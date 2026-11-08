import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { clockPaths, currentClockHistory } from "../clock";
import { HistoryView } from "./history-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.clock.history");
  return { title: t("title") };
}

export default async function ClockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const data = await currentClockHistory(month);
  if (!data) notFound();
  return (
    <HistoryView
      data={data}
      paths={clockPaths}
      wording={await currentWording()}
    />
  );
}
