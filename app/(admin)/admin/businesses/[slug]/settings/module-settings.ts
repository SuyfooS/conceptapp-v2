import {
  type ModuleKey,
  type ModuleManifest,
  type ModuleRow,
  readModuleSettings,
} from "@domain/modules";
import { fieldsFor, type SettingField } from "@domain/settings-form";
import { manifests } from "@modules/registry";

export type TeamModuleSettings = {
  key: ModuleKey;
  enabled: boolean;
  fields: SettingField[];
  values: Record<string, unknown>;
};

/**
 * Every module as the team sees it for one business: on or off, with all its
 * settings, the advanced ones too. A module the team may want later is here
 * while it's off, so it can be set up before anyone sees it.
 */
export function teamModuleSettings(
  rows: readonly ModuleRow[],
): TeamModuleSettings[] {
  return manifests.map((manifest: ModuleManifest) => {
    const row = rows.find((other) => other.key === manifest.key);
    return {
      key: manifest.key,
      enabled: row?.enabled ?? false,
      fields: fieldsFor(manifest.settings, "team"),
      values: readModuleSettings(manifest, row?.settings) as Record<
        string,
        unknown
      >,
    };
  });
}
