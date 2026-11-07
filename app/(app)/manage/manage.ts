import type { BusinessDetails } from "@domain/business-details";
import {
  enabledModules,
  type ModuleKey,
  type ModuleRow,
  readModuleSettings,
} from "@domain/modules";
import { fieldsFor } from "@domain/settings-form";
import { shabbatCityOf } from "@domain/shabbat";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import { manifestFor, manifests } from "@modules/registry";
import { currentMember } from "../member";

/**
 * What the signed-in person may do here: owners and managers edit their
 * business's settings and details. Null for anyone else, who gets the
 * not-found screen.
 */
export async function manageAccess() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) return null;
  const { business } = membership;
  const details: BusinessDetails = {
    name: business.name,
    accent: business.accent,
    address: business.address,
    shabbatCity: shabbatCityOf(business.place.shabbatCity),
  };
  return {
    userId: member.userId,
    businessId: business.id,
    details,
    timeZone: business.place.timeZone,
    rows: business.modules,
    viewOnly: !canWrite(member.viewing),
  };
}

export type ManageAccess = NonNullable<
  Awaited<ReturnType<typeof manageAccess>>
>;

/** The modules that are on and have something the business itself may change. */
export function modulesToManage(rows: readonly ModuleRow[]): ModuleKey[] {
  const enabled = enabledModules(manifests, rows);
  return manifests
    .filter(
      (manifest) =>
        enabled.includes(manifest.key) &&
        fieldsFor(manifest.settings, "business").length > 0,
    )
    .map((manifest) => manifest.key);
}

/**
 * Whether Shabbat times matter to the business: its schedule is on and closes
 * on Shabbat. Only then is it asked for a city, so a shop open on Shabbat isn't.
 */
export function closesOnShabbat(rows: readonly ModuleRow[]): boolean {
  if (!enabledModules(manifests, rows).includes("scheduling")) return false;
  const settings = readModuleSettings(
    manifestFor("scheduling"),
    rows.find((row) => row.key === "scheduling")?.settings,
  );
  return settings.closedOnShabbat;
}

/** What /manage says about the business's Shabbat city. */
export function shabbatCityState(
  rows: readonly ModuleRow[],
  details: BusinessDetails,
): "missing" | "chosen" | "notAsked" {
  if (!closesOnShabbat(rows)) return "notAsked";
  return details.shabbatCity ? "chosen" : "missing";
}
