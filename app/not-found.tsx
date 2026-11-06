import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { Compass } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CenteredScreen } from "./centered-screen";

// An address that leads nowhere, or a console page for a business that does
// not exist. Inside the app, (app)/not-found.tsx keeps the frame around it.
export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <CenteredScreen>
      <EmptyState
        icon={<Compass />}
        title={t("notFound.title")}
        body={t("notFound.body")}
      >
        <Button asChild size="lg">
          <Link href="/home">{t("home")}</Link>
        </Button>
      </EmptyState>
    </CenteredScreen>
  );
}
