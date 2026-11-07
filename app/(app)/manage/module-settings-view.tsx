import type { ModuleKey } from "@domain/modules";
import type { SettingField } from "@domain/settings-form";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import { SettingsForm } from "./settings-form";
import type { SaveSettings } from "./settings-types";

/** One module's settings, for a business's own people. Also on the design demo. */
export function ModuleSettingsView({
  module,
  fields,
  values,
  save,
  viewOnly,
  backHref,
}: {
  module: ModuleKey;
  fields: SettingField[];
  values: Record<string, unknown>;
  save: SaveSettings;
  viewOnly: boolean;
  backHref: string;
}) {
  const t = useTranslations("app.manage");
  const tm = useTranslations("modules");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={tm(`${module}.name`)}
        subtitle={t("savesItself")}
      />
      <SettingsForm
        module={module}
        fields={fields}
        values={values}
        save={save}
        viewOnly={viewOnly}
      />
    </PageBody>
  );
}
