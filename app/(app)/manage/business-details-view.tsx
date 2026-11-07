import type { BusinessDetails } from "@domain/business-details";
import type { ShabbatCity } from "@domain/shabbat";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import { BusinessDetailsForm } from "./business-details-form";
import type { SaveSettings } from "./settings-types";
import type { CityShabbat } from "./shabbat-by-city";

/** The business's own details, for its owner and managers. Also on the design demo. */
export function BusinessDetailsView({
  details,
  save,
  viewOnly,
  showCity,
  cities,
  backHref,
}: {
  details: BusinessDetails;
  save: SaveSettings;
  viewOnly: boolean;
  showCity: boolean;
  cities: Record<ShabbatCity, CityShabbat>;
  backHref: string;
}) {
  const t = useTranslations("app.manage");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: backHref, label: t("title") }}
        title={t("business.title")}
        subtitle={t("savesItself")}
      />
      <BusinessDetailsForm
        details={details}
        save={save}
        viewOnly={viewOnly}
        showCity={showCity}
        cities={cities}
      />
    </PageBody>
  );
}
