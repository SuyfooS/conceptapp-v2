import {
  type ModuleManifest,
  moduleKeyOf,
  readModuleSettings,
} from "@domain/modules";
import { fieldsFor } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import { notFound } from "next/navigation";
import { modulesToManage } from "../../../../(app)/manage/manage";
import { ModuleSettingsView } from "../../../../(app)/manage/module-settings-view";
import { baseWording } from "../../../../(app)/wording";
import { demoModuleRows } from "../../data";
import { demoSaveSettings } from "../actions";

export const generateStaticParams = () =>
  modulesToManage(demoModuleRows).map((module) => ({ module }));

// The real settings screen with mock settings and a stand-in for saving: what
// changes stays on screen until a reload.
export default async function ShellManageModule({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const key = moduleKeyOf((await params).module);
  if (!key || !modulesToManage(demoModuleRows).includes(key)) notFound();
  const manifest: ModuleManifest = manifestFor(key);
  return (
    <ModuleSettingsView
      module={key}
      fields={fieldsFor(manifest.settings, "owner")}
      values={
        readModuleSettings(
          manifest,
          demoModuleRows.find((row) => row.key === key)?.settings,
        ) as Record<string, unknown>
      }
      save={demoSaveSettings.bind(null, key)}
      viewOnly={false}
      backHref="/design/shell/manage"
      wording={baseWording}
    />
  );
}
