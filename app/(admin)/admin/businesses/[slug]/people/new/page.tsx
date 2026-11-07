import { getBusinessSetup } from "@db/admin";
import { platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentPlatformRole } from "../../../../../staff";
import { addPersonAction } from "../../actions";
import { AddPersonView } from "./add-person-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.addPerson");
  return { title: t("title") };
}

export default async function AddPersonPage({
  params,
}: PageProps<"/admin/businesses/[slug]/people/new">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "staff.invite")) notFound();
  const { slug } = await params;
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  return (
    <AddPersonView
      name={business.name}
      businessHref={`/admin/businesses/${business.slug}`}
      invite={addPersonAction.bind(null, {
        id: business.id,
        slug: business.slug,
      })}
    />
  );
}
