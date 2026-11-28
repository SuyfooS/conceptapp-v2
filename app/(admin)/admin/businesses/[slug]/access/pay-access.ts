import "server-only";
import { getBusinessModulesForTeam } from "@db/module-settings";
import {
  enabledModules,
  type ModuleRow,
  permissionInUse,
} from "@domain/modules";
import { PAY_PERMISSION } from "@domain/payroll-access";
import { manifests } from "@modules/registry";

/**
 * Whether who sees pay applies in a business, as the console reads it: a
 * module that is on uses pay access (the time clock's hours for payroll,
 * chat's documents), and whether documents are on, which happens wherever
 * chat is (private.documents_on). Null where it opens nothing: the business's
 * page offers no way there, its page is not found, and its actions write
 * nothing, for a screen drawn before the time clock and chat went off or a
 * call with no screen at all. An admin read: callers check first that the
 * person is on the team (`consolePayAccess`).
 */
export async function payAccessIn(
  businessId: string,
): Promise<{ documents: boolean } | null> {
  return payAccessFrom(await getBusinessModulesForTeam(businessId));
}

/**
 * The same, from the business's module rows already read: the business's
 * page reads them once for this and for its checklist.
 */
export function payAccessFrom(
  rows: readonly ModuleRow[],
): { documents: boolean } | null {
  const enabled = enabledModules(manifests, rows);
  if (!permissionInUse(manifests, enabled, PAY_PERMISSION)) return null;
  return { documents: enabled.includes("chat") };
}
