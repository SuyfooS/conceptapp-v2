import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import { currentScheduleBuild } from "../week";
import { saveScheduleAction } from "./actions";
import { ScheduleBuildView } from "./schedule-build-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.build");
  return { title: t("title") };
}

// Owners and managers build next week's schedule here. Workers get the
// not-found screen, as on the team availability screen.
export default async function ScheduleBuildPage() {
  const data = await currentScheduleBuild();
  if (!data) notFound();
  return (
    <ScheduleBuildView
      data={data}
      save={saveScheduleAction}
      wording={await currentWording()}
    />
  );
}
