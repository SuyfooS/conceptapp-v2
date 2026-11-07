"use server";

import { setModuleSettings } from "@db/module-settings";
import { type ModuleManifest, moduleKeyOf } from "@domain/modules";
import { checkSettingsChange } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import { refresh } from "next/cache";
import { manageAccess, modulesToManage } from "./manage";
import type { SettingsResult } from "./settings-types";

/**
 * An owner or manager saves some of a module's settings. The screen is not
 * trusted: the change is checked against the module's manifest, for what this
 * person may edit and what's valid, and the database checks who they are.
 */
export async function saveModuleSettingsAction(
  module: string,
  change: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };

  const key = moduleKeyOf(module);
  if (!key || !modulesToManage(access.rows).includes(key)) {
    return { ok: false, failure: "noAccess" };
  }
  const manifest: ModuleManifest = manifestFor(key);
  const stored = access.rows.find((row) => row.key === key)?.settings;
  const checked = checkSettingsChange(manifest, stored, change, "business");
  if (!checked.ok) return { ok: false, failure: checked.problem };

  const result = await setModuleSettings(
    access.userId,
    access.businessId,
    key,
    checked.patch,
  );
  refresh();
  return result.ok
    ? { ok: true }
    : {
        ok: false,
        failure: result.code === "42501" ? "noAccess" : "failed",
      };
}
