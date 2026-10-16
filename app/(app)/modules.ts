import { getBusinessModules } from "@db/modules";
import { enabledModules, type ModuleKey } from "@domain/modules";
import { manifests } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "./member";

/**
 * The modules that are on for the signed-in person's business, read once
 * per request. Empty when they are not in a business.
 */
export const currentModules = cache(async (): Promise<ModuleKey[]> => {
  const member = await currentMember();
  if (!member?.membership) return [];
  const rows = await getBusinessModules(member.membership.business.id);
  return enabledModules(manifests, rows);
});
