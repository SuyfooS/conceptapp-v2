import type { ModuleKey } from "@domain/modules";
import type { SettingField } from "@domain/settings-form";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { type AppWording, translator } from "../wording";
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
  wording,
}: {
  module: ModuleKey;
  fields: SettingField[];
  values: Record<string, unknown>;
  save: SaveSettings;
  viewOnly: boolean;
  backHref: string;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage");
  const tm = translator(wording, "modules");
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
