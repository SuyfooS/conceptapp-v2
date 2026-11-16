import {
  type ModuleManifest,
  moduleKeyOf,
  readModuleSettings,
} from "@domain/modules";
import { fieldsFor } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { modulesToManage } from "../../../../(app)/manage/manage";
import { ModuleSettingsView } from "../../../../(app)/manage/module-settings-view";
import { baseWording } from "../../../../(app)/wording";
import { demoModuleRows } from "../../data";
import { demoSaveSettings } from "../actions";

export const generateStaticParams = () =>
  modulesToManage(demoModuleRows).map((module) => ({ module }));

type Props = {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ state?: string }>;
};

// The real settings screen with mock settings and a stand-in for saving: what
// changes stays on screen until a reload. Read only, as the roles plan's R7
// draws it, with the line that says why: `?state=view` for someone at view on
// the management page, `?state=module` for someone who edits it without the
// module's own edit (a manager who doesn't build the schedule, on
// /design/shell/manage/scheduling).
export default function ShellManageModule({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ module }, { state }] = await Promise.all([params, searchParams]);
  const key = moduleKeyOf(module);
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
      readOnly={
        state === "view" ? "manage" : state === "module" ? "module" : null
      }
      backHref="/design/shell/manage"
      wording={baseWording}
    />
  );
}
