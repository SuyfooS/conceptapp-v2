import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MenuImportView } from "@/app/(app)/orders/menu/import/import-view";
import { importTeamMenuAction } from "../actions";
import { teamMenuSetup } from "./team-menu";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.orders.import");
  return { title: t("title") };
}

// A business's menu copied in by the team in the console (waiter mode P2):
// the same screen whoever runs the menu has, back to the business's settings,
// where its departments are too (the team has no menu screen of its own).
export default async function TeamMenuImportPage({
  params,
}: PageProps<"/admin/businesses/[slug]/menu">) {
  const { slug } = await params;
  const setup = await teamMenuSetup(slug);
  if (!setup) notFound();
  const t = await getTranslations("admin.settings");
  const settings = `/admin/businesses/${slug}/settings`;
  return (
    <MenuImportView
      existing={setup.menu}
      departments={setup.departments}
      importMenu={importTeamMenuAction.bind(null, setup.business.id)}
      paths={{
        back: { href: settings, label: t("title") },
        done: { href: settings, label: t("title") },
        departments: settings,
      }}
      eyebrow={setup.business.name}
    />
  );
}
