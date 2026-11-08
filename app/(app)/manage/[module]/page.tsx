import {
  type ModuleManifest,
  moduleKeyOf,
  readModuleSettings,
} from "@domain/modules";
import { fieldsFor } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { moduleMetadata } from "../../module-screen";
import { saveModuleSettingsAction } from "../actions";
import { manageAccess, modulesToManage } from "../manage";
import { ModuleSettingsView } from "../module-settings-view";

export async function generateMetadata({
  params,
}: PageProps<"/manage/[module]">): Promise<Metadata> {
  const key = moduleKeyOf((await params).module);
  return key ? moduleMetadata(key) : {};
}

// One module's settings, drawn from what its manifest declares. A module that
// is off, or has nothing the business may change, does not exist here.
export default async function ManageModulePage({
  params,
}: PageProps<"/manage/[module]">) {
  const [access, { module }, wording] = await Promise.all([
    manageAccess(),
    params,
    currentWording(),
  ]);
  const key = moduleKeyOf(module);
  if (
    !access ||
    !key ||
    !modulesToManage(access.rows, access.level).includes(key)
  ) {
    notFound();
  }
  const manifest: ModuleManifest = manifestFor(key);
  return (
    <ModuleSettingsView
      module={key}
      fields={fieldsFor(manifest.settings, access.level)}
      values={
        readModuleSettings(
          manifest,
          access.rows.find((row) => row.key === key)?.settings,
        ) as Record<string, unknown>
      }
      save={saveModuleSettingsAction.bind(null, key)}
      viewOnly={access.viewOnly}
      backHref="/manage"
      wording={wording}
    />
  );
}
