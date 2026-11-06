import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentPublishedSchedule } from "../week";
import { swapAction } from "./actions";
import { MyShiftsView } from "./my-shifts-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.shifts");
  return { title: t("title") };
}

// Everyone in the business: their own next shifts and the published
// schedule of the whole team. Drafts stay with the managers (RLS).
export default async function MyShiftsPage() {
  const data = await currentPublishedSchedule();
  if (!data) notFound();
  return <MyShiftsView data={data} swap={swapAction} />;
}
