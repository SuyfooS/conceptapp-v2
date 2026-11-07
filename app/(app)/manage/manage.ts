import { enabledModules, type ModuleKey } from "@domain/modules";
import { fieldsFor } from "@domain/settings-form";
import { canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import { manifests } from "@modules/registry";
import { currentMember } from "../member";

/**
 * What the signed-in person may do here: owners and managers edit their
 * business's settings. Null for anyone else, who gets the not-found screen.
 */
export async function manageAccess() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership.role)) return null;
  return {
    userId: member.userId,
    businessId: membership.business.id,
    rows: membership.business.modules,
    viewOnly: !canWrite(member.viewing),
  };
}

export type ManageAccess = NonNullable<
  Awaited<ReturnType<typeof manageAccess>>
>;

/** The modules that are on and have something the business itself may change. */
export function modulesToManage(rows: ManageAccess["rows"]): ModuleKey[] {
  const enabled = enabledModules(manifests, rows);
  return manifests
    .filter(
      (manifest) =>
        enabled.includes(manifest.key) &&
        fieldsFor(manifest.settings, "business").length > 0,
    )
    .map((manifest) => manifest.key);
}
