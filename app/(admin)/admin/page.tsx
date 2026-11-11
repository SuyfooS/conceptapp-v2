import { listBusinesses } from "@db/admin";
import { getStorageUse } from "@db/chat-files";
import { displayIsraeliMobile } from "@domain/phone";
import { platformCan } from "@domain/platform";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentMember } from "../../(app)/member";
import { signOut } from "../../(auth)/actions";
import { currentPlatformRole } from "../staff";
import { BusinessesView } from "./businesses-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.businesses");
  return { title: t("metaTitle") };
}

export default async function BusinessesPage() {
  const role = await currentPlatformRole();
  // The layout already shows the no-access screen; this keeps the list
  // from being read for anyone off the team.
  if (!role || !platformCan(role, "businesses.read")) notFound();
  const [businesses, member, t, storage] = await Promise.all([
    listBusinesses(),
    currentMember(),
    getTranslations("admin.roles"),
    // Sizes only (public.admin_storage refuses anyone off the team).
    getStorageUse(),
  ]);
  const phone = member?.phone ? displayIsraeliMobile(member.phone) : "";

  return (
    <BusinessesView
      businesses={businesses}
      canCreate={platformCan(role, "businesses.create")}
      basePath="/admin"
      account={{ name: member?.name ?? phone, role: t(role) }}
      signOut={signOut}
      storage={storage}
    />
  );
}
