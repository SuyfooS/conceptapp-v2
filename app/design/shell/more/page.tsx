import { Card, CardText, CardTitle } from "@ui/card";
import { PageBody, PageHeader } from "@ui/page";
import { useTranslations } from "next-intl";

export default function ShellMore() {
  const t = useTranslations("shell");
  return (
    <PageBody>
      <PageHeader title={t("more.title")} subtitle={t("more.subtitle")} />
      <Card tone="raised" padding="lg">
        <CardTitle as="h2">{t("more.placeholder")}</CardTitle>
        <CardText>{t("placeholderText")}</CardText>
      </Card>
    </PageBody>
  );
}
