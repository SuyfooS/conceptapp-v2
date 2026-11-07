import { getBusinessSetup } from "@db/admin";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentPlatformRole } from "../../../../staff";
import {
  saveBusinessSettingsAction,
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
  const rows = await getBusinessModulesForTeam(business.id);
  return (
    <BusinessSettingsView
      name={business.name}
      backHref={`/admin/businesses/${slug}`}
      modules={teamModuleSettings(rows)}
      save={saveBusinessSettingsAction.bind(null, business.id)}
      setEnabled={setBusinessModuleAction.bind(null, business.id)}
    />
  );
}
