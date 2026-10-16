import { Button } from "@ui/button";
import { Card, CardText } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

// Inside the app: a screen that does not exist, or a module that is off for
// the business or above the person's role. The shell stays around it.
export default async function AppNotFound() {
  const t = await getTranslations("app.notFound");
  return (
    <PageBody>
      <PageHeader title={t("title")} />
      <Card
        tone="flat"
        padding="lg"
        className="flex flex-col items-start gap-4 md:max-w-xl"
      >
        <CardText>{t("body")}</CardText>
        <Button asChild variant="secondary">
          <Link href="/home">{t("home")}</Link>
        </Button>
      </Card>
    </PageBody>
  );
}
