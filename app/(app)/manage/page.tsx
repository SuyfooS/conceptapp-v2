import { getDepartments } from "@db/departments";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { baseWording, translator } from "../wording";
import {
  listsOn,
  manageAccess,
  modulesToManage,
  shabbatCityState,
} from "./manage";
import { ManageView } from "./manage-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.manage");
  return { title: t("title") };
}

export default async function ManagePage() {
  const access = await manageAccess();
  if (!access) notFound();
  // Departments show while lists are on: lists are what reads them today.
  const departments = listsOn(access.rows)
    ? await getDepartments(access.businessId)
    : null;
  return (
    <ManageView
      modules={modulesToManage(access.rows, access.level)}
      home="/home"
      team="/team"
      shabbatCity={shabbatCityState(access.rows, access.details)}
      payAccess={access.grantsPay}
      departments={
        departments === null
          ? null
          : departments === "notYet"
            ? []
            : departments
                .filter((d) => d.archivedAt === null)
                .map((d) => d.name)
      }
      wording={await currentWording()}
    />
  );
}
