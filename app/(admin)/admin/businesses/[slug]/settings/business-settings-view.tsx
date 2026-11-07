import type { BusinessDetails } from "@domain/business-details";
import type { ModuleKey } from "@domain/modules";
import type { ShabbatCity } from "@domain/shabbat";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import { BusinessDetailsForm } from "@/app/(app)/manage/business-details-form";
import { SettingsForm } from "@/app/(app)/manage/settings-form";
import type {
  SaveSettings,
  SettingsResult,
} from "@/app/(app)/manage/settings-types";
import type { CityShabbat } from "@/app/(app)/manage/shabbat-by-city";
import type { TeamModuleSettings } from "./module-settings";
import { ModuleSwitch } from "./module-switch";

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
  setEnabled: (module: ModuleKey, enabled: boolean) => Promise<SettingsResult>;
}) {
  const t = useTranslations("admin.settings");
  const tm = useTranslations("modules");
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
