import type { SettingDefaults } from "@domain/activity";
import type { BusinessDetails } from "@domain/business-details";
import {
  type ManageReadOnly,
  manageReach,
  manageReadOnly,
  readsEveryLogArea,
} from "@domain/manage-access";
import {
  enabledModules,
  holdsPermission,
  type ModuleKey,
  type ModuleManifest,
  type ModuleRow,
  permissionInUse,
  readModuleSettings,
  type Viewer,
} from "@domain/modules";
import { canGrantPay, PAY_PERMISSION } from "@domain/payroll-access";
import { changesPermissions } from "@domain/role-access";
import {
  fieldsFor,
  type SettingLevel,
  settingLevelOf,
} from "@domain/settings-form";
import { shabbatCityOf } from "@domain/shabbat";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import { manifestFor, manifests } from "@modules/registry";
import { currentMember } from "../member";

/**
 * What the signed-in person may do here (the roles plan's R7): whoever holds
 * `manage.view` opens the management page and everything on it, and whoever
 * also holds `manage.edit` saves there, a module's own settings only with
 * that module's edit too (`readOnlyFor`); owners also the few settings that
 * are theirs alone (`level`). Managers hold both by default, workers
 * neither, and owners and the team switch them per role. Null for anyone
 * else, who gets the not-found screen. The database checks every write and
 * read again.
 */
export async function manageAccess() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership) return null;
  const viewer: Viewer = { role: membership.role, perms: membership.perms };
  if (!manageReach(viewer)) return null;
  const { business } = membership;
  const details: BusinessDetails = {
    name: business.name,
    accent: business.accent,
    address: business.address,
    shabbatCity: shabbatCityOf(business.place.shabbatCity),
  };
  const viewing = !canWrite(member.viewing);
  return {
    userId: member.userId,
    businessId: business.id,
    details,
    timeZone: business.place.timeZone,
    rows: business.modules,
    viewer,
    viewing,
    /**
     * Why the page's own screens (the business's details, its departments)
     * save nothing, or null when they save; a module's settings ask
     * `readOnlyFor`.
     */
    readOnly: manageReadOnly(viewer, viewing),
    level: settingLevelOf(membership.role),
    /**
     * Who sees pay is the owner's to decide (payroll P3), where a module that
     * is on uses it (`payAccessInUse`).
     */
    grantsPay: canGrantPay(membership.role) && payAccessInUse(business.modules),
    /**
     * What each role does is the owner's to decide (the roles plan's R9;
     * Orel, 15 November 2026, Q5): the page leads to "תפקידים והרשאות".
     */
    changesRoles: changesPermissions(membership.role),
    /**
     * Whether the page leads to the team screen, which opens by its own rule
     * (`canSeeTeam`: team.view, the roles plan's R6).
     */
    seesTeam: canSeeTeam(membership),
    /**
     * Whether the person edits the clock (clock.edit, as the log's policy
     * asks of its clock rows, but of pay holders): only then does the
     * activity log say where the punches are and lead to the team's hours,
     * which open for them alone.
     */
    readsClock: holdsPermission(viewer, "clock.edit"),
    /**
     * Whether the person reads every area's rows of the activity log, so it
     * may say that the settings', the team's and the schedule's changes all
     * show there; else it speaks of their own areas.
     */
    readsEveryArea: readsEveryLogArea(viewer),
  };
}

export type ManageAccess = NonNullable<
  Awaited<ReturnType<typeof manageAccess>>
>;

/** Why a module's settings save nothing for this person, or null when they save. */
export function readOnlyFor(
  access: ManageAccess,
  module: ModuleKey,
): ManageReadOnly {
  return manageReadOnly(access.viewer, access.viewing, module);
}

/**
 * The modules that are on and have something the business itself may change,
 * at this level.
 */
export function modulesToManage(
  rows: readonly ModuleRow[],
  level: SettingLevel = "business",
): ModuleKey[] {
  const enabled = enabledModules(manifests, rows);
  return manifests
    .filter(
      (manifest) =>
        enabled.includes(manifest.key) &&
        fieldsFor(manifest.settings, level).length > 0,
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

/**
 * Whether who sees pay opens anything in the business: a module that is on
 * uses pay access (the time clock's hours for payroll, chat's documents). The
 * console asks the same (`payAccessIn`); where it opens nothing, /manage
 * offers no way to it and its page is not found.
 */
export function payAccessInUse(rows: readonly ModuleRow[]): boolean {
  return permissionInUse(
    manifests,
    enabledModules(manifests, rows),
    PAY_PERMISSION,
  );
}

/**
 * Whether lists are on, which is when the business's departments matter:
 * lists are what reads them today.
 */
export function listsOn(rows: readonly ModuleRow[]): boolean {
  return enabledModules(manifests, rows).includes("lists");
}

/** Each module's settings as a business that never set them has them. */
export function settingDefaults(): SettingDefaults {
  return new Map(
    manifests.map((manifest: ModuleManifest) => [
      manifest.key,
      readModuleSettings(manifest, {}) as Record<string, unknown>,
    ]),
  );
}

/** What /manage says about the business's Shabbat city. */
export function shabbatCityState(
  rows: readonly ModuleRow[],
  details: BusinessDetails,
): "missing" | "chosen" | "notAsked" {
  if (!closesOnShabbat(rows)) return "notAsked";
  return details.shabbatCity ? "chosen" : "missing";
}
