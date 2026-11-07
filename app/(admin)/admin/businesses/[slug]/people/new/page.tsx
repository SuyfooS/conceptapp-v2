import { getBusinessSetup } from "@db/admin";
import { ROLES } from "@domain/modules";
import { platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { currentPlatformRole } from "../../../../../staff";
import { addPersonAction } from "../../actions";
import { AddPersonView } from "./add-person-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.addPerson");
  return { title: t("title") };
}

export default async function AddPersonPage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]/people/new">) {
  const role = await currentPlatformRole();
  if (!platformCan(role, "staff.invite")) notFound();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  // "Invite the owners" on the checklist opens the form on owner.
  const start = z.enum(ROLES).safeParse(query.role);
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  return (
    <AddPersonView
      name={business.name}
      businessHref={`/admin/businesses/${business.slug}`}
      defaultRole={start.success ? start.data : undefined}
      invite={addPersonAction.bind(null, {
        id: business.id,
        slug: business.slug,
      })}
    />
  );
}
