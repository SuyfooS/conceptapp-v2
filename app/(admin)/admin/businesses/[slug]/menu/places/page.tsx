import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlacesView } from "@/app/(app)/orders/menu/places/places-view";
import { saveTeamPlacesAction } from "../../actions";
import { teamMenuSetup } from "../team-menu";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.orders.places");
  return { title: t("title") };
}

// A business's places set up by the team in the console (waiter mode P2):
// the same screen whoever runs the menu has, back to the business's settings.
export default async function TeamMenuPlacesPage({
  params,
}: PageProps<"/admin/businesses/[slug]/menu/places">) {
  const { slug } = await params;
  const setup = await teamMenuSetup(slug);
  if (!setup) notFound();
  const t = await getTranslations("admin.settings");
  return (
    <PlacesView
      // The team reads no menu version: what the editor saved it keeps, with
      // the ids the save gave back.
      menu={{ places: setup.menu.places, version: 0 }}
      reach={{ edits: true, readOnly: null }}
      save={saveTeamPlacesAction.bind(null, setup.business.id)}
      back={{ href: `/admin/businesses/${slug}/settings`, label: t("title") }}
      eyebrow={setup.business.name}
    />
  );
}
