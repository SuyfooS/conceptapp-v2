import { platformCan } from "@domain/platform";
import { PageBody, PageHeader } from "@ui/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentPlatformRole } from "../../staff";
import { NewBusinessForm } from "./new-business-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.newBusiness");
  return { title: t("metaTitle") };
}

// The new-business wizard: template, details, colour, then the business is
// opened in one transaction. Staff list and checklist follow (chunk 1c-3).
export default async function NewBusinessPage() {
  const role = await currentPlatformRole();
  if (!platformCan(role, "businesses.create")) notFound();
  const t = await getTranslations("admin.newBusiness");

  return (
    <PageBody className="max-w-5xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <NewBusinessForm />
    </PageBody>
  );
}
