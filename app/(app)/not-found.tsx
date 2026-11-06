import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { PageBody } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Compass } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Inside the app: a screen that does not exist, or a module that is off for
// the business or above the person's role. The shell stays around it.
export default async function AppNotFound() {
  const t = await getTranslations("app.notFound");
  return (
    <PageBody className={cn("min-h-[70dvh] justify-center", pageGlowClass)}>
      <EmptyState icon={<Compass />} title={t("title")} body={t("body")}>
        <Button asChild size="lg">
          <Link href="/home">{t("home")}</Link>
        </Button>
      </EmptyState>
    </PageBody>
  );
}
