import { getBusinessSetup } from "@db/admin";
import { getBusinessDetailsForTeam } from "@db/business-details";
import { getDepartmentsForTeam } from "@db/departments";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { enabledModules } from "@domain/modules";
import { platformCan } from "@domain/platform";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { shabbatByCity } from "@/app/(app)/manage/shabbat-by-city";
import { currentPlatformRole } from "../../../../staff";
import {
  saveBusinessSettingsAction,
  saveTeamBusinessDetailsAction,
  saveTeamDepartmentMembersAction,
  saveTeamDepartmentsAction,
  setBusinessModuleAction,
} from "../actions";
import { BusinessSettingsView } from "./business-settings-view";
import { teamModuleSettings } from "./module-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.settings");
  return { title: t("title") };
}

export default async function BusinessSettingsPage({
  params,
}: PageProps<"/admin/businesses/[slug]/settings">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.edit")) notFound();
  const { slug } = await params;
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  const [rows, own] = await Promise.all([
    getBusinessModulesForTeam(business.id),
    getBusinessDetailsForTeam(business.id),
  ]);
  if (!own) notFound();
  // Departments while lists are on, as on the business's own /manage.
  const departments = enabledModules(manifests, rows).includes("lists")
    ? await getDepartmentsForTeam(business.id)
    : null;
  return (
    <BusinessSettingsView
      name={business.name}
      backHref={`/admin/businesses/${slug}`}
      details={own.details}
      saveDetails={saveTeamBusinessDetailsAction.bind(null, business.id)}
      cities={shabbatByCity(new Date(), own.timeZone)}
      modules={teamModuleSettings(rows)}
      save={saveBusinessSettingsAction.bind(null, business.id)}
      setEnabled={setBusinessModuleAction.bind(null, business.id)}
      departments={
        departments && departments !== "notYet"
          ? {
              list: departments.departments,
              people: departments.people,
              save: saveTeamDepartmentsAction.bind(null, business.id),
              saveMembers: saveTeamDepartmentMembersAction.bind(
                null,
                business.id,
              ),
            }
          : null
      }
    />
  );
}
