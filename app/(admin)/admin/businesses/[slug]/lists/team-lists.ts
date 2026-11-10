import "server-only";
import { getBusinessSetup } from "@db/admin";
import { getDepartmentsForTeam } from "@db/departments";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { enabledModules, readModuleSettings } from "@domain/modules";
import { platformCan } from "@domain/platform";
import { manifestFor, manifests } from "@modules/registry";
import { getTranslations } from "next-intl/server";
import type { TemplatePaths } from "@/app/(app)/lists/list-types";
import { currentPlatformRole } from "../../../../staff";

/**
 * A business's lists as the team sets them up in the console: its id and
 * name, its departments and the shifts of its scheduling settings, while
 * lists are on for it. Null when the person may not edit businesses, the
 * business doesn't exist, or lists are off there.
 */
export async function teamListsSetup(slug: string) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.edit")) return null;
  const business = await getBusinessSetup(slug);
  if (!business) return null;
  const [rows, departments] = await Promise.all([
    getBusinessModulesForTeam(business.id),
    getDepartmentsForTeam(business.id),
  ]);
  if (!enabledModules(manifests, rows).includes("lists")) return null;
  const scheduling = rows.find((row) => row.key === "scheduling");
  return {
    business,
    departments: departments === "notYet" ? [] : departments.departments,
    shifts: readModuleSettings(manifestFor("scheduling"), scheduling?.settings)
      .shifts,
  };
}

/** The template screens' links inside the console, for this business. */
export async function teamTemplatePaths(slug: string): Promise<TemplatePaths> {
  const t = await getTranslations("admin.settings");
  return {
    list: `/admin/businesses/${slug}/lists`,
    back: { href: `/admin/businesses/${slug}/settings`, label: t("title") },
    // The team isn't a member: it sends nothing.
    send: null,
  };
}
