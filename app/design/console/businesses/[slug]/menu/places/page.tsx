import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlacesView } from "../../../../../../(app)/orders/menu/places/places-view";
import { twinPlaces } from "../../../../../order-taking/real-menu";
import { demoSavePlaces } from "../../../../actions";
import { setups } from "../../../../data";

export const generateStaticParams = () =>
  Object.keys(setups).map((slug) => ({ slug }));

// A business's places set up by the team (waiter mode P2): the twin's twelve
// tables, with a stand-in that stores nothing.
export default async function ConsoleMenuPlacesDemo({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const setup = setups[slug];
  if (!setup) notFound();
  const t = await getTranslations("admin.settings");
  return (
    <PlacesView
      menu={{ places: twinPlaces(), version: 0 }}
      reach={{ edits: true, readOnly: null }}
      save={demoSavePlaces}
      back={{
        href: `/design/console/businesses/${slug}/settings`,
        label: t("title"),
      }}
      eyebrow={setup.business.name}
    />
  );
}
