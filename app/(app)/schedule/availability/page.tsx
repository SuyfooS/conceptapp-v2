import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentAvailabilityWeek } from "../week";
import { saveAvailabilityAction } from "./actions";
import { AvailabilityView } from "./availability-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.availability");
  return { title: t("title") };
}

// Everyone in a business with scheduling on sends their availability for
// next week here.
export default async function AvailabilityPage() {
  const week = await currentAvailabilityWeek();
  if (!week) notFound();
  return (
    <AvailabilityView
      week={week}
      late={Date.parse(week.dueAt) < Date.now()}
      save={saveAvailabilityAction}
      backHref="/schedule"
    />
  );
}
