import { getBusinessSetup } from "@db/admin";
import { platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentPlatformRole } from "../../../staff";
import { inviteLinkAction, viewAsAction } from "./actions";
import { BusinessView } from "./business-view";

export async function generateMetadata({
  params,
}: PageProps<"/admin/businesses/[slug]">): Promise<Metadata> {
  // The slug, not the name: reading the business needs the signed-in
  // person, and the page itself checks they are on the team.
  const { slug } = await params;
  return { title: slug };
}

export default async function BusinessSetupPage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.read")) notFound();
  const [{ slug }, { created, view }] = await Promise.all([
    params,
    searchParams,
  ]);
  const business = await getBusinessSetup(slug);
  if (!business) notFound();

  return (
    <BusinessView
      business={business}
      listHref="/admin"
      created={Boolean(created)}
      viewFailed={view === "failed"}
      settingsHref={
        platformCan(role, "businesses.edit")
          ? `/admin/businesses/${business.slug}/settings`
          : null
      }
      viewAs={
        platformCan(role, "businesses.view_as")
          ? viewAsAction.bind(null, { id: business.id, slug: business.slug })
          : null
      }
      issue={inviteLinkAction}
    />
  );
}
