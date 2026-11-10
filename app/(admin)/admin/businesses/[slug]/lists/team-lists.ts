import "server-only";
import { getBusinessSetup } from "@db/admin";
import { getDepartmentsForTeam } from "@db/departments";
import { getBusinessPlaceForTeam, nextListOpenings } from "@db/lists";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { enabledModules, readModuleSettings } from "@domain/modules";
import { platformCan } from "@domain/platform";
import { manifestFor, manifests } from "@modules/registry";
import { getTranslations } from "next-intl/server";
import type { EditorTimes, TemplatePaths } from "@/app/(app)/lists/list-types";
import { editorTimes } from "@/app/(app)/lists/templates/editor-times";
import { closesOnShabbat } from "@/app/(app)/manage/manage";
import { currentPlatformRole } from "../../../../staff";

/**
 * A business's lists as the team sets them up in the console: its id and
 * name, its departments and the shifts of its scheduling settings, while
 * lists are on for it, and what its times are worked out with (its zone, its
 * Shabbat, its people; the team reads no published shifts). Null when the person may not edit businesses, the
 * business doesn't exist, or lists are off there.
 */
export async function teamListsSetup(slug: string) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.edit")) return null;
  const business = await getBusinessSetup(slug);
  if (!business) return null;
  const [rows, departments, place] = await Promise.all([
    getBusinessModulesForTeam(business.id),
    getDepartmentsForTeam(business.id),
    getBusinessPlaceForTeam(business.id),
  ]);
  if (!enabledModules(manifests, rows).includes("lists") || !place) {
    return null;
  }
  const scheduling = rows.find((row) => row.key === "scheduling");
  const closes = closesOnShabbat(rows);
  const people = departments === "notYet" ? [] : departments.people;
  return {
    business,
    departments: departments === "notYet" ? [] : departments.departments,
    shifts: readModuleSettings(manifestFor("scheduling"), scheduling?.settings)
      .shifts,
    /** What a template's times are worked out with, with its next openings. */
    times: async (
      staffId: string,
      templateId: string | null,
    ): Promise<EditorTimes> => {
      const now = new Date();
      return editorTimes({
        now,
        place,
        closesOnShabbat: closes,
        shifts: [],
        people,
        openings:
          templateId === null
            ? {}
            : await nextListOpenings(staffId, templateId, now),
      });
    },
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
