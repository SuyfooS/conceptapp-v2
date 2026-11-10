import type { BusinessDetails } from "@domain/business-details";
import type { ModuleKey } from "@domain/modules";
import type { ShabbatCity } from "@domain/shabbat";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { BusinessDetailsForm } from "@/app/(app)/manage/business-details-form";
import {
  type DepartmentPeople,
  DepartmentsEditor,
  type EditedDepartment,
  type SaveDepartmentMembers,
  type SaveDepartments,
} from "@/app/(app)/manage/departments-editor";
import { SettingsForm } from "@/app/(app)/manage/settings-form";
import type {
  SaveSettings,
  SettingsResult,
} from "@/app/(app)/manage/settings-types";
import type { CityShabbat } from "@/app/(app)/manage/shabbat-by-city";
import type { TeamModuleSettings } from "./module-settings";
import { ModuleSwitch, type ModuleSwitchResult } from "./module-switch";

/**
 * A business's settings as the ConceptApp team sees them: its own details, then
 * every module with its switch and all its settings, marking those only the team
 * sees. The same forms the business's own people get. Also on /design/console
 * with mock data.
 */
export function BusinessSettingsView({
  name,
  backHref,
  details,
  saveDetails,
  cities,
  modules,
  save,
  setEnabled,
  departments,
  listsHref = null,
}: {
  name: string;
  backHref: string;
  details: BusinessDetails;
  saveDetails: SaveSettings;
  cities: Record<ShabbatCity, CityShabbat>;
  modules: TeamModuleSettings[];
  save: (
    module: ModuleKey,
    change: Record<string, unknown>,
  ) => Promise<SettingsResult>;
  setEnabled: (
    module: ModuleKey,
    enabled: boolean,
  ) => Promise<ModuleSwitchResult>;
  /**
   * The business's departments, edited as its people edit them, while lists
   * are on; null otherwise.
   */
  departments: {
    list: EditedDepartment[];
    people: DepartmentPeople;
    save: SaveDepartments;
    saveMembers: SaveDepartmentMembers;
  } | null;
  /**
   * The business's list templates, edited as its list managers edit them,
   * while lists are on; null otherwise.
   */
  listsHref?: string | null;
}) {
  const t = useTranslations("admin.settings");
  const tm = useTranslations("modules");
  const td = useTranslations("app.manage.departments");
  const tl = useTranslations("app.lists.templates");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: name }}
        title={t("title")}
        subtitle={t("subtitle", { name })}
      />
      <PageSection title={t("details")}>
        <BusinessDetailsForm
          details={details}
          save={saveDetails}
          viewOnly={false}
          showCity
          cities={cities}
          nested
        />
      </PageSection>
      {departments ? (
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5 px-1">
            <h2 className="font-bold text-lg">{td("title")}</h2>
            <p className="text-base text-ink-2">{td("subtitle")}</p>
          </div>
          <DepartmentsEditor
            departments={departments.list}
            people={departments.people}
            disabled={false}
            save={departments.save}
            saveMembers={departments.saveMembers}
          />
        </section>
      ) : null}
      {listsHref ? (
        <PageSection title={t("lists.title")}>
          <ListGroup className="md:max-w-2xl">
            <ListRow
              href={listsHref}
              leading={<ClipboardList />}
              title={tl("title")}
              subtitle={t("lists.row")}
            />
          </ListGroup>
        </PageSection>
      ) : null}
      {modules.map((module) => (
        <PageSection
          key={module.key}
          title={tm(`${module.key}.name`)}
          action={
            <ModuleSwitch
              label={t("on", { module: tm(`${module.key}.name`) })}
              enabled={module.enabled}
              save={setEnabled.bind(null, module.key)}
            />
          }
        >
          {module.fields.length > 0 ? (
            <SettingsForm
              module={module.key}
              fields={module.fields}
              values={module.values}
              save={save.bind(null, module.key)}
              viewOnly={false}
            />
          ) : null}
        </PageSection>
      ))}
    </PageBody>
  );
}
