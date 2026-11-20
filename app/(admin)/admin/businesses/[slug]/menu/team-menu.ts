import "server-only";
import { getBusinessSetup } from "@db/admin";
import { getDepartmentsForTeam } from "@db/departments";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { getMenuForTeam } from "@db/order-taking";
import { platformCan } from "@domain/platform";
import { menuOn } from "@/app/(app)/manage/manage";
import { currentPlatformRole } from "../../../../staff";

/**
 * A business's menu as the team sets it up in the console (waiter mode P2):
 * its id and name, its menu and places as the phones read them, and its live
 * departments, while taking orders is on for it. Null when the person may
 * not edit businesses, the business doesn't exist, or taking orders is off
 * there. The team is no member, so all of it is read with the secret key.
 */
export async function teamMenuSetup(slug: string) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.edit")) return null;
  const business = await getBusinessSetup(slug);
  if (!business) return null;
  const [rows, menu, departments] = await Promise.all([
    getBusinessModulesForTeam(business.id),
    getMenuForTeam(business.id),
    getDepartmentsForTeam(business.id),
  ]);
  if (!menuOn(rows)) return null;
  return {
    business,
    menu: menu === "notYet" ? { categories: [], items: [], places: [] } : menu,
    departments: (departments === "notYet" ? [] : departments.departments).map(
      (d) => ({ id: d.id, name: d.name, live: true }),
    ),
  };
}
