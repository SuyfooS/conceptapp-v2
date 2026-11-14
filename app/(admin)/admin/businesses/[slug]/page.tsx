import { getBusinessSetup } from "@db/admin";
import { consolePayAccess, platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentPlatformRole } from "../../../staff";
import { payAccessIn } from "./access/pay-access";
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
  // Who sees pay, where a module that is on uses it (its page says why).
  const payAccess =
    consolePayAccess(role) !== null &&
    (await payAccessIn(business.id)) !== null;

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
      wordingHref={
        platformCan(role, "businesses.edit")
          ? `/admin/businesses/${business.slug}/wording`
          : null
      }
      addHref={
        platformCan(role, "staff.invite")
          ? `/admin/businesses/${business.slug}/people/new`
          : null
      }
      accessHref={
        payAccess ? `/admin/businesses/${business.slug}/access` : null
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
