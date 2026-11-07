import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { closesOnShabbat, manageAccess, modulesToManage } from "./manage";
import { ManageView } from "./manage-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.manage");
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
      needsCity={
        closesOnShabbat(access.rows) && access.details.shabbatCity === null
      }
    />
  );
}
