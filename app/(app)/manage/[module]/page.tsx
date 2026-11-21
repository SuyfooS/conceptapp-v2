import { getDepartments } from "@db/departments";
import { getOrderFloor } from "@db/orders";
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
import { manageAccess, modulesToManage, readOnlyFor } from "../manage";
import { ModuleSettingsView } from "../module-settings-view";
import { OrderFixesLine } from "../order-fixes-line";

/**
 * Today's fixes to the orders, for whoever runs them (or views as such):
 * null for anyone else, while the module is off, off a shift or before the
 * migration, and when the read fails, so the settings always draw.
 */
async function orderFixesToday(businessId: string) {
  try {
    const floor = await getOrderFloor(businessId);
    return typeof floor === "object" && "fixes" in floor ? floor.fixes : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/manage/[module]">): Promise<Metadata> {
  const key = moduleKeyOf((await params).module);
  return key ? moduleMetadata(key) : {};
}

// One module's settings, drawn from what its manifest declares, for whoever
// sees the management page, saved by whoever edits it and the module too. A
// module that is off, or has nothing the business may change, does not exist
// here. Taking orders says today's fixes above them (P5).
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
  const fields = fieldsFor(manifest.settings, access.level);
  // A setting chosen from the departments (who takes orders): the live ones.
  const [departments, fixes] = await Promise.all([
    fields.some(
      (field) => field.kind === "editor" && field.editor === "departments",
    )
      ? getDepartments(access.businessId)
      : [],
    key === "order_taking" ? orderFixesToday(access.businessId) : null,
  ]);
  return (
    <ModuleSettingsView
      module={key}
      fields={fields}
      values={
        readModuleSettings(
          manifest,
          access.rows.find((row) => row.key === key)?.settings,
        ) as Record<string, unknown>
      }
      save={saveModuleSettingsAction.bind(null, key)}
      readOnly={readOnlyFor(access, key)}
      backHref="/manage"
      wording={wording}
      summary={
        fixes ? (
          <OrderFixesLine
            fixes={fixes}
            activityHref="/manage/activity"
            wording={wording}
          />
        ) : undefined
      }
      departments={
        departments === "notYet"
          ? []
          : departments
              .filter((d) => d.archivedAt === null)
              .map((d) => ({ key: d.key, name: d.name }))
      }
    />
  );
}
