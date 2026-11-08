import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { baseWording, translator } from "../wording";
import { manageAccess, modulesToManage, shabbatCityState } from "./manage";
import { ManageView } from "./manage-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage");
  return { title: t("title") };
}

export default async function ManagePage() {
  const access = await manageAccess();
  if (!access) notFound();
  return (
    <ManageView
      modules={modulesToManage(access.rows)}
      home="/home"
      team="/team"
      shabbatCity={shabbatCityState(access.rows, access.details)}
      wording={await currentWording()}
    />
  );
}
