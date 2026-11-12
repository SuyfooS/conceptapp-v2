import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentPushAsk } from "../../notifications/push-ask-offer";
import { baseWording, translator } from "../../wording";
import { currentPublishedSchedule } from "../week";
import { swapAction } from "./actions";
import { MyShiftsView } from "./my-shifts-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.shifts");
  return { title: t("title") };
}

// Everyone in the business: their own next shifts and the published
// schedule of the whole team. Drafts stay with the managers (RLS). After
// giving a shift away, once, the offer of notifications on the phone.
export default async function MyShiftsPage() {
  const data = await currentPublishedSchedule();
  if (!data) notFound();
  const [wording, ask] = await Promise.all([
    currentWording(),
    currentPushAsk(),
  ]);
  return (
    <MyShiftsView data={data} swap={swapAction} wording={wording} ask={ask} />
  );
}
