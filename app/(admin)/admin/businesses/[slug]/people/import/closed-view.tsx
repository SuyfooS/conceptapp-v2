import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { UsersRound } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * The console's import for a business that takes no invites: a demo, which
 * anyone may enter and reset, so nobody real is ever invited to it (#80).
 * No form, and the way back. The database refuses an import there anyway
 * (55000). Also rendered on /design/console.
 */
export async function ConsoleImportClosed({
  name,
  businessHref,
}: {
  name: string;
  businessHref: string;
}) {
  const t = await getTranslations("admin");
  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: businessHref, label: name }}
        title={t("peopleImport.title")}
      />
      <EmptyState
        icon={<UsersRound />}
        headingLevel="h2"
        title={t("peopleImport.closed.title")}
        body={t("setup.invite.errors.demo")}
      >
        <Button asChild variant="secondary" size="lg">
          <Link href={businessHref}>
            {t("peopleImport.done.toBusiness", { name })}
          </Link>
        </Button>
      </EmptyState>
    </PageBody>
  );
}
