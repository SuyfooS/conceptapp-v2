import { buildsSchedule, publishesSchedule } from "@domain/schedule";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import { currentPublishedSchedule } from "../week";
import { decideSwapAction } from "./actions";
import { SwapApprovalsView } from "./swap-approvals-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.swaps");
  return { title: t("title") };
}

// Whoever builds the schedule approves or declines the shifts colleagues took
// (Orel's answer 6 of 15 November 2026), and their own only if they publish
// it too (`decidesSwap`). Anyone else gets the not-found screen, as on the
// team availability screen.
export default async function SwapApprovalsPage() {
  const [member, data, wording] = await Promise.all([
    currentMember(),
    currentPublishedSchedule(),
    currentWording(),
  ]);
  const membership = member?.membership;
  if (!data || !membership || !buildsSchedule(membership)) notFound();
  return (
    <SwapApprovalsView
      data={data}
      decide={decideSwapAction}
      publishes={publishesSchedule(membership)}
      wording={wording}
    />
  );
}
