import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentClockHistory } from "../clock";
import { HistoryView } from "./history-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.clock.history");
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
      paths={{ clock: "/clock", history: "/clock/history" }}
    />
  );
}
