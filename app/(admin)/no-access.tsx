import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CenteredScreen } from "@/app/centered-screen";

/**
 * Signed in but not on the ConceptApp team: the console does not exist for
 * them. Also rendered on /design/screens/no-access.
 */
export async function NoAccessScreen({ homeHref }: { homeHref: string }) {
  const t = await getTranslations("admin.noAccess");
  return (
    <CenteredScreen>
      <EmptyState icon={<LockKeyhole />} title={t("title")} body={t("body")}>
        <Button asChild variant="secondary" size="lg">
          <Link href={homeHref}>{t("home")}</Link>
        </Button>
      </EmptyState>
    </CenteredScreen>
  );
}
