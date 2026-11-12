import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentPushAsk } from "../../notifications/push-ask-offer";
import { baseWording, translator } from "../../wording";
import { currentAvailabilityWeek } from "../week";
import { saveAvailabilityAction } from "./actions";
import { AvailabilityView } from "./availability-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.availability");
  return { title: t("title") };
}

// Everyone in a business with scheduling on sends their availability for
// next week here. Once it's sent, the first time, the offer of
// notifications on the phone.
export default async function AvailabilityPage() {
  const week = await currentAvailabilityWeek();
  if (!week) notFound();
  const [wording, ask] = await Promise.all([
    currentWording(),
    currentPushAsk(),
  ]);
  return (
    <AvailabilityView
      week={week}
      late={Date.parse(week.dueAt) < Date.now()}
      save={saveAvailabilityAction}
      backHref="/schedule"
      wording={wording}
      ask={ask}
    />
  );
}
