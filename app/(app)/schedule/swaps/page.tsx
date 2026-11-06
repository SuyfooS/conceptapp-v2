import { canSeeTeam } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentMember } from "../../member";
import { currentPublishedSchedule } from "../week";
import { decideSwapAction } from "./actions";
import { SwapApprovalsView } from "./swap-approvals-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.swaps");
  return { title: t("title") };
}

// Owners and managers approve or decline the shifts colleagues took.
// Workers get the not-found screen, as on the team availability screen.
export default async function SwapApprovalsPage() {
  const [member, data] = await Promise.all([
    currentMember(),
    currentPublishedSchedule(),
  ]);
  const role = member?.membership?.role;
  if (!data || !role || !canSeeTeam(role)) notFound();
  return <SwapApprovalsView data={data} decide={decideSwapAction} />;
}
