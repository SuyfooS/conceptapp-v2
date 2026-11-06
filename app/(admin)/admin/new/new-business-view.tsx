import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { getTranslations } from "next-intl/server";
import { NewBusinessForm } from "./new-business-form";

/**
 * The new-business wizard's page. Also rendered, with a stand-in for opening
 * the business, on /design/console/new.
 */
export async function NewBusinessView({
  listHref,
  create,
}: {
  listHref: string;
  create: Parameters<typeof NewBusinessForm>[0]["create"];
}) {
  const t = await getTranslations("admin");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: listHref, label: t("setup.back") }}
        title={t("newBusiness.title")}
      />
      <NewBusinessForm create={create} />
    </PageBody>
  );
}
