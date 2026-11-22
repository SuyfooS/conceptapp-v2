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
import { OrderFixesLine } from "../../../../(app)/manage/order-fixes-line";
import { baseWording } from "../../../../(app)/wording";
import { demoModuleRows } from "../../data";
import { demoSaveSettings } from "../actions";

// As the owner reads them: the hiring file's are an owner's alone (H5b).
export const generateStaticParams = () =>
  modulesToManage(demoModuleRows, "owner").map((module) => ({ module }));

type Props = {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ state?: string }>;
};

// The real settings screen with mock settings and a stand-in for saving: what
// changes stays on screen until a reload. Read only, as the roles plan's R7
// draws it, with the line that says why: `?state=view` for someone at view on
// the management page, `?state=module` for someone who edits it without the
// module's own edit (a manager who doesn't build the schedule, on
// /design/shell/manage/scheduling). Taking orders says the day's fixes above
// its settings, as an owner reads them (P5). The hiring file's are drawn as
// its owner reads them, its link, phone and deductions file typed left to
// right (H5b).
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
  if (!key || !modulesToManage(demoModuleRows, "owner").includes(key)) {
    notFound();
  }
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
      summary={
        key === "order_taking" ? (
          <OrderFixesLine
            fixes={{ takenBack: 3, cancelled: 2, comped: 1 }}
            activityHref="/design/shell/manage/activity"
            wording={baseWording}
          />
        ) : undefined
      }
    />
  );
}
