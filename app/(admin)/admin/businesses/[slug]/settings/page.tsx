import { getBusinessSetup } from "@db/admin";
import { getBusinessDetailsForTeam } from "@db/business-details";
import { getDepartmentsForTeam } from "@db/departments";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { getMenuForTeam } from "@db/order-taking";
import { enabledModules } from "@domain/modules";
import { itemsByDepartment } from "@domain/order-taking";
import { platformCan } from "@domain/platform";
import { manifests } from "@modules/registry";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { departmentsOn, menuOn } from "@/app/(app)/manage/manage";
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
  // Departments while lists or taking orders are on, and the list templates
  // while lists are, as on the business's own /manage and /lists; the menu's
  // import and places while taking orders is on (waiter mode P2).
  const lists = enabledModules(manifests, rows).includes("lists");
  const orders = menuOn(rows);
  const [departments, menu] = await Promise.all([
    departmentsOn(rows) ? getDepartmentsForTeam(business.id) : null,
    orders ? getMenuForTeam(business.id) : null,
  ]);
  const read = menu !== null && menu !== "notYet" ? menu : null;
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
              on: { lists, menu: orders },
              itemsByDepartment: read ? itemsByDepartment(read) : undefined,
            }
          : null
      }
      listsHref={lists ? `/admin/businesses/${slug}/lists` : null}
      menu={
        orders
          ? {
              importHref: `/admin/businesses/${slug}/menu`,
              placesHref: `/admin/businesses/${slug}/menu/places`,
              places: read?.places.length ?? 0,
            }
          : null
      }
    />
  );
}
