import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { notFound } from "next/navigation";
import { BusinessSettingsView } from "../../../../../(admin)/admin/businesses/[slug]/settings/business-settings-view";
import { teamModuleSettings } from "../../../../../(admin)/admin/businesses/[slug]/settings/module-settings";
import { shabbatByCity } from "../../../../../(app)/manage/shabbat-by-city";
import { demoModuleRows, demoNow } from "../../../../shell/data";
import { demoSaveBusinessDetails } from "../../../../shell/manage/actions";
import {
  demoSaveBusinessSettings,
  demoSetBusinessModule,
} from "../../../actions";
import { setups } from "../../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

// The team's view of a business's settings, with mock settings and stand-in
// actions. The console itself can't be reached on the deployed app's door.
export default async function ConsoleSettingsDemo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const setup = setups[slug];
  if (!setup) notFound();
  return (
    <BusinessSettingsView
      name={setup.business.name}
      backHref={`/design/console/businesses/${slug}`}
      details={{
        name: setup.business.name,
        accent: setup.business.accent,
        address: setup.business.address,
        shabbatCity: null,
      }}
      saveDetails={demoSaveBusinessDetails}
      cities={shabbatByCity(demoNow, ISRAEL_TIME_ZONE)}
      modules={teamModuleSettings(demoModuleRows)}
      save={demoSaveBusinessSettings}
      setEnabled={demoSetBusinessModule}
    />
  );
}
