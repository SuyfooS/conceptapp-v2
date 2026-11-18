import type { BusinessDetails } from "@domain/business-details";
import type { ManageReadOnly } from "@domain/manage-access";
import type { ShabbatCity } from "@domain/shabbat";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { type AppWording, translator } from "../wording";
import { BusinessDetailsForm } from "./business-details-form";
import type { SaveSettings } from "./settings-types";
import type { CityShabbat } from "./shabbat-by-city";

/** The business's own details, for its owner and managers. Also on the design demo. */
export function BusinessDetailsView({
  details,
  save,
  readOnly,
  showCity,
  cities,
  backHref,
  wording,
}: {
  details: BusinessDetails;
  save: SaveSettings;
  /** Why nothing here saves, or null when it saves. */
  readOnly: ManageReadOnly;
  showCity: boolean;
  cities: Record<ShabbatCity, CityShabbat>;
  backHref: string;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={t("business.title")}
        subtitle={readOnly ? undefined : t("savesItself")}
      />
      <BusinessDetailsForm
        details={details}
        save={save}
        readOnly={readOnly}
        showCity={showCity}
        cities={cities}
      />
    </PageBody>
  );
}
