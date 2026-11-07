"use server";

import { type ModuleManifest, moduleKeyOf } from "@domain/modules";
import { checkSettingsChange } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import type { SettingsResult } from "../../../(app)/manage/settings-types";

// A stand-in for saving settings on the design demo: the same checks, and
// nothing stored. A reload shows the demo's own values again.
export async function demoSaveSettings(
  module: string,
  change: unknown,
): Promise<SettingsResult> {
  const key = moduleKeyOf(module);
  if (!key) return { ok: false, failure: "noAccess" };
  const manifest: ModuleManifest = manifestFor(key);
  const checked = checkSettingsChange(manifest, {}, change, "business");
  return checked.ok ? { ok: true } : { ok: false, failure: checked.problem };
}
