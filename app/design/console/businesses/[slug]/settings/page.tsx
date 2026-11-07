import { notFound } from "next/navigation";
import { BusinessSettingsView } from "../../../../../(admin)/admin/businesses/[slug]/settings/business-settings-view";
import { teamModuleSettings } from "../../../../../(admin)/admin/businesses/[slug]/settings/module-settings";
import { demoModuleRows } from "../../../../shell/data";
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
      modules={teamModuleSettings(demoModuleRows)}
      save={demoSaveBusinessSettings}
      setEnabled={demoSetBusinessModule}
    />
  );
}
